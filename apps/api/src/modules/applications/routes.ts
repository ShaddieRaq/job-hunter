import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  applicationCreateRequestSchema,
  applicationIdSchema,
  applicationStatusSchema,
  applicationUpdateRequestSchema,
  applicationsContractVersion,
  canonicalJobIdSchema,
  type ApplicationStatus,
} from '@job-hunter/shared';

import { HttpError } from '../../http/http-errors.js';
import { readJsonBody, sendJson } from '../../http/json.js';
import type { AuthProfileService } from '../auth-profile/service.js';
import type { ApplicationService } from './service.js';

export interface ApplicationRoutesDependencies {
  authProfileService: AuthProfileService;
  applicationService: ApplicationService;
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
    throw new HttpError(400, 'invalid_application_limit', {
      limit: rawLimit,
    });
  }

  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit)) {
    throw new HttpError(400, 'invalid_application_limit', {
      limit: rawLimit,
    });
  }

  return limit;
};

const parseStatusQuery = (
  rawStatus: string | null,
): ApplicationStatus | undefined => {
  if (rawStatus === null) {
    return undefined;
  }

  const parsed = applicationStatusSchema.safeParse(rawStatus);
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_application_status_filter', {
      status: rawStatus,
    });
  }

  return parsed.data;
};

const parseCanonicalJobIdQuery = (
  rawCanonicalJobId: string | null,
): string | undefined => {
  if (rawCanonicalJobId === null) {
    return undefined;
  }

  const parsed = canonicalJobIdSchema.safeParse(rawCanonicalJobId);
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_canonical_job_id', {
      canonicalJobId: rawCanonicalJobId,
    });
  }

  return parsed.data;
};

const parseApplicationPathParam = (pathname: string): string | null => {
  const prefix = '/v1/applications/';
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const pathParam = pathname.slice(prefix.length);
  if (!pathParam || pathParam.includes('/')) {
    return null;
  }

  return pathParam;
};

const parseApplicationMaterialGuidancePathParam = (
  pathname: string,
): string | null => {
  const prefix = '/v1/applications/';
  const suffix = '/material-guidance';

  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) {
    return null;
  }

  const pathParam = pathname.slice(prefix.length, -suffix.length);
  if (!pathParam || pathParam.includes('/')) {
    return null;
  }

  return pathParam;
};

export const handleApplicationRoutes = async (
  req: IncomingMessage,
  res: ServerResponse,
  { authProfileService, applicationService }: ApplicationRoutesDependencies,
): Promise<boolean> => {
  const method = req.method ?? 'GET';
  const requestUrl = getUrl(req);
  const pathname = requestUrl.pathname;

  if (method === 'GET' && pathname === '/v1/applications') {
    const accessToken = requireAccessToken(req);
    const user = await authProfileService.authenticate(accessToken);

    const limit = parseLimitQuery(requestUrl.searchParams.get('limit'));
    const status = parseStatusQuery(requestUrl.searchParams.get('status'));
    const canonicalJobId = parseCanonicalJobIdQuery(
      requestUrl.searchParams.get('canonicalJobId'),
    );

    const applications = await applicationService.listApplications({
      userId: user.userId,
      status,
      canonicalJobId,
      limit,
    });

    sendJson(res, 200, {
      contractVersion: applicationsContractVersion,
      applications,
    });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/applications') {
    const accessToken = requireAccessToken(req);
    const user = await authProfileService.authenticate(accessToken);
    const payload = await parseBody(req, applicationCreateRequestSchema);

    const application = await applicationService.createApplication(
      user.userId,
      payload,
    );

    sendJson(res, 200, {
      contractVersion: applicationsContractVersion,
      application,
    });
    return true;
  }

  if (method === 'PUT') {
    const pathParam = parseApplicationPathParam(pathname);
    if (pathParam) {
      const parsedApplicationId = applicationIdSchema.safeParse(pathParam);
      if (!parsedApplicationId.success) {
        throw new HttpError(400, 'invalid_application_id', {
          applicationId: pathParam,
        });
      }

      const accessToken = requireAccessToken(req);
      const user = await authProfileService.authenticate(accessToken);
      const payload = await parseBody(req, applicationUpdateRequestSchema);

      const application = await applicationService.updateApplication(
        user.userId,
        parsedApplicationId.data,
        payload,
      );

      sendJson(res, 200, {
        contractVersion: applicationsContractVersion,
        application,
      });
      return true;
    }
  }

  if (method === 'GET') {
    const guidancePathParam = parseApplicationMaterialGuidancePathParam(pathname);
    if (guidancePathParam) {
      const parsedApplicationId = applicationIdSchema.safeParse(guidancePathParam);
      if (!parsedApplicationId.success) {
        throw new HttpError(400, 'invalid_application_id', {
          applicationId: guidancePathParam,
        });
      }

      const accessToken = requireAccessToken(req);
      const user = await authProfileService.authenticate(accessToken);
      const [profile, preferences] = await Promise.all([
        authProfileService.getProfile(user.userId),
        authProfileService.getPreferences(user.userId),
      ]);

      const guidance = await applicationService.getApplicationMaterialGuidance({
        userId: user.userId,
        applicationId: parsedApplicationId.data,
        profile,
        preferences,
      });

      sendJson(res, 200, {
        contractVersion: applicationsContractVersion,
        guidance,
      });
      return true;
    }
  }

  if (method === 'GET') {
    const pathParam = parseApplicationPathParam(pathname);
    if (!pathParam) {
      return false;
    }

    const parsedApplicationId = applicationIdSchema.safeParse(pathParam);
    if (!parsedApplicationId.success) {
      throw new HttpError(400, 'invalid_application_id', {
        applicationId: pathParam,
      });
    }

    const accessToken = requireAccessToken(req);
    const user = await authProfileService.authenticate(accessToken);

    const application = await applicationService.getApplication(
      user.userId,
      parsedApplicationId.data,
    );

    if (!application) {
      throw new HttpError(404, 'application_not_found', {
        applicationId: parsedApplicationId.data,
      });
    }

    sendJson(res, 200, {
      contractVersion: applicationsContractVersion,
      application,
    });
    return true;
  }

  return false;
};
