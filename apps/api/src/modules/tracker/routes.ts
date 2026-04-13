import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  canonicalJobIdSchema,
  trackerDiscoveryActionRequestSchema,
  trackerDiscoveryActionSchema,
  trackerContractVersion,
  trackerStateSchema,
  trackerTransitionRequestSchema,
  type TrackerState,
} from '@job-hunter/shared';

import { HttpError } from '../../http/http-errors.js';
import { readJsonBody, sendJson } from '../../http/json.js';
import type { AuthProfileService } from '../auth-profile/service.js';
import type { TrackerService } from './service.js';

export interface TrackerRoutesDependencies {
  authProfileService: AuthProfileService;
  trackerService: TrackerService;
}

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
    throw new HttpError(400, 'invalid_tracker_limit', {
      limit: rawLimit,
    });
  }

  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit)) {
    throw new HttpError(400, 'invalid_tracker_limit', {
      limit: rawLimit,
    });
  }

  return limit;
};

const parseStateFilter = (rawState: string | null): TrackerState | undefined => {
  if (rawState === null) {
    return undefined;
  }

  const parsed = trackerStateSchema.safeParse(rawState);
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_tracker_state_filter', {
      state: rawState,
    });
  }

  return parsed.data;
};

const parseTrackerPathParam = (pathname: string): string | null => {
  const prefix = '/v1/tracker/jobs/';
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const pathParam = pathname.slice(prefix.length);
  if (!pathParam || pathParam.includes('/')) {
    return null;
  }

  return pathParam;
};

const parseTrackerActionPath = (
  pathname: string,
  suffix: '/state' | '/history',
): string | null => {
  const prefix = '/v1/tracker/jobs/';
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) {
    return null;
  }

  const pathParam = pathname.slice(prefix.length, -suffix.length);
  if (!pathParam || pathParam.includes('/')) {
    return null;
  }

  return pathParam;
};

const parseTrackerDiscoveryActionPath = (
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

export const handleTrackerRoutes = async (
  req: IncomingMessage,
  res: ServerResponse,
  { authProfileService, trackerService }: TrackerRoutesDependencies,
): Promise<boolean> => {
  const method = req.method ?? 'GET';
  const requestUrl = getUrl(req);
  const pathname = requestUrl.pathname;

  if (method === 'GET' && pathname === '/v1/tracker/jobs') {
    const accessToken = requireAccessToken(req);
    const user = await authProfileService.authenticate(accessToken);

    const limit = parseLimitQuery(requestUrl.searchParams.get('limit'));
    const state = parseStateFilter(requestUrl.searchParams.get('state'));

    const trackers = await trackerService.listTrackedJobs({
      userId: user.userId,
      state,
      limit,
    });

    sendJson(res, 200, {
      contractVersion: trackerContractVersion,
      trackers,
    });
    return true;
  }

  if (method === 'GET') {
    const pathParam = parseTrackerActionPath(pathname, '/history');
    if (pathParam) {
      const parsedCanonicalJobId = canonicalJobIdSchema.safeParse(pathParam);
      if (!parsedCanonicalJobId.success) {
        throw new HttpError(400, 'invalid_canonical_job_id', {
          canonicalJobId: pathParam,
        });
      }

      const accessToken = requireAccessToken(req);
      const user = await authProfileService.authenticate(accessToken);
      const limit = parseLimitQuery(requestUrl.searchParams.get('limit'));

      const events = await trackerService.listTransitionEvents({
        userId: user.userId,
        canonicalJobId: parsedCanonicalJobId.data,
        limit,
      });

      sendJson(res, 200, {
        contractVersion: trackerContractVersion,
        canonicalJobId: parsedCanonicalJobId.data,
        events,
      });
      return true;
    }
  }

  if (method === 'PUT') {
    const pathParam = parseTrackerActionPath(pathname, '/state');
    if (pathParam) {
      const parsedCanonicalJobId = canonicalJobIdSchema.safeParse(pathParam);
      if (!parsedCanonicalJobId.success) {
        throw new HttpError(400, 'invalid_canonical_job_id', {
          canonicalJobId: pathParam,
        });
      }

      const accessToken = requireAccessToken(req);
      const user = await authProfileService.authenticate(accessToken);
      const payload = await parseBody(req, trackerTransitionRequestSchema);

      const result = await trackerService.transitionTrackedJobState(user.userId, {
        canonicalJobId: parsedCanonicalJobId.data,
        targetState: payload.targetState,
        note: payload.note,
      });

      sendJson(res, 200, {
        contractVersion: trackerContractVersion,
        tracker: result.tracker,
        event: result.event,
      });
      return true;
    }
  }

  if (method === 'POST') {
    const actionPath = parseTrackerDiscoveryActionPath(pathname);
    if (actionPath) {
      const parsedCanonicalJobId = canonicalJobIdSchema.safeParse(
        actionPath.canonicalJobId,
      );
      if (!parsedCanonicalJobId.success) {
        throw new HttpError(400, 'invalid_canonical_job_id', {
          canonicalJobId: actionPath.canonicalJobId,
        });
      }

      const parsedAction = trackerDiscoveryActionSchema.safeParse(actionPath.action);
      if (!parsedAction.success) {
        throw new HttpError(400, 'invalid_tracker_discovery_action', {
          action: actionPath.action,
        });
      }

      const accessToken = requireAccessToken(req);
      const user = await authProfileService.authenticate(accessToken);
      const payload = await parseBody(req, trackerDiscoveryActionRequestSchema);

      const result = await trackerService.applyDiscoveryAction(user.userId, {
        canonicalJobId: parsedCanonicalJobId.data,
        action: parsedAction.data,
        note: payload.note,
      });

      sendJson(res, 200, {
        contractVersion: trackerContractVersion,
        action: result.action,
        tracker: result.tracker,
        event: result.event,
      });
      return true;
    }
  }

  if (method === 'GET') {
    const pathParam = parseTrackerPathParam(pathname);
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
    const user = await authProfileService.authenticate(accessToken);

    const tracker = await trackerService.getTrackedJob(
      user.userId,
      parsedCanonicalJobId.data,
    );

    if (!tracker) {
      throw new HttpError(404, 'tracker_state_not_found', {
        canonicalJobId: parsedCanonicalJobId.data,
      });
    }

    sendJson(res, 200, {
      contractVersion: trackerContractVersion,
      tracker,
    });
    return true;
  }

  return false;
};
