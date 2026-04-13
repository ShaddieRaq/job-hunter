import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  canonicalJobIdSchema,
  canonicalRebuildRequestSchema,
  jobsContractVersion,
} from '@job-hunter/shared';

import { HttpError } from '../../http/http-errors.js';
import { readJsonBody, sendJson } from '../../http/json.js';
import type { AuthProfileService } from '../auth-profile/service.js';
import type { CanonicalJobsService } from './service.js';

export interface CanonicalJobRoutesDependencies {
  authProfileService: AuthProfileService;
  canonicalJobsService: CanonicalJobsService;
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

export const handleCanonicalJobRoutes = async (
  req: IncomingMessage,
  res: ServerResponse,
  { authProfileService, canonicalJobsService }: CanonicalJobRoutesDependencies,
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
