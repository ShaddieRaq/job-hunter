import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  aiContractVersion,
  jobExtractionRequestSchema,
  matchExplanationRequestSchema,
  resumeExtractionRequestSchema,
} from '@job-hunter/shared';

import { HttpError } from '../../http/http-errors.js';
import { readJsonBody, sendJson } from '../../http/json.js';
import type { AuthProfileService } from '../auth-profile/service.js';
import type { AiService } from './service.js';

export interface AiRoutesDependencies {
  authProfileService: AuthProfileService;
  aiService: AiService;
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

export const handleAiRoutes = async (
  req: IncomingMessage,
  res: ServerResponse,
  { authProfileService, aiService }: AiRoutesDependencies,
): Promise<boolean> => {
  const method = req.method ?? 'GET';
  const pathname = getPathname(req);

  if (method === 'POST' && pathname === '/v1/ai/extract/resume') {
    const accessToken = requireAccessToken(req);
    const user = await authProfileService.authenticate(accessToken);
    const payload = await parseBody(req, resumeExtractionRequestSchema);
    const response = aiService.extractResume(user.userId, payload);

    sendJson(res, 200, {
      contractVersion: aiContractVersion,
      userId: response.userId,
      extraction: response.extraction,
      metadata: response.metadata,
    });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/ai/extract/job') {
    const accessToken = requireAccessToken(req);
    await authProfileService.authenticate(accessToken);
    const payload = await parseBody(req, jobExtractionRequestSchema);
    const response = aiService.extractJob(payload);

    sendJson(res, 200, {
      contractVersion: aiContractVersion,
      extraction: response.extraction,
      metadata: response.metadata,
    });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/ai/explain-match') {
    const accessToken = requireAccessToken(req);
    await authProfileService.authenticate(accessToken);
    const payload = await parseBody(req, matchExplanationRequestSchema);
    const response = aiService.explainMatch(payload);

    sendJson(res, 200, {
      contractVersion: aiContractVersion,
      canonicalJobId: response.canonicalJobId,
      explanation: response.explanation,
      metadata: response.metadata,
    });
    return true;
  }

  return false;
};
