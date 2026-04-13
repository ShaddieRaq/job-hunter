import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  savedSearchCreateRequestSchema,
  savedSearchesContractVersion,
  savedSearchIdSchema,
} from '@job-hunter/shared';

import { HttpError } from '../../http/http-errors.js';
import { readJsonBody, sendJson } from '../../http/json.js';
import type { AuthProfileService } from '../auth-profile/service.js';
import type { SavedSearchService } from './service.js';

export interface SavedSearchRoutesDependencies {
  authProfileService: AuthProfileService;
  savedSearchService: SavedSearchService;
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
    throw new HttpError(400, 'invalid_saved_search_limit', {
      limit: rawLimit,
    });
  }

  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit)) {
    throw new HttpError(400, 'invalid_saved_search_limit', {
      limit: rawLimit,
    });
  }

  return limit;
};

const parseSavedSearchPathParam = (pathname: string): string | null => {
  const prefix = '/v1/saved-searches/';
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const pathParam = pathname.slice(prefix.length);
  if (!pathParam || pathParam.includes('/')) {
    return null;
  }

  return pathParam;
};

export const handleSavedSearchRoutes = async (
  req: IncomingMessage,
  res: ServerResponse,
  { authProfileService, savedSearchService }: SavedSearchRoutesDependencies,
): Promise<boolean> => {
  const method = req.method ?? 'GET';
  const requestUrl = getUrl(req);
  const pathname = requestUrl.pathname;

  if (method === 'GET' && pathname === '/v1/saved-searches') {
    const accessToken = requireAccessToken(req);
    const user = await authProfileService.authenticate(accessToken);

    const limit = parseLimitQuery(requestUrl.searchParams.get('limit'));
    const savedSearches = await savedSearchService.listSavedSearches({
      userId: user.userId,
      limit,
    });

    sendJson(res, 200, {
      contractVersion: savedSearchesContractVersion,
      savedSearches,
    });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/saved-searches') {
    const accessToken = requireAccessToken(req);
    const user = await authProfileService.authenticate(accessToken);
    const payload = await parseBody(req, savedSearchCreateRequestSchema);

    const savedSearch = await savedSearchService.createSavedSearch(user.userId, payload);

    sendJson(res, 200, {
      contractVersion: savedSearchesContractVersion,
      savedSearch,
    });
    return true;
  }

  if (method === 'GET' || method === 'DELETE') {
    const pathParam = parseSavedSearchPathParam(pathname);
    if (!pathParam) {
      return false;
    }

    const parsedSavedSearchId = savedSearchIdSchema.safeParse(pathParam);
    if (!parsedSavedSearchId.success) {
      throw new HttpError(400, 'invalid_saved_search_id', {
        savedSearchId: pathParam,
      });
    }

    const accessToken = requireAccessToken(req);
    const user = await authProfileService.authenticate(accessToken);

    if (method === 'GET') {
      const savedSearch = await savedSearchService.getSavedSearch(
        user.userId,
        parsedSavedSearchId.data,
      );

      if (!savedSearch) {
        throw new HttpError(404, 'saved_search_not_found', {
          savedSearchId: parsedSavedSearchId.data,
        });
      }

      sendJson(res, 200, {
        contractVersion: savedSearchesContractVersion,
        savedSearch,
      });
      return true;
    }

    await savedSearchService.deleteSavedSearch(user.userId, parsedSavedSearchId.data);

    sendJson(res, 200, {
      contractVersion: savedSearchesContractVersion,
      deletedSavedSearchId: parsedSavedSearchId.data,
    });
    return true;
  }

  return false;
};
