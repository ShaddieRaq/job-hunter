import type { NotificationLog } from '@job-hunter/shared';

import type { PostgresPool } from '../../db/postgres.js';
import type { NotificationRepository } from './repository.js';

interface NotificationRow {
  notification_id: string;
  user_id: string;
  reminder_id: string | null;
  canonical_job_id: string;
  match_artifact_version: number | null;
  notification_type: NotificationLog['notificationType'];
  delivery_channel: NotificationLog['channel'];
  status: NotificationLog['status'];
  message: string;
  scheduled_for: string;
  sent_at: string | null;
  failed_at: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
}

const rowToNotification = (row: NotificationRow): NotificationLog => ({
  notificationId: row.notification_id,
  userId: row.user_id,
  reminderId: row.reminder_id,
  canonicalJobId: row.canonical_job_id,
  matchArtifactVersion: row.match_artifact_version,
  notificationType: row.notification_type,
  channel: row.delivery_channel,
  status: row.status,
  message: row.message,
  scheduledFor: row.scheduled_for,
  sentAt: row.sent_at,
  failedAt: row.failed_at,
  errorCode: row.error_code,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const returningClause = `RETURNING
  notification_id,
  user_id,
  reminder_id,
  canonical_job_id,
  match_artifact_version,
  notification_type,
  delivery_channel,
  status,
  message,
  scheduled_for::text,
  sent_at::text,
  failed_at::text,
  error_code,
  created_at::text,
  updated_at::text`;

export const createPostgresNotificationRepository = (
  pool: PostgresPool,
): NotificationRepository => ({
  async createNotification(notification) {
    const result = await pool.query<NotificationRow>(
      `INSERT INTO user_notification_logs (
         notification_id,
         user_id,
         reminder_id,
         canonical_job_id,
         match_artifact_version,
         notification_type,
         delivery_channel,
         status,
         message,
         scheduled_for,
         sent_at,
         failed_at,
         error_code,
         created_at,
         updated_at
       ) VALUES (
         $1,
         $2,
         $3::uuid,
         $4,
         $5,
         $6,
         $7,
         $8,
         $9,
         $10::timestamptz,
         $11::timestamptz,
         $12::timestamptz,
         $13,
         $14::timestamptz,
         $15::timestamptz
       )
       ${returningClause}`,
      [
        notification.notificationId,
        notification.userId,
        notification.reminderId,
        notification.canonicalJobId,
        notification.matchArtifactVersion,
        notification.notificationType,
        notification.channel,
        notification.status,
        notification.message,
        notification.scheduledFor,
        notification.sentAt,
        notification.failedAt,
        notification.errorCode,
        notification.createdAt,
        notification.updatedAt,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('notification_insert_failed');
    }

    return rowToNotification(row);
  },

  async updateNotification(notification) {
    const result = await pool.query<NotificationRow>(
      `UPDATE user_notification_logs
       SET
         reminder_id = $3::uuid,
         canonical_job_id = $4,
         match_artifact_version = $5,
         notification_type = $6,
         delivery_channel = $7,
         status = $8,
         message = $9,
         scheduled_for = $10::timestamptz,
         sent_at = $11::timestamptz,
         failed_at = $12::timestamptz,
         error_code = $13,
         updated_at = $14::timestamptz
       WHERE notification_id = $1 AND user_id = $2
       ${returningClause}`,
      [
        notification.notificationId,
        notification.userId,
        notification.reminderId,
        notification.canonicalJobId,
        notification.matchArtifactVersion,
        notification.notificationType,
        notification.channel,
        notification.status,
        notification.message,
        notification.scheduledFor,
        notification.sentAt,
        notification.failedAt,
        notification.errorCode,
        notification.updatedAt,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('notification_update_failed');
    }

    return rowToNotification(row);
  },

  async findReminderDueNotification(userId, reminderId) {
    const result = await pool.query<NotificationRow>(
      `SELECT
         notification_id,
         user_id,
         reminder_id,
         canonical_job_id,
         match_artifact_version,
         notification_type,
         delivery_channel,
         status,
         message,
         scheduled_for::text,
         sent_at::text,
         failed_at::text,
         error_code,
         created_at::text,
         updated_at::text
       FROM user_notification_logs
       WHERE user_id = $1
         AND reminder_id = $2::uuid
         AND notification_type = 'reminder_due'
       LIMIT 1`,
      [userId, reminderId],
    );

    const row = result.rows[0];
    return row ? rowToNotification(row) : null;
  },

  async findHighFitNotification(userId, canonicalJobId, matchArtifactVersion) {
    const result = await pool.query<NotificationRow>(
      `SELECT
         notification_id,
         user_id,
         reminder_id,
         canonical_job_id,
         match_artifact_version,
         notification_type,
         delivery_channel,
         status,
         message,
         scheduled_for::text,
         sent_at::text,
         failed_at::text,
         error_code,
         created_at::text,
         updated_at::text
       FROM user_notification_logs
       WHERE user_id = $1
         AND canonical_job_id = $2
         AND match_artifact_version = $3
         AND notification_type = 'high_fit_alert'
       LIMIT 1`,
      [userId, canonicalJobId, matchArtifactVersion],
    );

    const row = result.rows[0];
    return row ? rowToNotification(row) : null;
  },

  async listNotifications({ userId, status, limit }) {
    const result = await pool.query<NotificationRow>(
      `SELECT
         notification_id,
         user_id,
         reminder_id,
         canonical_job_id,
         match_artifact_version,
         notification_type,
         delivery_channel,
         status,
         message,
         scheduled_for::text,
         sent_at::text,
         failed_at::text,
         error_code,
         created_at::text,
         updated_at::text
       FROM user_notification_logs
       WHERE user_id = $1
         AND ($2::text IS NULL OR status = $2)
       ORDER BY updated_at DESC, created_at DESC
       LIMIT $3`,
      [userId, status ?? null, limit],
    );

    return result.rows.map(rowToNotification);
  },

  async listQueuedNotifications({
    userId,
    scheduledBefore,
    limit,
    notificationType,
  }) {
    const result = await pool.query<NotificationRow>(
      `SELECT
         notification_id,
         user_id,
         reminder_id,
         canonical_job_id,
         match_artifact_version,
         notification_type,
         delivery_channel,
         status,
         message,
         scheduled_for::text,
         sent_at::text,
         failed_at::text,
         error_code,
         created_at::text,
         updated_at::text
       FROM user_notification_logs
       WHERE user_id = $1
         AND status = 'queued'
         AND scheduled_for <= $2::timestamptz
         AND ($3::text IS NULL OR notification_type = $3)
       ORDER BY scheduled_for ASC, created_at ASC
       LIMIT $4`,
      [userId, scheduledBefore, notificationType ?? null, limit],
    );

    return result.rows.map(rowToNotification);
  },
});
