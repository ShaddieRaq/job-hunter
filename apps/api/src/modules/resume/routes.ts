import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  resumeContractVersion,
  resumeIdSchema,
  resumeUploadRequestSchema,
} from '@job-hunter/shared';

import { HttpError } from '../../http/http-errors.js';
import { readJsonBody, sendJson } from '../../http/json.js';
import type { AuthProfileService } from '../auth-profile/service.js';
import type { ResumeService } from './service.js';

export interface ResumeRoutesDependencies {
  authProfileService: AuthProfileService;
  resumeService: ResumeService;
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

const getResumeIdPathParam = (pathname: string): string | null => {
  const prefix = '/v1/resumes/';
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const pathParam = pathname.slice(prefix.length);
  if (pathParam.length === 0 || pathParam.includes('/')) {
    return null;
  }

  return pathParam;
};

export const handleResumeRoutes = async (
  req: IncomingMessage,
  res: ServerResponse,
  { authProfileService, resumeService }: ResumeRoutesDependencies,
): Promise<boolean> => {
  const method = req.method ?? 'GET';
  const pathname = getPathname(req);

  if (method === 'POST' && pathname === '/v1/resumes') {
    const accessToken = requireAccessToken(req);
    const user = await authProfileService.authenticate(accessToken);
    const payload = await parseBody(req, resumeUploadRequestSchema);
    const upload = await resumeService.uploadResume(user.userId, payload);

    sendJson(res, 200, {
      contractVersion: resumeContractVersion,
      resume: upload.resume,
      structuredProfile: upload.structuredProfile,
    });
    return true;
  }

  if (method === 'GET' && pathname === '/v1/resumes') {
    const accessToken = requireAccessToken(req);
    const user = await authProfileService.authenticate(accessToken);
    const resumes = await resumeService.listResumes(user.userId);

    sendJson(res, 200, {
      contractVersion: resumeContractVersion,
      resumes,
    });
    return true;
  }

  if (method === 'GET') {
    const resumeIdPathParam = getResumeIdPathParam(pathname);
    if (!resumeIdPathParam) {
      return false;
    }

    const parsedResumeId = resumeIdSchema.safeParse(resumeIdPathParam);
    if (!parsedResumeId.success) {
      throw new HttpError(400, 'invalid_resume_id', {
        resumeId: resumeIdPathParam,
      });
    }

    const accessToken = requireAccessToken(req);
    const user = await authProfileService.authenticate(accessToken);
    const details = await resumeService.getResume(user.userId, parsedResumeId.data);

    sendJson(res, 200, {
      contractVersion: resumeContractVersion,
      resume: details.resume,
      structuredProfile: details.structuredProfile,
    });
    return true;
  }

  return false;
};