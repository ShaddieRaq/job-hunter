import type {
  CanonicalJobId,
  NotificationId,
  NotificationLog,
  ReminderId,
} from '@job-hunter/shared';

import type { NotificationRepository } from './repository.js';

const reminderDueKey = (userId: string, reminderId: ReminderId): string =>
  `${userId}:${reminderId}`;

const highFitKey = (
  userId: string,
  canonicalJobId: CanonicalJobId,
  matchArtifactVersion: number,
): string => `${userId}:${canonicalJobId}:${matchArtifactVersion}`;

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
  const notificationIdByHighFit = new Map<string, NotificationId>();

  return {
    async createNotification(notification) {
      notificationsById.set(
        notification.notificationId,
        cloneNotification(notification),
      );

      if (
        notification.notificationType === 'reminder_due' &&
        notification.reminderId !== null
      ) {
        notificationIdByReminderDue.set(
          reminderDueKey(notification.userId, notification.reminderId),
          notification.notificationId,
        );
      }

      if (
        notification.notificationType === 'high_fit_alert' &&
        notification.matchArtifactVersion !== null
      ) {
        notificationIdByHighFit.set(
          highFitKey(
            notification.userId,
            notification.canonicalJobId,
            notification.matchArtifactVersion,
          ),
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

      if (
        notification.notificationType === 'reminder_due' &&
        notification.reminderId !== null
      ) {
        notificationIdByReminderDue.set(
          reminderDueKey(notification.userId, notification.reminderId),
          notification.notificationId,
        );
      }

      if (
        notification.notificationType === 'high_fit_alert' &&
        notification.matchArtifactVersion !== null
      ) {
        notificationIdByHighFit.set(
          highFitKey(
            notification.userId,
            notification.canonicalJobId,
            notification.matchArtifactVersion,
          ),
          notification.notificationId,
        );
      }

      return cloneNotification(notification);
    },

    async findHighFitNotification(userId, canonicalJobId, matchArtifactVersion) {
      const notificationId = notificationIdByHighFit.get(
        highFitKey(userId, canonicalJobId, matchArtifactVersion),
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

    async listQueuedNotifications({
      userId,
      scheduledBefore,
      limit,
      notificationType,
    }) {
      const scheduledBeforeMs = parseIsoToEpochMs(scheduledBefore);
      if (scheduledBeforeMs === null) {
        return [];
      }

      const notifications = [...notificationsById.values()]
        .filter((notification) => notification.userId === userId)
        .filter((notification) => notification.status === 'queued')
        .filter((notification) =>
          notificationType ? notification.notificationType === notificationType : true,
        )
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
