import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  type ApplicationRecord,
  type CanonicalSourceMapping,
  canonicalJobIdSchema,
  canonicalRebuildRequestSchema,
  feedRecommendationFilterSchema,
  feedRemoteFilterSchema,
  feedSortSchema,
  feedSourceFilterSchema,
  jobsContractVersion,
  type FeedJobCard,
  type FeedQuery,
  type ReminderTask,
  type SourceJobSummary,
  type TrackerState,
  type UserPreferences,
} from '@job-hunter/shared';

import { HttpError } from '../../http/http-errors.js';
import { readJsonBody, sendJson } from '../../http/json.js';
import type { AiService } from '../ai/service.js';
import type { ApplicationService } from '../applications/service.js';
import type { AuthProfileService } from '../auth-profile/service.js';
import type { ConnectorService } from '../connectors/service.js';
import type { ReminderService } from '../reminders/service.js';
import type { CanonicalJobsService } from './service.js';
import { resolveFeedNextAction } from '../tracker/next-action.js';
import type { TrackerService } from '../tracker/service.js';

export interface CanonicalJobRoutesDependencies {
  authProfileService: AuthProfileService;
  canonicalJobsService: CanonicalJobsService;
  aiService: AiService;
  trackerService: TrackerService;
  connectorService: ConnectorService;
  applicationService: ApplicationService;
  reminderService: ReminderService;
}

const defaultFeedQuery: FeedQuery = {
  q: '',
  recommendation: 'all',
  remote: 'any',
  source: 'any',
  sort: 'fit',
  includeHidden: true,
  limit: undefined,
};

const mapValidationDetails = (
  issues: Array<{ code: string; message: string; path: (string | number)[] }>,
): Array<{ code: string; message: string; path: string }> =>
  issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path.join('.'),
  }));

const parseBody = async <T>(
  req: IncomingMessage,
  schema: {
    safeParse: (value: unknown) =>
      | { success: true; data: T }
      | {
          success: false;
          error: {
            issues: Array<{
              code: string;
              message: string;
              path: (string | number)[];
            }>;
          };
        };
  },
): Promise<T> => {
  const body = await readJsonBody(req);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(400, 'invalid_request_body', {
      issues: mapValidationDetails(parsed.error.issues),
    });
  }

  return parsed.data;
};

const requireAccessToken = (req: IncomingMessage): string => {
  const rawAuthorization = req.headers.authorization;
  if (!rawAuthorization) {
    throw new HttpError(401, 'missing_access_token');
  }

  if (!rawAuthorization.startsWith('Bearer ')) {
    throw new HttpError(401, 'invalid_authorization_header');
  }

  const token = rawAuthorization.slice('Bearer '.length).trim();
  if (token.length === 0) {
    throw new HttpError(401, 'missing_access_token');
  }

  return token;
};

const getUrl = (req: IncomingMessage): URL =>
  new URL(req.url ?? '/', 'http://localhost');

const parseLimitQuery = (rawLimit: string | null): number | undefined => {
  if (rawLimit === null) {
    return undefined;
  }

  if (!/^\d+$/.test(rawLimit)) {
    throw new HttpError(400, 'invalid_canonical_job_limit', {
      limit: rawLimit,
    });
  }

  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit)) {
    throw new HttpError(400, 'invalid_canonical_job_limit', {
      limit: rawLimit,
    });
  }

  if (limit < 1) {
    throw new HttpError(400, 'invalid_canonical_job_limit', {
      limit: rawLimit,
    });
  }

  return limit;
};

const parseCanonicalPath = (pathname: string): string | null => {
  const prefix = '/v1/canonical-jobs/';
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const pathParam = pathname.slice(prefix.length);
  if (!pathParam || pathParam.includes('/')) {
    return null;
  }

  return pathParam;
};

const parseCanonicalDedupeEventsPath = (pathname: string): string | null => {
  const prefix = '/v1/canonical-jobs/';
  const suffix = '/dedupe-events';
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) {
    return null;
  }

  const pathParam = pathname.slice(prefix.length, -suffix.length);
  if (!pathParam || pathParam.includes('/')) {
    return null;
  }

  return pathParam;
};

const parseFeedDetailPath = (pathname: string): string | null => {
  const prefix = '/v1/feed/';
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const pathParam = pathname.slice(prefix.length);
  if (!pathParam || pathParam.includes('/')) {
    return null;
  }

  return pathParam;
};

const parseFeedQuery = (requestUrl: URL): FeedQuery => {
  const recommendationRaw = requestUrl.searchParams.get('recommendation');
  const remoteRaw = requestUrl.searchParams.get('remote');
  const sourceRaw = requestUrl.searchParams.get('source');
  const sortRaw = requestUrl.searchParams.get('sort');
  const includeHiddenRaw = requestUrl.searchParams.get('includeHidden');

  const recommendation = feedRecommendationFilterSchema.safeParse(recommendationRaw);
  const remote = feedRemoteFilterSchema.safeParse(remoteRaw);
  const source = feedSourceFilterSchema.safeParse(sourceRaw);
  const sort = feedSortSchema.safeParse(sortRaw);

  const parsedLimit = parseLimitQuery(requestUrl.searchParams.get('limit'));
  return {
    q: (requestUrl.searchParams.get('q') ?? '').trim().slice(0, 120),
    recommendation: recommendation.success
      ? recommendation.data
      : defaultFeedQuery.recommendation,
    remote: remote.success ? remote.data : defaultFeedQuery.remote,
    source: source.success ? source.data : defaultFeedQuery.source,
    sort: sort.success ? sort.data : defaultFeedQuery.sort,
    includeHidden:
      includeHiddenRaw === '1'
        ? true
        : includeHiddenRaw === '0'
          ? false
          : defaultFeedQuery.includeHidden,
    limit: parsedLimit,
  };
};

const matchesRemotePreference = (
  remoteType: string,
  preference: UserPreferences['remotePreference'],
): boolean => {
  if (preference === 'flexible') {
    return remoteType === 'remote' || remoteType === 'hybrid' || remoteType === 'onsite';
  }

  return remoteType === preference;
};

const matchesRemoteFilter = (
  remoteType: FeedJobCard['job']['remoteType'],
  filter: FeedQuery['remote'],
  preferences: UserPreferences,
): boolean => {
  if (filter === 'any') {
    return true;
  }

  if (filter === 'aligned') {
    return matchesRemotePreference(remoteType, preferences.remotePreference);
  }

  return remoteType === filter;
};

const isHiddenByPreferences = (
  item: FeedJobCard,
  preferences: UserPreferences,
): boolean => {
  const company = item.job.canonicalCompanyName.toLowerCase();
  const title = item.job.canonicalTitle.toLowerCase();

  const hiddenCompanyHit = preferences.hiddenCompanies.some((value) =>
    company.includes(value.toLowerCase()),
  );
  if (hiddenCompanyHit) {
    return true;
  }

  return preferences.hiddenTitles.some((value) => title.includes(value.toLowerCase()));
};

type FeedRecommendationValue = 'apply' | 'review' | 'skip' | 'unscored';

const getRecommendation = (item: FeedJobCard): FeedRecommendationValue => {
  const artifact = item.latestScoreArtifact;
  if (!artifact) {
    return 'unscored';
  }

  return artifact.recommendation;
};

const isHighFitRecommendation = (item: FeedJobCard): boolean => {
  const artifact = item.latestScoreArtifact;
  if (!artifact) {
    return false;
  }

  return (
    artifact.recommendation === 'apply' &&
    artifact.scoreBreakdown.overallScore >= 75 &&
    artifact.dealBreakers.length === 0
  );
};

const matchesRecommendation = (
  item: FeedJobCard,
  filter: FeedQuery['recommendation'],
): boolean => {
  if (filter === 'high_fit') {
    return isHighFitRecommendation(item);
  }

  if (filter === 'all') {
    return true;
  }

  return getRecommendation(item) === filter;
};

const matchesSourceFilter = (
  sourceNames: FeedJobCard['job']['sourceNames'],
  filter: FeedQuery['source'],
): boolean => {
  if (filter === 'any') {
    return true;
  }

  return sourceNames.includes(filter);
};

const matchesSearch = (item: FeedJobCard, query: string): boolean => {
  if (query.length === 0) {
    return true;
  }

  const haystack = [
    item.job.canonicalTitle,
    item.job.canonicalCompanyName,
    item.job.normalizedLocation ?? '',
    ...item.job.topSkills,
  ]
    .join(' ')
    .toLowerCase();

  const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 0);
  return terms.every((term) => haystack.includes(term));
};

const compareIsoDatesDesc = (leftIso: string, rightIso: string): number => {
  const left = Date.parse(leftIso);
  const right = Date.parse(rightIso);
  return right - left;
};

const recommendationOrder: Record<'apply' | 'review' | 'skip' | 'unscored', number> = {
  apply: 3,
  review: 2,
  skip: 1,
  unscored: 0,
};

const compareFeedByFit = (left: FeedJobCard, right: FeedJobCard): number => {
  const leftRec = getRecommendation(left);
  const rightRec = getRecommendation(right);

  const recommendationDelta = recommendationOrder[rightRec] - recommendationOrder[leftRec];
  if (recommendationDelta !== 0) {
    return recommendationDelta;
  }

  const leftScore = left.latestScoreArtifact?.scoreBreakdown.overallScore ?? -1;
  const rightScore = right.latestScoreArtifact?.scoreBreakdown.overallScore ?? -1;
  if (rightScore !== leftScore) {
    return rightScore - leftScore;
  }

  return compareIsoDatesDesc(left.job.lastSeenAt, right.job.lastSeenAt);
};

const compareFeedByRecent = (left: FeedJobCard, right: FeedJobCard): number =>
  compareIsoDatesDesc(left.job.lastSeenAt, right.job.lastSeenAt);

const compareFeedBySalary = (left: FeedJobCard, right: FeedJobCard): number => {
  const leftSalary = left.job.salaryMax ?? left.job.salaryMin ?? -1;
  const rightSalary = right.job.salaryMax ?? right.job.salaryMin ?? -1;

  if (rightSalary !== leftSalary) {
    return rightSalary - leftSalary;
  }

  return compareFeedByFit(left, right);
};

const applyFeedFilters = (
  items: FeedJobCard[],
  query: FeedQuery,
  preferences: UserPreferences,
  trackerStateByCanonicalJobId: Map<string, TrackerState>,
): FeedJobCard[] => {
  const filtered = items.filter((item) => {
    if (!query.includeHidden && isHiddenByPreferences(item, preferences)) {
      return false;
    }

    if (
      !query.includeHidden &&
      trackerStateByCanonicalJobId.get(item.job.canonicalJobId) === 'archived'
    ) {
      return false;
    }

    if (!matchesRecommendation(item, query.recommendation)) {
      return false;
    }

    if (!matchesRemoteFilter(item.job.remoteType, query.remote, preferences)) {
      return false;
    }

    if (!matchesSourceFilter(item.job.sourceNames, query.source)) {
      return false;
    }

    return matchesSearch(item, query.q);
  });

  if (query.sort === 'recent') {
    return filtered.sort(compareFeedByRecent);
  }

  if (query.sort === 'salary') {
    return filtered.sort(compareFeedBySalary);
  }

  return filtered.sort(compareFeedByFit);
};

const toApplicationByCanonicalJobId = (
  applications: ApplicationRecord[],
): Map<string, ApplicationRecord> =>
  new Map(applications.map((application) => [application.canonicalJobId, application] as const));

const toPendingReminderByCanonicalJobId = (
  reminders: ReminderTask[],
): Map<string, ReminderTask> => {
  const sorted = [...reminders].sort((left, right) => {
    const leftDueAt = Date.parse(left.dueAt);
    const rightDueAt = Date.parse(right.dueAt);
    return leftDueAt - rightDueAt;
  });

  const reminderByCanonicalJobId = new Map<string, ReminderTask>();
  for (const reminder of sorted) {
    if (!reminderByCanonicalJobId.has(reminder.canonicalJobId)) {
      reminderByCanonicalJobId.set(reminder.canonicalJobId, reminder);
    }
  }

  return reminderByCanonicalJobId;
};

const resolveSourceJobs = async (
  connectorService: ConnectorService,
  mappings: CanonicalSourceMapping[],
): Promise<SourceJobSummary[]> => {
  const sourceJobs = await Promise.all(
    mappings.map(async (mapping) => {
      try {
        return await connectorService.getSourceJob(
          mapping.sourceName,
          mapping.sourceJobId,
        );
      } catch (error) {
        if (
          error instanceof HttpError &&
          error.code === 'source_connector_not_found'
        ) {
          return null;
        }

        throw error;
      }
    }),
  );

  return sourceJobs.filter((sourceJob): sourceJob is SourceJobSummary => sourceJob !== null);
};

export const handleCanonicalJobRoutes = async (
  req: IncomingMessage,
  res: ServerResponse,
  {
    authProfileService,
    canonicalJobsService,
    aiService,
    trackerService,
    connectorService,
    applicationService,
    reminderService,
  }: CanonicalJobRoutesDependencies,
): Promise<boolean> => {
  const method = req.method ?? 'GET';
  const requestUrl = getUrl(req);
  const pathname = requestUrl.pathname;

  if (method === 'POST' && pathname === '/v1/canonical-jobs/rebuild') {
    const accessToken = requireAccessToken(req);
    await authProfileService.authenticate(accessToken);

    const payload = await parseBody(req, canonicalRebuildRequestSchema);
    const result = await canonicalJobsService.rebuildCatalog(payload);

    sendJson(res, 200, {
      contractVersion: jobsContractVersion,
      ...result,
    });
    return true;
  }

  if (method === 'GET' && pathname === '/v1/canonical-jobs') {
    const accessToken = requireAccessToken(req);
    await authProfileService.authenticate(accessToken);

    const limit = parseLimitQuery(requestUrl.searchParams.get('limit'));
    const jobs = await canonicalJobsService.listCanonicalJobs(limit);

    sendJson(res, 200, {
      contractVersion: jobsContractVersion,
      jobs,
    });
    return true;
  }

  if (method === 'GET' && pathname === '/v1/feed') {
    const accessToken = requireAccessToken(req);
    const user = await authProfileService.authenticate(accessToken);

    const feedQuery = parseFeedQuery(requestUrl);

    const jobs = await canonicalJobsService.listCanonicalJobs();
    const relatedRecordLimit = jobs.length > 0 ? jobs.length : undefined;

    const [preferences, trackers, applications, reminders] = await Promise.all([
      authProfileService.getPreferences(user.userId),
      trackerService.listTrackedJobs({
        userId: user.userId,
        limit: relatedRecordLimit,
      }),
      applicationService.listApplications({
        userId: user.userId,
        limit: relatedRecordLimit,
      }),
      reminderService.listReminders({
        userId: user.userId,
        status: 'pending',
        limit: relatedRecordLimit,
      }),
    ]);

    const trackerStateByCanonicalJobId = new Map(
      trackers.map((tracker) => [tracker.canonicalJobId, tracker.state] as const),
    );
    const applicationByCanonicalJobId = toApplicationByCanonicalJobId(applications);
    const pendingReminderByCanonicalJobId = toPendingReminderByCanonicalJobId(reminders);

    const items = await Promise.all(
      jobs.map(async (job) => {
        const latestScoreArtifact = await aiService.getLatestMatchArtifact(
          user.userId,
          job.canonicalJobId,
        );

        const trackerState = trackerStateByCanonicalJobId.get(job.canonicalJobId) ?? null;
        const application = applicationByCanonicalJobId.get(job.canonicalJobId) ?? null;
        const pendingReminder =
          pendingReminderByCanonicalJobId.get(job.canonicalJobId) ?? null;

        return {
          job,
          latestScoreArtifact,
          nextAction: resolveFeedNextAction({
            trackerState,
            application,
            pendingReminder,
            latestScoreArtifact,
          }),
        };
      }),
    );

    const filteredItems = applyFeedFilters(
      items,
      feedQuery,
      preferences,
      trackerStateByCanonicalJobId,
    );

    const boundedItems =
      feedQuery.limit === undefined
        ? filteredItems
        : filteredItems.slice(0, feedQuery.limit);

    sendJson(res, 200, {
      contractVersion: jobsContractVersion,
      items: boundedItems,
    });
    return true;
  }

  if (method === 'GET') {
    const feedPathParam = parseFeedDetailPath(pathname);
    if (feedPathParam) {
      const parsedCanonicalJobId = canonicalJobIdSchema.safeParse(feedPathParam);
      if (!parsedCanonicalJobId.success) {
        throw new HttpError(400, 'invalid_canonical_job_id', {
          canonicalJobId: feedPathParam,
        });
      }

      const accessToken = requireAccessToken(req);
      const user = await authProfileService.authenticate(accessToken);

      const canonical = await canonicalJobsService.getCanonicalJob(
        parsedCanonicalJobId.data,
      );
      if (!canonical) {
        throw new HttpError(404, 'canonical_job_not_found', {
          canonicalJobId: parsedCanonicalJobId.data,
        });
      }

      const [dedupeEvents, latestScoreArtifact, sourceJobs, tracker, applications, reminders] =
        await Promise.all([
          canonicalJobsService.listDedupeTraceEvents(parsedCanonicalJobId.data),
          aiService.getLatestMatchArtifact(user.userId, parsedCanonicalJobId.data),
          resolveSourceJobs(connectorService, canonical.sourceMappings),
          trackerService.getTrackedJob(user.userId, parsedCanonicalJobId.data),
          applicationService.listApplications({
            userId: user.userId,
            canonicalJobId: parsedCanonicalJobId.data,
            limit: 1,
          }),
          reminderService.listReminders({
            userId: user.userId,
            canonicalJobId: parsedCanonicalJobId.data,
            status: 'pending',
            limit: 1,
          }),
        ]);

      const application = applications[0] ?? null;
      const pendingReminder = reminders[0] ?? null;
      const nextAction = resolveFeedNextAction({
        trackerState: tracker?.state ?? null,
        application,
        pendingReminder,
        latestScoreArtifact,
      });

      sendJson(res, 200, {
        contractVersion: jobsContractVersion,
        canonical,
        latestScoreArtifact,
        dedupeEvents,
        sourceJobs,
        nextAction,
      });
      return true;
    }
  }

  if (method === 'GET') {
    const dedupePathParam = parseCanonicalDedupeEventsPath(pathname);
    if (dedupePathParam) {
      const parsedCanonicalJobId = canonicalJobIdSchema.safeParse(dedupePathParam);
      if (!parsedCanonicalJobId.success) {
        throw new HttpError(400, 'invalid_canonical_job_id', {
          canonicalJobId: dedupePathParam,
        });
      }

      const accessToken = requireAccessToken(req);
      await authProfileService.authenticate(accessToken);

      const events = await canonicalJobsService.listDedupeTraceEvents(
        parsedCanonicalJobId.data,
      );

      sendJson(res, 200, {
        contractVersion: jobsContractVersion,
        canonicalJobId: parsedCanonicalJobId.data,
        events,
      });
      return true;
    }
  }

  if (method === 'GET') {
    const pathParam = parseCanonicalPath(pathname);
    if (!pathParam) {
      return false;
    }

    const parsedCanonicalJobId = canonicalJobIdSchema.safeParse(pathParam);
    if (!parsedCanonicalJobId.success) {
      throw new HttpError(400, 'invalid_canonical_job_id', {
        canonicalJobId: pathParam,
      });
    }

    const accessToken = requireAccessToken(req);
    await authProfileService.authenticate(accessToken);

    const canonical = await canonicalJobsService.getCanonicalJob(parsedCanonicalJobId.data);
    if (!canonical) {
      throw new HttpError(404, 'canonical_job_not_found', {
        canonicalJobId: parsedCanonicalJobId.data,
      });
    }

    sendJson(res, 200, {
      contractVersion: jobsContractVersion,
      canonical,
    });
    return true;
  }

  return false;
};
