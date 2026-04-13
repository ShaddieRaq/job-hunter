import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  canonicalJobIdSchema,
  reminderCompleteRequestSchema,
  reminderCreateRequestSchema,
  reminderIdSchema,
  reminderStatusSchema,
  remindersContractVersion,
  type ReminderStatus,
} from '@job-hunter/shared';

import { HttpError } from '../../http/http-errors.js';
import { readJsonBody, sendJson } from '../../http/json.js';
import type { AuthProfileService } from '../auth-profile/service.js';
import type { ReminderService } from './service.js';

export interface ReminderRoutesDependencies {
  authProfileService: AuthProfileService;
  reminderService: ReminderService;
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
    throw new HttpError(400, 'invalid_reminder_limit', {
      limit: rawLimit,
    });
  }

  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit)) {
    throw new HttpError(400, 'invalid_reminder_limit', {
      limit: rawLimit,
    });
  }

  return limit;
};

const parseStatusQuery = (rawStatus: string | null): ReminderStatus | undefined => {
  if (rawStatus === null) {
    return undefined;
  }

  const parsed = reminderStatusSchema.safeParse(rawStatus);
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_reminder_status_filter', {
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

const parseReminderPathParam = (pathname: string): string | null => {
  const prefix = '/v1/reminders/';
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const pathParam = pathname.slice(prefix.length);
  if (!pathParam || pathParam.includes('/')) {
    return null;
  }

  return pathParam;
};

const parseCompletePathParam = (pathname: string): string | null => {
  const prefix = '/v1/reminders/';
  const suffix = '/complete';

  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) {
    return null;
  }

  const pathParam = pathname.slice(prefix.length, -suffix.length);
  if (!pathParam || pathParam.includes('/')) {
    return null;
  }

  return pathParam;
};

export const handleReminderRoutes = async (
  req: IncomingMessage,
  res: ServerResponse,
  { authProfileService, reminderService }: ReminderRoutesDependencies,
): Promise<boolean> => {
  const method = req.method ?? 'GET';
  const requestUrl = getUrl(req);
  const pathname = requestUrl.pathname;

  if (method === 'GET' && pathname === '/v1/reminders') {
    const accessToken = requireAccessToken(req);
    const user = await authProfileService.authenticate(accessToken);

    const limit = parseLimitQuery(requestUrl.searchParams.get('limit'));
    const status = parseStatusQuery(requestUrl.searchParams.get('status'));
    const canonicalJobId = parseCanonicalJobIdQuery(
      requestUrl.searchParams.get('canonicalJobId'),
    );

    const reminders = await reminderService.listReminders({
      userId: user.userId,
      limit,
      status,
      canonicalJobId,
    });

    sendJson(res, 200, {
      contractVersion: remindersContractVersion,
      reminders,
    });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/reminders') {
    const accessToken = requireAccessToken(req);
    const user = await authProfileService.authenticate(accessToken);
    const payload = await parseBody(req, reminderCreateRequestSchema);

    const reminder = await reminderService.createReminder(user.userId, payload);

    sendJson(res, 200, {
      contractVersion: remindersContractVersion,
      reminder,
    });
    return true;
  }

  if (method === 'PUT') {
    const pathParam = parseCompletePathParam(pathname);
    if (pathParam) {
      const parsedReminderId = reminderIdSchema.safeParse(pathParam);
      if (!parsedReminderId.success) {
        throw new HttpError(400, 'invalid_reminder_id', {
          reminderId: pathParam,
        });
      }

      const accessToken = requireAccessToken(req);
      const user = await authProfileService.authenticate(accessToken);
      const payload = await parseBody(req, reminderCompleteRequestSchema);

      const reminder = await reminderService.completeReminder(
        user.userId,
        parsedReminderId.data,
        payload,
      );

      sendJson(res, 200, {
        contractVersion: remindersContractVersion,
        reminder,
      });
      return true;
    }
  }

  if (method === 'GET') {
    const pathParam = parseReminderPathParam(pathname);
    if (!pathParam) {
      return false;
    }

    const parsedReminderId = reminderIdSchema.safeParse(pathParam);
    if (!parsedReminderId.success) {
      throw new HttpError(400, 'invalid_reminder_id', {
        reminderId: pathParam,
      });
    }

    const accessToken = requireAccessToken(req);
    const user = await authProfileService.authenticate(accessToken);

    const reminder = await reminderService.getReminder(user.userId, parsedReminderId.data);
    if (!reminder) {
      throw new HttpError(404, 'reminder_not_found', {
        reminderId: parsedReminderId.data,
      });
    }

    sendJson(res, 200, {
      contractVersion: remindersContractVersion,
      reminder,
    });
    return true;
  }

  return false;
};
