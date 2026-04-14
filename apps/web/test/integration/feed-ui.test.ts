import assert from 'node:assert/strict';
import { once } from 'node:events';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import { createWebServer } from '../../src/index.js';

const tokenValue = 'token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const userId = '2d738b4b-1a8b-441c-89df-5f8e4d7be92a';

const visibleCanonicalJobId = 'b4ee5452-117e-4b0f-8a05-ebb91e4e35f8';
const hiddenCanonicalJobId = 'e260f0cc-754d-491a-a273-081f2b28cce8';

const userProfile = {
  userId,
  currentTitle: 'Senior Backend Engineer',
  yearsExperience: 8,
  summary: 'Platform and data systems builder.',
  workAuthorization: 'citizen',
  sponsorshipRequired: false,
  transitionNotes: null,
  createdAt: '2026-04-12T10:00:00.000Z',
  updatedAt: '2026-04-12T10:00:00.000Z',
};

const userPreferences = {
  userId,
  preferredTitles: ['Senior Backend Engineer'],
  preferredIndustries: ['Software'],
  preferredSkills: ['TypeScript', 'Node.js'],
  preferredLocations: ['United States'],
  remotePreference: 'remote',
  targetSeniorityMin: 'mid',
  targetSeniorityMax: 'principal',
  salaryMin: 150000,
  salaryTarget: 190000,
  dealBreakers: [],
  hiddenCompanies: ['Hidden Corp'],
  hiddenTitles: ['Legacy Integrations Engineer'],
  stretchPreferenceLevel: 3,
  notificationPreferences: {
    dailyDigest: true,
    weeklyDigest: true,
    instantHighFit: true,
  },
  createdAt: '2026-04-12T10:00:00.000Z',
  updatedAt: '2026-04-12T10:00:00.000Z',
};

const scoredArtifact = {
  userId,
  canonicalJobId: visibleCanonicalJobId,
  artifactVersion: 1,
  scoringVersion: 'deterministic-v1',
  scoreBreakdown: {
    overallScore: 88,
    titleScore: 91,
    skillScore: 86,
    seniorityScore: 85,
    locationScore: 92,
    compensationScore: 90,
    domainScore: 79,
    requirementScore: 88,
    trajectoryScore: 82,
    penaltyScore: 4,
  },
  strengths: ['Strong TypeScript and API architecture alignment'],
  gaps: ['Domain depth in fintech is moderate'],
  dealBreakers: [],
  recommendation: 'apply',
  explanation: {
    summary: 'Strong fit with clear overlap in required backend systems work.',
    strengths: ['Experience aligns with role seniority and stack'],
    gaps: ['Domain context can be strengthened during interviews'],
    dealBreakers: [],
    recommendation: 'apply',
  },
  explanationMetadata: {
    schemaVersion: 'v1',
    extractorVersion: 'deterministic-v1',
    modelVersion: 'deterministic',
    generatedAt: '2026-04-12T11:00:00.000Z',
  },
  explanationErrorCode: null,
  scoredAt: '2026-04-12T11:00:00.000Z',
};

const visibleFeedItem = {
  job: {
    canonicalJobId: visibleCanonicalJobId,
    canonicalCompanyName: 'Visible Systems',
    canonicalTitle: 'Senior Platform Engineer',
    normalizedLocation: 'Remote - United States',
    remoteType: 'remote',
    employmentType: 'full_time',
    salaryMin: 170000,
    salaryMax: 215000,
    salaryCurrency: 'USD',
    salaryPeriod: 'year',
    sourceCount: 2,
    sourceNames: ['greenhouse_public_board', 'lever_public_board'],
    jobStatus: 'open',
    topSkills: ['TypeScript', 'Node.js', 'PostgreSQL'],
    firstSeenAt: '2026-04-11T12:00:00.000Z',
    lastSeenAt: '2026-04-12T12:00:00.000Z',
    createdAt: '2026-04-12T12:00:00.000Z',
    updatedAt: '2026-04-12T12:00:00.000Z',
  },
  latestScoreArtifact: scoredArtifact,
  nextAction: {
    action: 'shortlist',
    title: 'Shortlist this role',
    rationale:
      'Recommendation is apply; shortlist now so you can prioritize material prep and submission.',
  },
};

const hiddenFeedItem = {
  job: {
    canonicalJobId: hiddenCanonicalJobId,
    canonicalCompanyName: 'Hidden Corp',
    canonicalTitle: 'Legacy Integrations Engineer',
    normalizedLocation: 'Hybrid - Seattle',
    remoteType: 'hybrid',
    employmentType: 'full_time',
    salaryMin: 140000,
    salaryMax: 175000,
    salaryCurrency: 'USD',
    salaryPeriod: 'year',
    sourceCount: 1,
    sourceNames: ['greenhouse_public_board'],
    jobStatus: 'open',
    topSkills: ['Java', 'Spring'],
    firstSeenAt: '2026-04-10T12:00:00.000Z',
    lastSeenAt: '2026-04-12T10:00:00.000Z',
    createdAt: '2026-04-12T10:00:00.000Z',
    updatedAt: '2026-04-12T10:00:00.000Z',
  },
  latestScoreArtifact: null,
  nextAction: {
    action: 'archive',
    title: 'Archive and move on',
    rationale: 'This role is already hidden in your tracker. Keep focus on active opportunities.',
  },
};

const feedDetailResponse = {
  contractVersion: 'v1',
  canonical: {
    job: visibleFeedItem.job,
    sourceMappings: [
      {
        sourceName: 'greenhouse_public_board',
        sourceJobId: '1001',
        isPrimary: true,
        mappingConfidence: 0.93,
        mappingReasonCodes: ['exact_company_title', 'same_remote_type'],
      },
    ],
  },
  latestScoreArtifact: scoredArtifact,
  nextAction: {
    action: 'shortlist',
    title: 'Shortlist this role',
    rationale:
      'Recommendation is apply; shortlist now so you can prioritize material prep and submission.',
  },
  dedupeEvents: [
    {
      eventId: '4ef03bb9-39d2-4d94-82f7-caf9fdd2fcc0',
      canonicalJobId: visibleCanonicalJobId,
      sourceName: 'greenhouse_public_board',
      sourceJobId: '1001',
      eventType: 'linked_to_canonical',
      mappingConfidence: 0.93,
      mappingReasonCodes: ['exact_company_title', 'same_remote_type'],
      reversible: true,
      dedupeVersion: 'dedupe-v1',
      occurredAt: '2026-04-12T12:00:00.000Z',
    },
  ],
  sourceJobs: [
    {
      sourceName: 'greenhouse_public_board',
      sourceJobId: '1001',
      sourceCompanyId: 'visible-systems',
      sourceStatus: 'open',
      title: 'Staff Platform Engineer',
      companyName: 'Visible Systems',
      fetchUrl: 'https://boards.greenhouse.io/visiblesystems/jobs/1001',
      applicationUrl: 'https://boards.greenhouse.io/visiblesystems/jobs/1001/apply',
      locationText: 'Remote - United States',
      remoteType: 'remote',
      employmentType: 'full_time',
      postedAt: '2026-04-11T00:00:00.000Z',
      firstSeenAt: '2026-04-10T12:00:00.000Z',
      lastSeenAt: '2026-04-12T10:00:00.000Z',
      fetchedAt: '2026-04-12T10:00:00.000Z',
      checksumSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      normalizedSkills: ['TypeScript', 'Node.js', 'PostgreSQL'],
      requiredSkills: ['TypeScript', 'Node.js'],
      preferredSkills: ['PostgreSQL'],
      salaryMin: 180000,
      salaryMax: 220000,
      salaryCurrency: 'USD',
      salaryPeriod: 'year',
    },
  ],
};

const applicationStatuses = new Set([
  'ready_to_apply',
  'applied',
  'interview',
  'offer',
  'rejected',
  'archived',
]);

const trackerActions = new Set(['save', 'shortlist', 'hide']);

const trackerActionTargetState: Record<'save' | 'shortlist' | 'hide', string> = {
  save: 'reviewing',
  shortlist: 'shortlisted',
  hide: 'archived',
};

const trackerActionDefaultNote: Record<'save' | 'shortlist' | 'hide', string> = {
  save: 'Saved from discovery feed',
  shortlist: 'Shortlisted from discovery feed',
  hide: 'Hidden from discovery feed',
};

const parseApplicationPath = (pathname: string): string | null => {
  const prefix = '/v1/applications/';
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const value = pathname.slice(prefix.length);
  if (!value || value.includes('/')) {
    return null;
  }

  return value;
};

const parseApplicationMaterialGuidancePath = (pathname: string): string | null => {
  const prefix = '/v1/applications/';
  const suffix = '/material-guidance';

  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) {
    return null;
  }

  const value = pathname.slice(prefix.length, -suffix.length);
  if (!value || value.includes('/')) {
    return null;
  }

  return value;
};

const parseTrackerJobPath = (pathname: string): string | null => {
  const prefix = '/v1/tracker/jobs/';
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const value = pathname.slice(prefix.length);
  if (!value || value.includes('/')) {
    return null;
  }

  return value;
};

const parseTrackerActionPath = (
  pathname: string,
): {
  canonicalJobId: string;
  action: string;
} | null => {
  const prefix = '/v1/tracker/jobs/';
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const remainder = pathname.slice(prefix.length);
  const segments = remainder.split('/');
  if (segments.length !== 3 || segments[1] !== 'actions') {
    return null;
  }

  const canonicalJobId = segments[0];
  const action = segments[2];
  if (!canonicalJobId || !action) {
    return null;
  }

  return {
    canonicalJobId,
    action,
  };
};

const parseSavedSearchPath = (pathname: string): string | null => {
  const prefix = '/v1/saved-searches/';
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const value = pathname.slice(prefix.length);
  if (!value || value.includes('/')) {
    return null;
  }

  return value;
};

const parseSourceJobDetailPath = (
  pathname: string,
): { sourceName: string; sourceJobId: string } | null => {
  const prefix = '/v1/source-jobs/';
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const remainder = pathname.slice(prefix.length);
  const segments = remainder.split('/').filter((segment) => segment.length > 0);
  if (segments.length !== 2) {
    return null;
  }

  const [sourceName, sourceJobId] = segments;
  if (!sourceName || !sourceJobId) {
    return null;
  }

  return {
    sourceName,
    sourceJobId,
  };
};

const normalizeNullableText = (value: unknown): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const readRequestBody = async (req: IncomingMessage): Promise<string> => {
  let body = '';

  return new Promise<string>((resolve, reject) => {
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      body += chunk;
    });
    req.on('end', () => {
      resolve(body);
    });
    req.on('error', (error) => {
      reject(error);
    });
  });
};

const sendJson = (
  res: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
): void => {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(payload));
};

const requireAuth = (req: IncomingMessage): boolean =>
  req.headers.authorization === `Bearer ${tokenValue}`;

const createApiStubServer = (): Server => {
  let mutableUserProfile = {
    ...userProfile,
  };

  let mutableUserPreferences = {
    ...userPreferences,
    preferredTitles: [...userPreferences.preferredTitles],
    preferredIndustries: [...userPreferences.preferredIndustries],
    preferredSkills: [...userPreferences.preferredSkills],
    preferredLocations: [...userPreferences.preferredLocations],
    dealBreakers: [...userPreferences.dealBreakers],
    hiddenCompanies: [...userPreferences.hiddenCompanies],
    hiddenTitles: [...userPreferences.hiddenTitles],
    notificationPreferences: {
      ...userPreferences.notificationPreferences,
    },
  };

  const applications = new Map<
    string,
    {
      applicationId: string;
      userId: string;
      canonicalJobId: string;
      status: string;
      appliedAt: string | null;
      applicationUrl: string | null;
      resumeIdUsed: string | null;
      coverLetterDocUri: string | null;
      notes: string | null;
      createdAt: string;
      updatedAt: string;
    }
  >();

  const trackers = new Map<
    string,
    {
      userId: string;
      canonicalJobId: string;
      state: string;
      lastTransitionNote: string | null;
      createdAt: string;
      updatedAt: string;
    }
  >();

  const savedSearches = new Map<
    string,
    {
      savedSearchId: string;
      userId: string;
      name: string;
      query: {
        q: string;
        recommendation: string;
        remote: string;
        source: string;
        sort: string;
        includeHidden: boolean;
      };
      createdAt: string;
      updatedAt: string;
      lastUsedAt: string | null;
    }
  >();

  const notifications: Array<{
    notificationId: string;
    userId: string;
    reminderId: string | null;
    canonicalJobId: string;
    matchArtifactVersion: number | null;
    notificationType: 'reminder_due' | 'high_fit_alert';
    channel: 'in_app';
    status: 'queued' | 'sent' | 'failed';
    message: string;
    scheduledFor: string;
    sentAt: string | null;
    failedAt: string | null;
    errorCode: string | null;
    createdAt: string;
    updatedAt: string;
  }> = [
    {
      notificationId: '44444444-4444-4444-8444-000000000001',
      userId,
      reminderId: null,
      canonicalJobId: visibleCanonicalJobId,
      matchArtifactVersion: 1,
      notificationType: 'high_fit_alert',
      channel: 'in_app',
      status: 'sent',
      message: 'High-fit alert: Senior Platform Engineer at Visible Systems scored 88.0.',
      scheduledFor: '2026-04-12T11:00:00.000Z',
      sentAt: '2026-04-12T11:01:00.000Z',
      failedAt: null,
      errorCode: null,
      createdAt: '2026-04-12T11:00:00.000Z',
      updatedAt: '2026-04-12T11:01:00.000Z',
    },
    {
      notificationId: '44444444-4444-4444-8444-000000000002',
      userId,
      reminderId: '55555555-5555-4555-8555-000000000001',
      canonicalJobId: hiddenCanonicalJobId,
      matchArtifactVersion: null,
      notificationType: 'reminder_due',
      channel: 'in_app',
      status: 'sent',
      message: 'Reminder due: Follow up on hidden role.',
      scheduledFor: '2026-04-12T10:00:00.000Z',
      sentAt: '2026-04-12T10:01:00.000Z',
      failedAt: null,
      errorCode: null,
      createdAt: '2026-04-12T10:00:00.000Z',
      updatedAt: '2026-04-12T10:01:00.000Z',
    },
  ];

  const reminders: Array<{
    reminderId: string;
    userId: string;
    canonicalJobId: string;
    taskType: 'application_follow_up' | 'interview_prep' | 'custom';
    title: string;
    note: string | null;
    dueAt: string;
    status: 'pending' | 'completed';
    linkedTrackerEventId: string | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
  }> = [
    {
      reminderId: '55555555-5555-4555-8555-000000000001',
      userId,
      canonicalJobId: hiddenCanonicalJobId,
      taskType: 'application_follow_up',
      title: 'Follow up on hidden role.',
      note: 'Decide whether to keep this archived role hidden or close it out.',
      dueAt: '2026-04-12T09:00:00.000Z',
      status: 'pending',
      linkedTrackerEventId: null,
      createdAt: '2026-04-12T08:00:00.000Z',
      updatedAt: '2026-04-12T08:00:00.000Z',
      completedAt: null,
    },
  ];

  let applicationCounter = 1;
  let trackerEventCounter = 1;
  let savedSearchCounter = 1;

  const nextApplicationId = (): string => {
    const suffix = applicationCounter.toString(16).padStart(12, '0');
    applicationCounter += 1;
    return `11111111-1111-4111-8111-${suffix}`;
  };

  const nextTrackerEventId = (): string => {
    const suffix = trackerEventCounter.toString(16).padStart(12, '0');
    trackerEventCounter += 1;
    return `22222222-2222-4222-8222-${suffix}`;
  };

  const nextSavedSearchId = (): string => {
    const suffix = savedSearchCounter.toString(16).padStart(12, '0');
    savedSearchCounter += 1;
    return `33333333-3333-4333-8333-${suffix}`;
  };

  return createServer(async (req, res) => {
    const method = req.method ?? 'GET';
    const requestUrl = new URL(req.url ?? '/', 'http://localhost');
    const pathname = requestUrl.pathname;

    if (method === 'POST' && pathname === '/v1/auth/register') {
      const body = await readRequestBody(req);
      const parsed = JSON.parse(body) as { email?: string };

      if (!parsed.email) {
        sendJson(res, 400, { error: 'invalid_request_body' });
        return;
      }

      sendJson(res, 200, {
        contractVersion: 'v1',
        session: {
          accessToken: tokenValue,
          user: {
            userId,
            email: parsed.email,
            createdAt: '2026-04-12T10:00:00.000Z',
            updatedAt: '2026-04-12T10:00:00.000Z',
          },
        },
      });
      return;
    }

    if (method === 'POST' && pathname === '/v1/auth/login') {
      const body = await readRequestBody(req);
      const parsed = JSON.parse(body) as { email?: string };

      if (!parsed.email) {
        sendJson(res, 400, { error: 'invalid_request_body' });
        return;
      }

      sendJson(res, 200, {
        contractVersion: 'v1',
        session: {
          accessToken: tokenValue,
          user: {
            userId,
            email: parsed.email,
            createdAt: '2026-04-12T10:00:00.000Z',
            updatedAt: '2026-04-12T10:00:00.000Z',
          },
        },
      });
      return;
    }

    if (!requireAuth(req)) {
      sendJson(res, 401, { error: 'invalid_access_token' });
      return;
    }

    if (method === 'GET' && pathname === '/v1/profile') {
      sendJson(res, 200, {
        contractVersion: 'v1',
        profile: mutableUserProfile,
      });
      return;
    }

    if (method === 'GET' && pathname === '/v1/preferences') {
      sendJson(res, 200, {
        contractVersion: 'v1',
        preferences: mutableUserPreferences,
      });
      return;
    }

    if (method === 'PUT' && pathname === '/v1/profile') {
      const body = await readRequestBody(req);
      const parsed = JSON.parse(body) as {
        currentTitle?: string | null;
        yearsExperience?: number | null;
        summary?: string | null;
        workAuthorization?: string | null;
        sponsorshipRequired?: boolean | null;
        transitionNotes?: string | null;
      };

      mutableUserProfile = {
        ...mutableUserProfile,
        currentTitle: normalizeNullableText(parsed.currentTitle) ?? null,
        yearsExperience:
          typeof parsed.yearsExperience === 'number' ? parsed.yearsExperience : null,
        summary: normalizeNullableText(parsed.summary) ?? null,
        workAuthorization:
          typeof parsed.workAuthorization === 'string'
            ? parsed.workAuthorization
            : null,
        sponsorshipRequired:
          typeof parsed.sponsorshipRequired === 'boolean'
            ? parsed.sponsorshipRequired
            : null,
        transitionNotes: normalizeNullableText(parsed.transitionNotes) ?? null,
        updatedAt: '2026-04-12T12:50:00.000Z',
      };

      sendJson(res, 200, {
        contractVersion: 'v1',
        profile: mutableUserProfile,
      });
      return;
    }

    if (method === 'PUT' && pathname === '/v1/preferences') {
      const body = await readRequestBody(req);
      const parsed = JSON.parse(body) as {
        preferredTitles?: string[];
        preferredIndustries?: string[];
        preferredSkills?: string[];
        preferredLocations?: string[];
        remotePreference?: string;
        targetSeniorityMin?: string | null;
        targetSeniorityMax?: string | null;
        salaryMin?: number | null;
        salaryTarget?: number | null;
        dealBreakers?: string[];
        hiddenCompanies?: string[];
        hiddenTitles?: string[];
        stretchPreferenceLevel?: number;
        notificationPreferences?: {
          dailyDigest?: boolean;
          weeklyDigest?: boolean;
          instantHighFit?: boolean;
        };
      };

      mutableUserPreferences = {
        ...mutableUserPreferences,
        preferredTitles: Array.isArray(parsed.preferredTitles)
          ? parsed.preferredTitles
          : mutableUserPreferences.preferredTitles,
        preferredIndustries: Array.isArray(parsed.preferredIndustries)
          ? parsed.preferredIndustries
          : mutableUserPreferences.preferredIndustries,
        preferredSkills: Array.isArray(parsed.preferredSkills)
          ? parsed.preferredSkills
          : mutableUserPreferences.preferredSkills,
        preferredLocations: Array.isArray(parsed.preferredLocations)
          ? parsed.preferredLocations
          : mutableUserPreferences.preferredLocations,
        remotePreference:
          typeof parsed.remotePreference === 'string'
            ? parsed.remotePreference
            : mutableUserPreferences.remotePreference,
        targetSeniorityMin:
          parsed.targetSeniorityMin === undefined
            ? mutableUserPreferences.targetSeniorityMin
            : parsed.targetSeniorityMin,
        targetSeniorityMax:
          parsed.targetSeniorityMax === undefined
            ? mutableUserPreferences.targetSeniorityMax
            : parsed.targetSeniorityMax,
        salaryMin:
          typeof parsed.salaryMin === 'number' || parsed.salaryMin === null
            ? parsed.salaryMin
            : mutableUserPreferences.salaryMin,
        salaryTarget:
          typeof parsed.salaryTarget === 'number' || parsed.salaryTarget === null
            ? parsed.salaryTarget
            : mutableUserPreferences.salaryTarget,
        dealBreakers: Array.isArray(parsed.dealBreakers)
          ? parsed.dealBreakers
          : mutableUserPreferences.dealBreakers,
        hiddenCompanies: Array.isArray(parsed.hiddenCompanies)
          ? parsed.hiddenCompanies
          : mutableUserPreferences.hiddenCompanies,
        hiddenTitles: Array.isArray(parsed.hiddenTitles)
          ? parsed.hiddenTitles
          : mutableUserPreferences.hiddenTitles,
        stretchPreferenceLevel:
          typeof parsed.stretchPreferenceLevel === 'number'
            ? parsed.stretchPreferenceLevel
            : mutableUserPreferences.stretchPreferenceLevel,
        notificationPreferences: {
          dailyDigest:
            parsed.notificationPreferences?.dailyDigest ??
            mutableUserPreferences.notificationPreferences.dailyDigest,
          weeklyDigest:
            parsed.notificationPreferences?.weeklyDigest ??
            mutableUserPreferences.notificationPreferences.weeklyDigest,
          instantHighFit:
            parsed.notificationPreferences?.instantHighFit ??
            mutableUserPreferences.notificationPreferences.instantHighFit,
        },
        updatedAt: '2026-04-12T12:50:00.000Z',
      };

      sendJson(res, 200, {
        contractVersion: 'v1',
        preferences: mutableUserPreferences,
      });
      return;
    }

    if (method === 'GET') {
      const sourceJobDetailPath = parseSourceJobDetailPath(pathname);
      if (sourceJobDetailPath) {
        if (
          sourceJobDetailPath.sourceName !== 'greenhouse_public_board' ||
          sourceJobDetailPath.sourceJobId !== '1001'
        ) {
          sendJson(res, 404, { error: 'source_job_not_found' });
          return;
        }

        sendJson(res, 200, {
          contractVersion: 'v1',
          sourceJob: {
            ...feedDetailResponse.sourceJobs[0],
            descriptionText:
              'Visible Systems is hiring a Staff Platform Engineer to scale TypeScript APIs and PostgreSQL workloads.',
          },
        });
        return;
      }
    }

    if (method === 'GET' && pathname === '/v1/saved-searches') {
      const limitRaw = requestUrl.searchParams.get('limit');
      const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 50;
      const effectiveLimit = Number.isNaN(limit) ? 50 : limit;

      const records = [...savedSearches.values()]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, effectiveLimit);

      sendJson(res, 200, {
        contractVersion: 'v1',
        savedSearches: records,
      });
      return;
    }

    if (method === 'GET' && pathname === '/v1/notifications') {
      const statusFilter = requestUrl.searchParams.get('status');
      const limitRaw = requestUrl.searchParams.get('limit');

      const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 50;
      const effectiveLimit = Number.isNaN(limit) ? 50 : limit;

      const records = notifications
        .filter((notification) => {
          if (!statusFilter) {
            return true;
          }

          return notification.status === statusFilter;
        })
        .slice(0, effectiveLimit);

      sendJson(res, 200, {
        contractVersion: 'v1',
        notifications: records,
      });
      return;
    }

    if (method === 'GET' && pathname === '/v1/reminders') {
      const statusFilter = requestUrl.searchParams.get('status');
      const canonicalJobIdFilter = requestUrl.searchParams.get('canonicalJobId');
      const limitRaw = requestUrl.searchParams.get('limit');

      const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 50;
      const effectiveLimit = Number.isNaN(limit) ? 50 : limit;

      const records = reminders
        .filter((reminder) => {
          if (statusFilter && reminder.status !== statusFilter) {
            return false;
          }

          if (canonicalJobIdFilter && reminder.canonicalJobId !== canonicalJobIdFilter) {
            return false;
          }

          return true;
        })
        .slice(0, effectiveLimit);

      sendJson(res, 200, {
        contractVersion: 'v1',
        reminders: records,
      });
      return;
    }

    if (method === 'POST' && pathname === '/v1/saved-searches') {
      const body = await readRequestBody(req);
      const parsed = JSON.parse(body) as {
        name?: string;
        query?: {
          q?: string;
          recommendation?: string;
          remote?: string;
          source?: string;
          sort?: string;
          includeHidden?: boolean;
        };
      };

      const name = parsed.name?.trim() ?? '';
      if (!name || !parsed.query) {
        sendJson(res, 400, { error: 'invalid_request_body' });
        return;
      }

      const duplicate = [...savedSearches.values()].find(
        (savedSearch) => savedSearch.name.toLowerCase() === name.toLowerCase(),
      );

      if (duplicate) {
        sendJson(res, 409, { error: 'saved_search_name_exists' });
        return;
      }

      const nowIso = '2026-04-12T12:05:00.000Z';
      const savedSearch = {
        savedSearchId: nextSavedSearchId(),
        userId,
        name,
        query: {
          q: (parsed.query.q ?? '').trim(),
          recommendation: parsed.query.recommendation ?? 'high_fit',
          remote: parsed.query.remote ?? 'aligned',
          source: parsed.query.source ?? 'any',
          sort: parsed.query.sort ?? 'fit',
          includeHidden: parsed.query.includeHidden ?? false,
        },
        createdAt: nowIso,
        updatedAt: nowIso,
        lastUsedAt: null,
      };

      savedSearches.set(savedSearch.savedSearchId, savedSearch);

      sendJson(res, 200, {
        contractVersion: 'v1',
        savedSearch,
      });
      return;
    }

    if (method === 'GET' || method === 'DELETE') {
      const savedSearchId = parseSavedSearchPath(pathname);
      if (savedSearchId) {
        const existing = savedSearches.get(savedSearchId);
        if (!existing) {
          sendJson(res, 404, { error: 'saved_search_not_found' });
          return;
        }

        if (method === 'GET') {
          sendJson(res, 200, {
            contractVersion: 'v1',
            savedSearch: existing,
          });
          return;
        }

        savedSearches.delete(savedSearchId);
        sendJson(res, 200, {
          contractVersion: 'v1',
          deletedSavedSearchId: savedSearchId,
        });
        return;
      }
    }

    if (method === 'GET' && pathname === '/v1/feed') {
      sendJson(res, 200, {
        contractVersion: 'v1',
        items: [visibleFeedItem, hiddenFeedItem],
      });
      return;
    }

    if (method === 'GET' && pathname === '/v1/tracker/jobs') {
      const stateFilter = requestUrl.searchParams.get('state');
      const limitRaw = requestUrl.searchParams.get('limit');

      const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 50;
      const effectiveLimit = Number.isNaN(limit) ? 50 : limit;

      const records = [...trackers.values()]
        .filter((record) => {
          if (!stateFilter) {
            return true;
          }

          return record.state === stateFilter;
        })
        .slice(0, effectiveLimit);

      sendJson(res, 200, {
        contractVersion: 'v1',
        trackers: records,
      });
      return;
    }

    if (method === 'GET') {
      const canonicalJobId = parseTrackerJobPath(pathname);
      if (canonicalJobId) {
        const tracker = trackers.get(canonicalJobId);
        if (!tracker) {
          sendJson(res, 404, { error: 'tracker_state_not_found' });
          return;
        }

        sendJson(res, 200, {
          contractVersion: 'v1',
          tracker,
        });
        return;
      }
    }

    if (method === 'POST') {
      const trackerActionPath = parseTrackerActionPath(pathname);
      if (trackerActionPath) {
        const { canonicalJobId, action } = trackerActionPath;
        if (
          canonicalJobId !== visibleCanonicalJobId &&
          canonicalJobId !== hiddenCanonicalJobId
        ) {
          sendJson(res, 404, { error: 'canonical_job_not_found' });
          return;
        }

        if (!trackerActions.has(action)) {
          sendJson(res, 400, { error: 'invalid_tracker_discovery_action' });
          return;
        }

        const typedAction = action as 'save' | 'shortlist' | 'hide';
        const body = await readRequestBody(req);
        const parsed = body.length
          ? (JSON.parse(body) as { note?: string | null })
          : {};

        const existing = trackers.get(canonicalJobId);
        const nowIso = '2026-04-12T12:15:00.000Z';
        const note =
          normalizeNullableText(parsed.note) ?? trackerActionDefaultNote[typedAction];
        const state = trackerActionTargetState[typedAction];

        const tracker = {
          userId,
          canonicalJobId,
          state,
          lastTransitionNote: note,
          createdAt: existing?.createdAt ?? nowIso,
          updatedAt: nowIso,
        };

        trackers.set(canonicalJobId, tracker);

        sendJson(res, 200, {
          contractVersion: 'v1',
          action: typedAction,
          tracker,
          event: {
            eventId: nextTrackerEventId(),
            userId,
            canonicalJobId,
            fromState: existing?.state ?? null,
            toState: state,
            note,
            transitionedAt: nowIso,
          },
        });
        return;
      }
    }

    if (method === 'GET' && pathname === '/v1/applications') {
      const statusFilter = requestUrl.searchParams.get('status');
      const canonicalJobIdFilter = requestUrl.searchParams.get('canonicalJobId');
      const limitRaw = requestUrl.searchParams.get('limit');

      const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 50;
      const effectiveLimit = Number.isNaN(limit) ? 50 : limit;

      const records = [...applications.values()]
        .filter((record) => {
          if (statusFilter && record.status !== statusFilter) {
            return false;
          }

          if (canonicalJobIdFilter && record.canonicalJobId !== canonicalJobIdFilter) {
            return false;
          }

          return true;
        })
        .slice(0, effectiveLimit);

      sendJson(res, 200, {
        contractVersion: 'v1',
        applications: records,
      });
      return;
    }

    if (method === 'GET') {
      const applicationId = parseApplicationMaterialGuidancePath(pathname);
      if (applicationId) {
        const record = applications.get(applicationId);
        if (!record) {
          sendJson(res, 404, { error: 'application_not_found' });
          return;
        }

        const job =
          record.canonicalJobId === visibleCanonicalJobId
            ? visibleFeedItem.job
            : record.canonicalJobId === hiddenCanonicalJobId
              ? hiddenFeedItem.job
              : null;

        if (!job) {
          sendJson(res, 404, { error: 'canonical_job_not_found' });
          return;
        }

        sendJson(res, 200, {
          contractVersion: 'v1',
          guidance: {
            application: record,
            canonicalJob: {
              canonicalJobId: job.canonicalJobId,
              canonicalTitle: job.canonicalTitle,
              canonicalCompanyName: job.canonicalCompanyName,
              remoteType: job.remoteType,
              employmentType: job.employmentType,
              topSkills: job.topSkills,
            },
            checklist: [
              'Mirror the role title in your resume headline.',
              'Anchor your first two bullets to top role skills.',
              'Capture the exact resume version used in your tracker notes.',
            ],
            keywordSuggestions: ['TypeScript', 'Node.js', 'PostgreSQL'],
            bulletSuggestions: [
              {
                focusArea: 'TypeScript',
                prompt:
                  'Write one quantified bullet showing impact from a TypeScript service improvement.',
              },
            ],
            coverLetterTalkingPoints: [
              'Open with direct role-to-background alignment.',
              'Highlight one measurable backend systems outcome.',
            ],
          },
        });
        return;
      }
    }

    if (method === 'POST' && pathname === '/v1/applications') {
      const body = await readRequestBody(req);
      const parsed = JSON.parse(body) as {
        canonicalJobId?: string;
        status?: string;
        applicationUrl?: string | null;
        resumeIdUsed?: string | null;
        coverLetterDocUri?: string | null;
        notes?: string | null;
      };

      const canonicalJobId = parsed.canonicalJobId;
      if (!canonicalJobId) {
        sendJson(res, 400, { error: 'invalid_request_body' });
        return;
      }

      if (canonicalJobId !== visibleCanonicalJobId && canonicalJobId !== hiddenCanonicalJobId) {
        sendJson(res, 404, { error: 'canonical_job_not_found' });
        return;
      }

      const existing = [...applications.values()].find(
        (record) => record.canonicalJobId === canonicalJobId,
      );

      if (existing) {
        sendJson(res, 409, { error: 'application_already_exists_for_job' });
        return;
      }

      const status = parsed.status ?? 'ready_to_apply';
      if (!applicationStatuses.has(status)) {
        sendJson(res, 400, { error: 'invalid_application_status_filter' });
        return;
      }

      const nowIso = '2026-04-12T12:30:00.000Z';
      const application = {
        applicationId: nextApplicationId(),
        userId,
        canonicalJobId,
        status,
        appliedAt: status === 'ready_to_apply' ? null : nowIso,
        applicationUrl: normalizeNullableText(parsed.applicationUrl) ?? null,
        resumeIdUsed: normalizeNullableText(parsed.resumeIdUsed) ?? null,
        coverLetterDocUri: normalizeNullableText(parsed.coverLetterDocUri) ?? null,
        notes: normalizeNullableText(parsed.notes) ?? null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      applications.set(application.applicationId, application);

      sendJson(res, 200, {
        contractVersion: 'v1',
        application,
      });
      return;
    }

    if (method === 'GET') {
      const applicationId = parseApplicationPath(pathname);
      if (applicationId) {
        const record = applications.get(applicationId);
        if (!record) {
          sendJson(res, 404, { error: 'application_not_found' });
          return;
        }

        sendJson(res, 200, {
          contractVersion: 'v1',
          application: record,
        });
        return;
      }
    }

    if (method === 'PUT') {
      const applicationId = parseApplicationPath(pathname);
      if (applicationId) {
        const existing = applications.get(applicationId);
        if (!existing) {
          sendJson(res, 404, { error: 'application_not_found' });
          return;
        }

        const body = await readRequestBody(req);
        const parsed = JSON.parse(body) as {
          status?: string;
          applicationUrl?: string | null;
          resumeIdUsed?: string | null;
          coverLetterDocUri?: string | null;
          notes?: string | null;
        };

        if (
          parsed.status === undefined &&
          parsed.applicationUrl === undefined &&
          parsed.resumeIdUsed === undefined &&
          parsed.coverLetterDocUri === undefined &&
          parsed.notes === undefined
        ) {
          sendJson(res, 400, { error: 'invalid_request_body' });
          return;
        }

        if (parsed.status !== undefined && !applicationStatuses.has(parsed.status)) {
          sendJson(res, 400, { error: 'invalid_application_status_filter' });
          return;
        }

        const nowIso = '2026-04-12T12:45:00.000Z';
        const nextStatus = parsed.status ?? existing.status;

        const updated = {
          ...existing,
          status: nextStatus,
          appliedAt:
            nextStatus === 'ready_to_apply'
              ? existing.appliedAt
              : existing.appliedAt ?? nowIso,
          applicationUrl:
            parsed.applicationUrl === undefined
              ? existing.applicationUrl
              : (normalizeNullableText(parsed.applicationUrl) ?? null),
          resumeIdUsed:
            parsed.resumeIdUsed === undefined
              ? existing.resumeIdUsed
              : (normalizeNullableText(parsed.resumeIdUsed) ?? null),
          coverLetterDocUri:
            parsed.coverLetterDocUri === undefined
              ? existing.coverLetterDocUri
              : (normalizeNullableText(parsed.coverLetterDocUri) ?? null),
          notes:
            parsed.notes === undefined
              ? existing.notes
              : (normalizeNullableText(parsed.notes) ?? null),
          updatedAt: nowIso,
        };

        applications.set(applicationId, updated);

        sendJson(res, 200, {
          contractVersion: 'v1',
          application: updated,
        });
        return;
      }
    }

    if (method === 'GET' && pathname === `/v1/feed/${visibleCanonicalJobId}`) {
      sendJson(res, 200, feedDetailResponse);
      return;
    }

    if (method === 'GET' && pathname.startsWith('/v1/feed/')) {
      sendJson(res, 404, { error: 'canonical_job_not_found' });
      return;
    }

    if (method === 'POST' && pathname === '/v1/connectors/greenhouse_public_board/sync') {
      sendJson(res, 200, {
        contractVersion: 'v1',
        sourceName: 'greenhouse_public_board',
        startedAt: '2026-04-12T12:00:00.000Z',
        completedAt: '2026-04-12T12:00:01.000Z',
        fetchedCount: 2,
        insertedCount: 1,
        updatedCount: 1,
        unchangedCount: 0,
        failedCount: 0,
        healthStatus: 'healthy',
        errors: [],
      });
      return;
    }

    if (method === 'GET' && pathname === '/v1/connectors') {
      sendJson(res, 200, {
        contractVersion: 'v1',
        connectors: [
          {
            sourceName: 'greenhouse_public_board',
            displayName: 'Greenhouse Public Board',
            connectorVersion: 'greenhouse-public-board-v1',
            healthStatus: 'healthy',
            lastSyncAt: '2026-04-12T12:00:00.000Z',
            lastSuccessAt: '2026-04-12T12:00:00.000Z',
            lastFailureAt: null,
            lastErrorCode: null,
          },
          {
            sourceName: 'arbeitnow_job_board',
            displayName: 'Arbeitnow Job Board',
            connectorVersion: 'arbeitnow-job-board-v1',
            healthStatus: 'healthy',
            lastSyncAt: '2026-04-12T12:00:00.000Z',
            lastSuccessAt: '2026-04-12T12:00:00.000Z',
            lastFailureAt: null,
            lastErrorCode: null,
          },
          {
            sourceName: 'lever_public_board',
            displayName: 'Lever Public Board',
            connectorVersion: 'lever-public-board-v1',
            healthStatus: 'healthy',
            lastSyncAt: '2026-04-12T12:00:00.000Z',
            lastSuccessAt: '2026-04-12T12:00:00.000Z',
            lastFailureAt: null,
            lastErrorCode: null,
          },
        ],
      });
      return;
    }

    if (method === 'POST' && pathname === '/v1/connectors/lever_public_board/sync') {
      sendJson(res, 200, {
        contractVersion: 'v1',
        sourceName: 'lever_public_board',
        startedAt: '2026-04-12T12:00:00.000Z',
        completedAt: '2026-04-12T12:00:01.000Z',
        fetchedCount: 0,
        insertedCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        failedCount: 0,
        healthStatus: 'healthy',
        errors: [],
      });
      return;
    }

    if (method === 'POST' && pathname === '/v1/connectors/arbeitnow_job_board/sync') {
      sendJson(res, 200, {
        contractVersion: 'v1',
        sourceName: 'arbeitnow_job_board',
        startedAt: '2026-04-12T12:00:00.000Z',
        completedAt: '2026-04-12T12:00:01.000Z',
        fetchedCount: 3,
        insertedCount: 2,
        updatedCount: 1,
        unchangedCount: 0,
        failedCount: 0,
        healthStatus: 'healthy',
        errors: [],
      });
      return;
    }

    if (method === 'POST' && pathname === '/v1/canonical-jobs/rebuild') {
      const body = await readRequestBody(req);
      const parsed = JSON.parse(body) as { maxSourceJobs?: number };

      if (
        parsed.maxSourceJobs !== undefined &&
        (!Number.isInteger(parsed.maxSourceJobs) || parsed.maxSourceJobs < 1)
      ) {
        sendJson(res, 400, { error: 'invalid_source_job_limit' });
        return;
      }

      sendJson(res, 200, {
        contractVersion: 'v1',
        startedAt: '2026-04-12T12:00:00.000Z',
        completedAt: '2026-04-12T12:00:02.000Z',
        sourceJobsScanned: 2,
        canonicalJobsCreated: 1,
        canonicalJobsUpdated: 0,
        dedupedSourceJobs: 1,
      });
      return;
    }

    sendJson(res, 404, { error: 'not_found' });
  });
  };

const startServer = async (
  server: Server,
): Promise<{ baseUrl: string; close: () => Promise<void> }> => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed_to_start_server');
  }

  return {
    baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error?: Error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
};

const signInAndGetCookie = async (webBaseUrl: string): Promise<string> => {
  const response = await fetch(`${webBaseUrl}/session`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'email=step6%40test.dev&mode=register&returnTo=%2F',
    redirect: 'manual',
  });

  assert.equal(response.status, 303);
  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie);

  const cookie = setCookie.split(';')[0];
  assert.ok(cookie.startsWith('jh_access_token='));

  return cookie;
};

test('feed root renders sign-in when session is missing', async () => {
  const api = await startServer(createApiStubServer());
  const web = await startServer(createWebServer({ apiBaseUrl: api.baseUrl }));

  try {
    const response = await fetch(`${web.baseUrl}/`);
    assert.equal(response.status, 200);

    const html = await response.text();
    assert.match(html, /Sign in to your feed/);
    assert.match(html, /Create account/);
  } finally {
    await web.close();
    await api.close();
  }
});

test('session route defaults to register when mode is omitted', async () => {
  const api = await startServer(createApiStubServer());
  const web = await startServer(createWebServer({ apiBaseUrl: api.baseUrl }));

  try {
    const response = await fetch(`${web.baseUrl}/session`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'email=mode.default%40test.dev&returnTo=%2F',
      redirect: 'manual',
    });

    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/?notice=account_created');

    const setCookie = response.headers.get('set-cookie');
    assert.ok(setCookie);
    assert.match(setCookie, /jh_access_token=/);
  } finally {
    await web.close();
    await api.close();
  }
});

test('authenticated feed hides preference-hidden jobs by default', async () => {
  const api = await startServer(createApiStubServer());
  const web = await startServer(createWebServer({ apiBaseUrl: api.baseUrl }));

  try {
    const cookie = await signInAndGetCookie(web.baseUrl);

    const response = await fetch(`${web.baseUrl}/`, {
      headers: {
        cookie,
      },
    });

    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Visible Systems/);
    assert.doesNotMatch(html, /Hidden Corp/);
    assert.match(html, /Showing <strong>1<\/strong> of <strong>2<\/strong>/);
    assert.match(html, /High-fit alerts/);
    assert.match(html, /High-fit alert: Senior Platform Engineer at Visible Systems scored 88\.0\./);
    assert.match(html, /Jump to job/);
    assert.match(html, /Today priorities/);
    assert.match(html, /High-fit opportunity/);
    assert.match(html, /<select name="source">/);
    assert.match(html, /Lever Public Board/);

    const includeHiddenResponse = await fetch(
      `${web.baseUrl}/?includeHidden=1&remote=any&recommendation=all`,
      {
      headers: {
        cookie,
      },
      },
    );

    const includeHiddenHtml = await includeHiddenResponse.text();
    assert.match(includeHiddenHtml, /Hidden Corp/);

    const sourceFilteredResponse = await fetch(
      `${web.baseUrl}/?includeHidden=1&remote=any&recommendation=all&source=lever_public_board`,
      {
      headers: {
        cookie,
      },
      },
    );

    const sourceFilteredHtml = await sourceFilteredResponse.text();
    assert.match(sourceFilteredHtml, /Visible Systems/);
    assert.doesNotMatch(sourceFilteredHtml, /Hidden Corp/);
    assert.match(sourceFilteredHtml, /Source: Lever Public Board/);
  } finally {
    await web.close();
    await api.close();
  }
});

test('profile page saves editable profile and preference fields', async () => {
  const api = await startServer(createApiStubServer());
  const web = await startServer(createWebServer({ apiBaseUrl: api.baseUrl }));

  try {
    const cookie = await signInAndGetCookie(web.baseUrl);

    const profileResponse = await fetch(`${web.baseUrl}/profile?returnTo=%2F`, {
      headers: {
        cookie,
      },
    });

    assert.equal(profileResponse.status, 200);
    const profileHtml = await profileResponse.text();
    assert.match(profileHtml, /Profile and preferences/);
    assert.match(profileHtml, /TypeScript/);

    const saveResponse = await fetch(`${web.baseUrl}/actions/profile/save`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie,
      },
      body: [
        'returnTo=%2F',
        'currentTitle=Principal+Platform+Engineer',
        'preferredSkills=TypeScript%0ARust%0APostgreSQL',
        'remotePreference=remote',
      ].join('&'),
      redirect: 'manual',
    });

    assert.equal(saveResponse.status, 303);
    assert.match(
      saveResponse.headers.get('location') ?? '',
      /^\/profile\?returnTo=%2F&notice=profile_saved$/,
    );

    const refreshedProfileResponse = await fetch(
      `${web.baseUrl}/profile?returnTo=%2F`,
      {
        headers: {
          cookie,
        },
      },
    );

    assert.equal(refreshedProfileResponse.status, 200);
    const refreshedProfileHtml = await refreshedProfileResponse.text();
    assert.match(refreshedProfileHtml, /Principal Platform Engineer/);
    assert.match(refreshedProfileHtml, /Rust/);
  } finally {
    await web.close();
    await api.close();
  }
});

test('feed priorities queue reminders before high-fit and shortlisted follow-through', async () => {
  const api = await startServer(createApiStubServer());
  const web = await startServer(createWebServer({ apiBaseUrl: api.baseUrl }));

  try {
    const cookie = await signInAndGetCookie(web.baseUrl);

    const initialResponse = await fetch(
      `${web.baseUrl}/?includeHidden=1&remote=any&recommendation=all`,
      {
        headers: {
          cookie,
        },
      },
    );

    assert.equal(initialResponse.status, 200);
    const initialHtml = await initialResponse.text();
    assert.match(initialHtml, /Today priorities/);
    assert.match(initialHtml, /Pending reminder/);
    assert.match(initialHtml, /High-fit opportunity/);

    const reminderIndex = initialHtml.indexOf('Pending reminder');
    const highFitIndex = initialHtml.indexOf('High-fit opportunity');
    assert.ok(reminderIndex >= 0);
    assert.ok(highFitIndex >= 0);
    assert.ok(reminderIndex < highFitIndex);

    const shortlistResponse = await fetch(`${web.baseUrl}/actions/tracker`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie,
      },
      body: `canonicalJobId=${encodeURIComponent(visibleCanonicalJobId)}&action=shortlist&returnTo=%2F`,
      redirect: 'manual',
    });

    assert.equal(shortlistResponse.status, 303);
    assert.equal(shortlistResponse.headers.get('location'), '/?notice=tracker_shortlisted');

    const afterShortlistResponse = await fetch(
      `${web.baseUrl}/?includeHidden=1&remote=any&recommendation=all`,
      {
        headers: {
          cookie,
        },
      },
    );

    assert.equal(afterShortlistResponse.status, 200);
    const afterShortlistHtml = await afterShortlistResponse.text();
    assert.match(afterShortlistHtml, /Pending reminder/);
    assert.match(afterShortlistHtml, /Shortlisted follow-through/);
    assert.doesNotMatch(afterShortlistHtml, /High-fit opportunity/);

    const shortlistedIndex = afterShortlistHtml.indexOf('Shortlisted follow-through');
    const queuedReminderIndex = afterShortlistHtml.indexOf('Pending reminder');
    assert.ok(queuedReminderIndex >= 0);
    assert.ok(shortlistedIndex >= 0);
    assert.ok(queuedReminderIndex < shortlistedIndex);
  } finally {
    await web.close();
    await api.close();
  }
});

test('feed saved-search actions create and delete reusable lead presets', async () => {
  const api = await startServer(createApiStubServer());
  const web = await startServer(createWebServer({ apiBaseUrl: api.baseUrl }));

  try {
    const cookie = await signInAndGetCookie(web.baseUrl);

    const createResponse = await fetch(`${web.baseUrl}/actions/saved-searches/create`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie,
      },
      body: [
        'name=Remote%20Backend%20Push',
        'q=backend',
        'recommendation=apply',
        'remote=remote',
        'source=lever_public_board',
        'sort=recent',
        'includeHidden=0',
        'returnTo=%2F',
      ].join('&'),
      redirect: 'manual',
    });

    assert.equal(createResponse.status, 303);
    assert.equal(createResponse.headers.get('location'), '/?notice=saved_search_created');

    const createdFeedResponse = await fetch(`${web.baseUrl}/?recommendation=all&remote=any`, {
      headers: {
        cookie,
      },
    });

    assert.equal(createdFeedResponse.status, 200);
    const createdFeedHtml = await createdFeedResponse.text();
    assert.match(createdFeedHtml, /Saved searches/);
    assert.match(createdFeedHtml, /Remote Backend Push/);
    assert.match(
      createdFeedHtml,
      /\/\?q=backend&amp;recommendation=apply&amp;remote=remote&amp;source=lever_public_board&amp;sort=recent/,
    );

    const deleteResponse = await fetch(`${web.baseUrl}/actions/saved-searches/delete`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie,
      },
      body: 'savedSearchId=33333333-3333-4333-8333-000000000001&returnTo=%2F',
      redirect: 'manual',
    });

    assert.equal(deleteResponse.status, 303);
    assert.equal(deleteResponse.headers.get('location'), '/?notice=saved_search_deleted');

    const afterDeleteResponse = await fetch(`${web.baseUrl}/?recommendation=all&remote=any`, {
      headers: {
        cookie,
      },
    });

    const afterDeleteHtml = await afterDeleteResponse.text();
    assert.doesNotMatch(afterDeleteHtml, /Remote Backend Push/);
  } finally {
    await web.close();
    await api.close();
  }
});

test('feed tracker actions save, shortlist, and hide jobs from discovery', async () => {
  const api = await startServer(createApiStubServer());
  const web = await startServer(createWebServer({ apiBaseUrl: api.baseUrl }));

  try {
    const cookie = await signInAndGetCookie(web.baseUrl);

    const saveResponse = await fetch(`${web.baseUrl}/actions/tracker`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie,
      },
      body: `canonicalJobId=${encodeURIComponent(visibleCanonicalJobId)}&action=save&returnTo=%2F`,
      redirect: 'manual',
    });

    assert.equal(saveResponse.status, 303);
    assert.equal(saveResponse.headers.get('location'), '/?notice=tracker_saved');

    const shortlistResponse = await fetch(`${web.baseUrl}/actions/tracker`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie,
      },
      body: `canonicalJobId=${encodeURIComponent(visibleCanonicalJobId)}&action=shortlist&returnTo=%2F`,
      redirect: 'manual',
    });

    assert.equal(shortlistResponse.status, 303);
    assert.equal(shortlistResponse.headers.get('location'), '/?notice=tracker_shortlisted');

    const hideResponse = await fetch(`${web.baseUrl}/actions/tracker`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie,
      },
      body: `canonicalJobId=${encodeURIComponent(visibleCanonicalJobId)}&action=hide&returnTo=%2F`,
      redirect: 'manual',
    });

    assert.equal(hideResponse.status, 303);
    assert.equal(hideResponse.headers.get('location'), '/?notice=tracker_hidden');

    const defaultFeedResponse = await fetch(`${web.baseUrl}/`, {
      headers: {
        cookie,
      },
    });

    const defaultFeedHtml = await defaultFeedResponse.text();
    assert.match(defaultFeedHtml, /No jobs match this filter set/);

    const includeHiddenResponse = await fetch(
      `${web.baseUrl}/?includeHidden=1&remote=any&recommendation=all`,
      {
        headers: {
          cookie,
        },
      },
    );

    assert.equal(includeHiddenResponse.status, 200);
    const includeHiddenHtml = await includeHiddenResponse.text();
    assert.match(includeHiddenHtml, /Visible Systems/);
    assert.match(includeHiddenHtml, /Archived/);
  } finally {
    await web.close();
    await api.close();
  }
});

test('job detail renders score and dedupe context; sync and rebuild actions redirect with notices', async () => {
  const api = await startServer(createApiStubServer());
  const web = await startServer(createWebServer({ apiBaseUrl: api.baseUrl }));

  try {
    const cookie = await signInAndGetCookie(web.baseUrl);

    const detailResponse = await fetch(
      `${web.baseUrl}/jobs/${visibleCanonicalJobId}?returnTo=%2F`,
      {
        headers: {
          cookie,
        },
      },
    );

    assert.equal(detailResponse.status, 200);
    const detailHtml = await detailResponse.text();
    assert.match(detailHtml, /Score rationale/);
    assert.match(detailHtml, /Linked To Canonical/);
    assert.match(detailHtml, /Next action/);
    assert.match(detailHtml, /Source listing details/);
    assert.match(detailHtml, /Open listing/);
    assert.match(detailHtml, /Full description/);
    assert.match(detailHtml, /scale TypeScript APIs and PostgreSQL workloads/);

    const syncResponse = await fetch(`${web.baseUrl}/actions/sync`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie,
      },
      body: 'returnTo=%2F',
      redirect: 'manual',
    });

    assert.equal(syncResponse.status, 303);
    assert.equal(syncResponse.headers.get('location'), '/?notice=sync_complete');

    const rebuildResponse = await fetch(`${web.baseUrl}/actions/rebuild`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie,
      },
      body: 'returnTo=%2F',
      redirect: 'manual',
    });

    assert.equal(rebuildResponse.status, 303);
    assert.equal(rebuildResponse.headers.get('location'), '/?notice=rebuild_complete');
  } finally {
    await web.close();
    await api.close();
  }
});

test('application workflow routes create, list, detail, and update through web actions', async () => {
  const api = await startServer(createApiStubServer());
  const web = await startServer(createWebServer({ apiBaseUrl: api.baseUrl }));

  try {
    const cookie = await signInAndGetCookie(web.baseUrl);

    const createResponse = await fetch(`${web.baseUrl}/actions/applications/create`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie,
      },
      body: `canonicalJobId=${encodeURIComponent(visibleCanonicalJobId)}&status=ready_to_apply&returnTo=%2F`,
      redirect: 'manual',
    });

    assert.equal(createResponse.status, 303);
    const createLocation = createResponse.headers.get('location');
    assert.ok(createLocation);
    assert.match(createLocation, /^\/applications\/[0-9a-f-]{36}\?returnTo=%2F&notice=application_created$/);

    const applicationIdMatch = createLocation.match(/^\/applications\/([0-9a-f-]{36})\?/);
    assert.ok(applicationIdMatch);
    const applicationId = applicationIdMatch[1];

    const listResponse = await fetch(`${web.baseUrl}/applications?returnTo=%2F`, {
      headers: {
        cookie,
      },
    });

    assert.equal(listResponse.status, 200);
    const listHtml = await listResponse.text();
    assert.match(listHtml, /Application tracker/);
    assert.match(listHtml, /Senior Platform Engineer/);
    assert.match(listHtml, /Ready To Apply/);

    const detailResponse = await fetch(`${web.baseUrl}${createLocation}`, {
      headers: {
        cookie,
      },
    });

    assert.equal(detailResponse.status, 200);
    const detailHtml = await detailResponse.text();
    assert.match(detailHtml, /Application detail/);
    assert.match(detailHtml, /Material assistant/);
    assert.match(detailHtml, /Keyword suggestions/);

    const updateResponse = await fetch(`${web.baseUrl}/actions/applications/update`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie,
      },
      body: `applicationId=${encodeURIComponent(applicationId)}&status=interview&notes=${encodeURIComponent(
        'Panel loop scheduled',
      )}&returnTo=%2Fapplications`,
      redirect: 'manual',
    });

    assert.equal(updateResponse.status, 303);
    assert.equal(updateResponse.headers.get('location'), '/applications?notice=application_updated');

    const filteredResponse = await fetch(`${web.baseUrl}/applications?status=interview`, {
      headers: {
        cookie,
      },
    });

    assert.equal(filteredResponse.status, 200);
    const filteredHtml = await filteredResponse.text();
    assert.match(filteredHtml, /Interview/);
    assert.match(filteredHtml, /Senior Platform Engineer/);
  } finally {
    await web.close();
    await api.close();
  }
});
