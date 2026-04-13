import type {
  CanonicalJobId,
  NotificationLog,
  NotificationType,
  NotificationStatus,
  ReminderId,
} from '@job-hunter/shared';

export interface NotificationRepository {
  createNotification(notification: NotificationLog): Promise<NotificationLog>;
  updateNotification(notification: NotificationLog): Promise<NotificationLog>;
  findReminderDueNotification(
    userId: string,
    reminderId: ReminderId,
  ): Promise<NotificationLog | null>;
  findHighFitNotification(
    userId: string,
    canonicalJobId: CanonicalJobId,
    matchArtifactVersion: number,
  ): Promise<NotificationLog | null>;
  listNotifications(options: {
    userId: string;
    status?: NotificationStatus;
    limit: number;
  }): Promise<NotificationLog[]>;
  listQueuedNotifications(options: {
    userId: string;
    scheduledBefore: string;
    limit: number;
    notificationType?: NotificationType;
  }): Promise<NotificationLog[]>;
}
