import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  connectorContractVersion,
  connectorSyncRequestSchema,
  sourceNameSchema,
} from '@job-hunter/shared';

import { HttpError } from '../../http/http-errors.js';
import { readJsonBody, sendJson } from '../../http/json.js';
import type { AuthProfileService } from '../auth-profile/service.js';
import type { ConnectorService } from './service.js';

export interface ConnectorRoutesDependencies {
  authProfileService: AuthProfileService;
  connectorService: ConnectorService;
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

const parseConnectorSyncPath = (pathname: string): string | null => {
  const prefix = '/v1/connectors/';
  const suffix = '/sync';

  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) {
    return null;
  }

  const sourceName = pathname.slice(prefix.length, -suffix.length);
  if (!sourceName || sourceName.includes('/')) {
    return null;
  }

  return sourceName;
};

const parseLimitQuery = (rawLimit: string | null): number | undefined => {
  if (rawLimit === null) {
    return undefined;
  }

  if (!/^\d+$/.test(rawLimit)) {
    throw new HttpError(400, 'invalid_source_job_limit', {
      limit: rawLimit,
    });
  }

  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit)) {
    throw new HttpError(400, 'invalid_source_job_limit', {
      limit: rawLimit,
    });
  }

  return limit;
};

const parseSourceNameQuery = (rawSourceName: string | null): string | undefined => {
  if (rawSourceName === null) {
    return undefined;
  }

  const parsed = sourceNameSchema.safeParse(rawSourceName);
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_source_name', {
      sourceName: rawSourceName,
    });
  }

  return parsed.data;
};

export const handleConnectorRoutes = async (
  req: IncomingMessage,
  res: ServerResponse,
  { authProfileService, connectorService }: ConnectorRoutesDependencies,
): Promise<boolean> => {
  const method = req.method ?? 'GET';
  const requestUrl = getUrl(req);
  const pathname = requestUrl.pathname;

  if (method === 'GET' && pathname === '/v1/connectors') {
    const accessToken = requireAccessToken(req);
    await authProfileService.authenticate(accessToken);

    const connectors = await connectorService.listConnectors();
    sendJson(res, 200, {
      contractVersion: connectorContractVersion,
      connectors,
    });

    return true;
  }

  if (method === 'POST') {
    const sourceNamePathParam = parseConnectorSyncPath(pathname);
    if (!sourceNamePathParam) {
      return false;
    }

    const parsedSourceName = sourceNameSchema.safeParse(sourceNamePathParam);
    if (!parsedSourceName.success) {
      throw new HttpError(400, 'invalid_source_name', {
        sourceName: sourceNamePathParam,
      });
    }

    const accessToken = requireAccessToken(req);
    await authProfileService.authenticate(accessToken);

    const payload = await parseBody(req, connectorSyncRequestSchema);
    const result = await connectorService.syncConnector(parsedSourceName.data, payload);

    sendJson(res, 200, {
      contractVersion: connectorContractVersion,
      ...result,
    });

    return true;
  }

  if (method === 'GET' && pathname === '/v1/source-jobs') {
    const accessToken = requireAccessToken(req);
    await authProfileService.authenticate(accessToken);

    const rawSourceName = requestUrl.searchParams.get('sourceName');
    const rawLimit = requestUrl.searchParams.get('limit');

    const sourceName = parseSourceNameQuery(rawSourceName);
    const limit = parseLimitQuery(rawLimit);
    const sourceJobs = await connectorService.listSourceJobs({
      sourceName,
      limit,
    });

    sendJson(res, 200, {
      contractVersion: connectorContractVersion,
      sourceJobs,
    });

    return true;
  }

  return false;
};
