import type {
  NotificationId,
  NotificationLog,
  ReminderId,
} from '@job-hunter/shared';

import type { NotificationRepository } from './repository.js';

const reminderDueKey = (userId: string, reminderId: ReminderId): string =>
  `${userId}:${reminderId}`;

const cloneNotification = (notification: NotificationLog): NotificationLog => ({
  ...notification,
});

const parseIsoToEpochMs = (value: string): number | null => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return parsed;
};

export const createInMemoryNotificationRepository = (): NotificationRepository => {
  const notificationsById = new Map<NotificationId, NotificationLog>();
  const notificationIdByReminderDue = new Map<string, NotificationId>();

  return {
    async createNotification(notification) {
      notificationsById.set(
        notification.notificationId,
        cloneNotification(notification),
      );

      if (notification.notificationType === 'reminder_due') {
        notificationIdByReminderDue.set(
          reminderDueKey(notification.userId, notification.reminderId),
          notification.notificationId,
        );
      }

      return cloneNotification(notification);
    },

    async updateNotification(notification) {
      notificationsById.set(
        notification.notificationId,
        cloneNotification(notification),
      );

      if (notification.notificationType === 'reminder_due') {
        notificationIdByReminderDue.set(
          reminderDueKey(notification.userId, notification.reminderId),
          notification.notificationId,
        );
      }

      return cloneNotification(notification);
    },

    async findReminderDueNotification(userId, reminderId) {
      const notificationId = notificationIdByReminderDue.get(
        reminderDueKey(userId, reminderId),
      );

      if (!notificationId) {
        return null;
      }

      const notification = notificationsById.get(notificationId);
      if (!notification || notification.userId !== userId) {
        return null;
      }

      return cloneNotification(notification);
    },

    async listNotifications({ userId, status, limit }) {
      const notifications = [...notificationsById.values()]
        .filter((notification) => notification.userId === userId)
        .filter((notification) => (status ? notification.status === status : true))
        .sort((left, right) => {
          if (left.updatedAt !== right.updatedAt) {
            return right.updatedAt.localeCompare(left.updatedAt);
          }

          return right.createdAt.localeCompare(left.createdAt);
        })
        .slice(0, limit)
        .map(cloneNotification);

      return notifications;
    },

    async listQueuedNotifications({ userId, scheduledBefore, limit }) {
      const scheduledBeforeMs = parseIsoToEpochMs(scheduledBefore);
      if (scheduledBeforeMs === null) {
        return [];
      }

      const notifications = [...notificationsById.values()]
        .filter((notification) => notification.userId === userId)
        .filter((notification) => notification.status === 'queued')
        .filter((notification) => {
          const scheduledForMs = parseIsoToEpochMs(notification.scheduledFor);
          return scheduledForMs !== null && scheduledForMs <= scheduledBeforeMs;
        })
        .sort((left, right) => {
          if (left.scheduledFor !== right.scheduledFor) {
            return left.scheduledFor.localeCompare(right.scheduledFor);
          }

          return left.createdAt.localeCompare(right.createdAt);
        })
        .slice(0, limit)
        .map(cloneNotification);

      return notifications;
    },
  };
};
