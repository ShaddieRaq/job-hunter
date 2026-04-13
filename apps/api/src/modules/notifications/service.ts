import { randomUUID } from 'node:crypto';

import type {
  NotificationLog,
  NotificationStatus,
  ReminderTask,
} from '@job-hunter/shared';

import { createInMemoryNotificationRepository } from './in-memory-repository.js';
import type { NotificationRepository } from './repository.js';

const defaultListLimit = 50;
const maxListLimit = 500;
const dispatchLimit = 500;

const normalizeLimit = (limit: number | undefined): number => {
  if (limit === undefined) {
    return defaultListLimit;
  }

  return Math.max(1, Math.min(maxListLimit, limit));
};

const buildReminderDueMessage = (reminder: ReminderTask): string => {
  const baseMessage = `Reminder due: ${reminder.title}`;
  return baseMessage.slice(0, 500);
};

const parseIsoToEpochMs = (value: string): number | null => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return parsed;
};

export interface ReminderReader {
  listReminders(options: {
    userId: string;
    status?: 'pending' | 'completed';
    limit?: number;
  }): Promise<ReminderTask[]>;
}

export interface DispatchReminderNotificationsInput {
  referenceTime?: string;
}

export interface DispatchReminderNotificationsResult {
  queuedCount: number;
  sentCount: number;
  skippedCount: number;
}

export interface NotificationService {
  listNotifications(options: {
    userId: string;
    status?: NotificationStatus;
    limit?: number;
  }): Promise<NotificationLog[]>;
  dispatchDueReminderNotifications(
    userId: string,
    input?: DispatchReminderNotificationsInput,
  ): Promise<DispatchReminderNotificationsResult>;
}

export interface CreateNotificationServiceOptions {
  reminderReader: ReminderReader;
  repository?: NotificationRepository;
  now?: () => Date;
}

export const createNotificationService = ({
  reminderReader,
  repository = createInMemoryNotificationRepository(),
  now = () => new Date(),
}: CreateNotificationServiceOptions): NotificationService => ({
  async listNotifications({ userId, status, limit }) {
    const resolvedLimit = normalizeLimit(limit);

    return repository.listNotifications({
      userId,
      status,
      limit: resolvedLimit,
    });
  },

  async dispatchDueReminderNotifications(userId, input) {
    const referenceTimeIso = input?.referenceTime ?? now().toISOString();
    const referenceTimeMs = parseIsoToEpochMs(referenceTimeIso);

    if (referenceTimeMs === null) {
      return {
        queuedCount: 0,
        sentCount: 0,
        skippedCount: 0,
      };
    }

    const reminders = await reminderReader.listReminders({
      userId,
      status: 'pending',
      limit: dispatchLimit,
    });

    let queuedCount = 0;
    let skippedCount = 0;

    for (const reminder of reminders) {
      const dueAtMs = parseIsoToEpochMs(reminder.dueAt);
      if (dueAtMs === null || dueAtMs > referenceTimeMs) {
        continue;
      }

      const existing = await repository.findReminderDueNotification(
        userId,
        reminder.reminderId,
      );

      if (existing) {
        skippedCount += 1;
        continue;
      }

      const nowIso = now().toISOString();
      const notification: NotificationLog = {
        notificationId: randomUUID(),
        userId,
        reminderId: reminder.reminderId,
        canonicalJobId: reminder.canonicalJobId,
        notificationType: 'reminder_due',
        channel: 'in_app',
        status: 'queued',
        message: buildReminderDueMessage(reminder),
        scheduledFor: reminder.dueAt,
        sentAt: null,
        failedAt: null,
        errorCode: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await repository.createNotification(notification);
      queuedCount += 1;
    }

    const queuedNotifications = await repository.listQueuedNotifications({
      userId,
      scheduledBefore: referenceTimeIso,
      limit: dispatchLimit,
    });

    let sentCount = 0;

    for (const queuedNotification of queuedNotifications) {
      const nowIso = now().toISOString();
      await repository.updateNotification({
        ...queuedNotification,
        status: 'sent',
        sentAt: nowIso,
        updatedAt: nowIso,
      });
      sentCount += 1;
    }

    return {
      queuedCount,
      sentCount,
      skippedCount,
    };
  },
});
