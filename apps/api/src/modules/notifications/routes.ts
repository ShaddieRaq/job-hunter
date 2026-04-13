import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  notificationDispatchRequestSchema,
  notificationStatusSchema,
  notificationsContractVersion,
  type NotificationStatus,
} from '@job-hunter/shared';

import { HttpError } from '../../http/http-errors.js';
import { readJsonBody, sendJson } from '../../http/json.js';
import type { AuthProfileService } from '../auth-profile/service.js';
import type { NotificationService } from './service.js';

export interface NotificationRoutesDependencies {
  authProfileService: AuthProfileService;
  notificationService: NotificationService;
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
    throw new HttpError(400, 'invalid_notification_limit', {
      limit: rawLimit,
    });
  }

  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit)) {
    throw new HttpError(400, 'invalid_notification_limit', {
      limit: rawLimit,
    });
  }

  return limit;
};

const parseStatusQuery = (
  rawStatus: string | null,
): NotificationStatus | undefined => {
  if (rawStatus === null) {
    return undefined;
  }

  const parsed = notificationStatusSchema.safeParse(rawStatus);
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_notification_status_filter', {
      status: rawStatus,
    });
  }

  return parsed.data;
};

export const handleNotificationRoutes = async (
  req: IncomingMessage,
  res: ServerResponse,
  { authProfileService, notificationService }: NotificationRoutesDependencies,
): Promise<boolean> => {
  const method = req.method ?? 'GET';
  const requestUrl = getUrl(req);
  const pathname = requestUrl.pathname;

  if (method === 'GET' && pathname === '/v1/notifications') {
    const accessToken = requireAccessToken(req);
    const user = await authProfileService.authenticate(accessToken);

    const limit = parseLimitQuery(requestUrl.searchParams.get('limit'));
    const status = parseStatusQuery(requestUrl.searchParams.get('status'));

    const notifications = await notificationService.listNotifications({
      userId: user.userId,
      status,
      limit,
    });

    sendJson(res, 200, {
      contractVersion: notificationsContractVersion,
      notifications,
    });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/notifications/reminders/dispatch') {
    const accessToken = requireAccessToken(req);
    const user = await authProfileService.authenticate(accessToken);

    const payload = await parseBody(req, notificationDispatchRequestSchema);

    const result = await notificationService.dispatchDueReminderNotifications(
      user.userId,
      {
        referenceTime: payload.referenceTime,
      },
    );

    sendJson(res, 200, {
      contractVersion: notificationsContractVersion,
      queuedCount: result.queuedCount,
      sentCount: result.sentCount,
      skippedCount: result.skippedCount,
    });
    return true;
  }

  return false;
};
