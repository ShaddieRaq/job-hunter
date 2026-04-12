import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  authContractVersion,
  authLoginRequestSchema,
  authRegisterRequestSchema,
  preferencesContractVersion,
  profileContractVersion,
  userPreferencesPayloadSchema,
  userProfilePayloadSchema,
} from '@job-hunter/shared';

import { HttpError } from '../../http/http-errors.js';
import { readJsonBody, sendJson } from '../../http/json.js';
import type { AuthProfileService } from './service.js';

export interface AuthProfileRoutesDependencies {
  service: AuthProfileService;
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

const getPathname = (req: IncomingMessage): string => {
  const requestUrl = req.url ?? '/';
  return new URL(requestUrl, 'http://localhost').pathname;
};

export const handleAuthProfileRoutes = async (
  req: IncomingMessage,
  res: ServerResponse,
  { service }: AuthProfileRoutesDependencies,
): Promise<boolean> => {
  const method = req.method ?? 'GET';
  const pathname = getPathname(req);

  if (method === 'POST' && pathname === '/v1/auth/register') {
    const request = await parseBody(req, authRegisterRequestSchema);
    const session = await service.register(request);

    sendJson(res, 200, {
      contractVersion: authContractVersion,
      session,
    });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/auth/login') {
    const request = await parseBody(req, authLoginRequestSchema);
    const session = await service.login(request);

    sendJson(res, 200, {
      contractVersion: authContractVersion,
      session,
    });
    return true;
  }

  if (method === 'GET' && pathname === '/v1/profile') {
    const accessToken = requireAccessToken(req);
    const user = await service.authenticate(accessToken);
    const profile = await service.getProfile(user.userId);

    sendJson(res, 200, {
      contractVersion: profileContractVersion,
      profile,
    });
    return true;
  }

  if (method === 'PUT' && pathname === '/v1/profile') {
    const accessToken = requireAccessToken(req);
    const user = await service.authenticate(accessToken);
    const payload = await parseBody(req, userProfilePayloadSchema);
    const profile = await service.upsertProfile(user.userId, payload);

    sendJson(res, 200, {
      contractVersion: profileContractVersion,
      profile,
    });
    return true;
  }

  if (method === 'GET' && pathname === '/v1/preferences') {
    const accessToken = requireAccessToken(req);
    const user = await service.authenticate(accessToken);
    const preferences = await service.getPreferences(user.userId);

    sendJson(res, 200, {
      contractVersion: preferencesContractVersion,
      preferences,
    });
    return true;
  }

  if (method === 'PUT' && pathname === '/v1/preferences') {
    const accessToken = requireAccessToken(req);
    const user = await service.authenticate(accessToken);
    const payload = await parseBody(req, userPreferencesPayloadSchema);
    const preferences = await service.upsertPreferences(user.userId, payload);

    sendJson(res, 200, {
      contractVersion: preferencesContractVersion,
      preferences,
    });
    return true;
  }

  return false;
};
