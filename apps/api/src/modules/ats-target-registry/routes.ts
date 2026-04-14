import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  atsTargetCreateRequestSchema,
  atsTargetIdSchema,
  atsTargetsContractVersion,
  atsTargetUpdateRequestSchema,
  atsTargetVerificationStatusSchema,
  atsVendorSchema,
  type AtsTargetVerificationStatus,
  type AtsVendor,
} from '@job-hunter/shared';

import { HttpError } from '../../http/http-errors.js';
import { readJsonBody, sendJson } from '../../http/json.js';
import type { AuthProfileService } from '../auth-profile/service.js';
import type { AtsTargetRegistryService } from './service.js';

export interface AtsTargetRegistryRoutesDependencies {
  authProfileService: AuthProfileService;
  atsTargetRegistryService: AtsTargetRegistryService;
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
    throw new HttpError(400, 'invalid_ats_target_limit', {
      limit: rawLimit,
    });
  }

  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit)) {
    throw new HttpError(400, 'invalid_ats_target_limit', {
      limit: rawLimit,
    });
  }

  return limit;
};

const parseOffsetQuery = (rawOffset: string | null): number | undefined => {
  if (rawOffset === null) {
    return undefined;
  }

  if (!/^\d+$/.test(rawOffset)) {
    throw new HttpError(400, 'invalid_ats_target_offset', {
      offset: rawOffset,
    });
  }

  const offset = Number(rawOffset);
  if (!Number.isSafeInteger(offset)) {
    throw new HttpError(400, 'invalid_ats_target_offset', {
      offset: rawOffset,
    });
  }

  return offset;
};

const parseVendorQuery = (rawVendor: string | null): AtsVendor | undefined => {
  if (rawVendor === null) {
    return undefined;
  }

  const parsed = atsVendorSchema.safeParse(rawVendor);
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_ats_target_vendor_filter', {
      atsVendor: rawVendor,
    });
  }

  return parsed.data;
};

const parseStatusQuery = (
  rawStatus: string | null,
): AtsTargetVerificationStatus | undefined => {
  if (rawStatus === null) {
    return undefined;
  }

  const parsed = atsTargetVerificationStatusSchema.safeParse(rawStatus);
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_ats_target_status_filter', {
      verificationStatus: rawStatus,
    });
  }

  return parsed.data;
};

const parseTargetPathParam = (pathname: string): string | null => {
  const prefix = '/v1/ats-targets/';
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const pathParam = pathname.slice(prefix.length);
  if (!pathParam || pathParam.includes('/')) {
    return null;
  }

  return pathParam;
};

export const handleAtsTargetRegistryRoutes = async (
  req: IncomingMessage,
  res: ServerResponse,
  { authProfileService, atsTargetRegistryService }: AtsTargetRegistryRoutesDependencies,
): Promise<boolean> => {
  const method = req.method ?? 'GET';
  const requestUrl = getUrl(req);
  const pathname = requestUrl.pathname;

  if (method === 'GET' && pathname === '/v1/ats-targets') {
    const accessToken = requireAccessToken(req);
    await authProfileService.authenticate(accessToken);

    const limit = parseLimitQuery(requestUrl.searchParams.get('limit'));
    const offset = parseOffsetQuery(requestUrl.searchParams.get('offset'));
    const atsVendor = parseVendorQuery(requestUrl.searchParams.get('atsVendor'));
    const verificationStatus = parseStatusQuery(
      requestUrl.searchParams.get('verificationStatus'),
    );

    const atsTargets = await atsTargetRegistryService.listAtsTargets({
      limit,
      offset,
      atsVendor,
      verificationStatus,
    });

    sendJson(res, 200, {
      contractVersion: atsTargetsContractVersion,
      atsTargets,
    });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/ats-targets') {
    const accessToken = requireAccessToken(req);
    const user = await authProfileService.authenticate(accessToken);
    const payload = await parseBody(req, atsTargetCreateRequestSchema);

    const atsTarget = await atsTargetRegistryService.createAtsTarget(user.userId, payload);

    sendJson(res, 200, {
      contractVersion: atsTargetsContractVersion,
      atsTarget,
    });
    return true;
  }

  if (method === 'PUT') {
    const pathParam = parseTargetPathParam(pathname);
    if (!pathParam) {
      return false;
    }

    const parsedTargetId = atsTargetIdSchema.safeParse(pathParam);
    if (!parsedTargetId.success) {
      throw new HttpError(400, 'invalid_ats_target_id', {
        targetId: pathParam,
      });
    }

    const accessToken = requireAccessToken(req);
    const user = await authProfileService.authenticate(accessToken);
    const payload = await parseBody(req, atsTargetUpdateRequestSchema);

    const atsTarget = await atsTargetRegistryService.updateAtsTarget(
      user.userId,
      parsedTargetId.data,
      payload,
    );

    sendJson(res, 200, {
      contractVersion: atsTargetsContractVersion,
      atsTarget,
    });
    return true;
  }

  return false;
};