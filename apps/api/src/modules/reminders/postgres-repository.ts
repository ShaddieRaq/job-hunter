import type { ReminderTask } from '@job-hunter/shared';

import type { PostgresPool } from '../../db/postgres.js';
import type { ReminderRepository } from './repository.js';

interface ReminderRow {
  reminder_id: string;
  user_id: string;
  canonical_job_id: string;
  task_type: ReminderTask['taskType'];
  title: string;
  note: string | null;
  due_at: string;
  status: ReminderTask['status'];
  linked_tracker_event_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

const rowToReminder = (row: ReminderRow): ReminderTask => ({
  reminderId: row.reminder_id,
  userId: row.user_id,
  canonicalJobId: row.canonical_job_id,
  taskType: row.task_type,
  title: row.title,
  note: row.note,
  dueAt: row.due_at,
  status: row.status,
  linkedTrackerEventId: row.linked_tracker_event_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  completedAt: row.completed_at,
});

export const createPostgresReminderRepository = (
  pool: PostgresPool,
): ReminderRepository => ({
  async createReminder(reminder) {
    const result = await pool.query<ReminderRow>(
      `INSERT INTO user_reminder_tasks (
         reminder_id,
         user_id,
         canonical_job_id,
         task_type,
         title,
         note,
         due_at,
         status,
         linked_tracker_event_id,
         created_at,
         updated_at,
         completed_at
       ) VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7::timestamptz,
         $8,
         $9::uuid,
         $10::timestamptz,
         $11::timestamptz,
         $12::timestamptz
       )
       RETURNING
         reminder_id,
         user_id,
         canonical_job_id,
         task_type,
         title,
         note,
         due_at::text,
         status,
         linked_tracker_event_id,
         created_at::text,
         updated_at::text,
         completed_at::text`,
      [
        reminder.reminderId,
        reminder.userId,
        reminder.canonicalJobId,
        reminder.taskType,
        reminder.title,
        reminder.note,
        reminder.dueAt,
        reminder.status,
        reminder.linkedTrackerEventId,
        reminder.createdAt,
        reminder.updatedAt,
        reminder.completedAt,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('reminder_insert_failed');
    }

    return rowToReminder(row);
  },

  async updateReminder(reminder) {
    const result = await pool.query<ReminderRow>(
      `UPDATE user_reminder_tasks
       SET
         task_type = $3,
         title = $4,
         note = $5,
         due_at = $6::timestamptz,
         status = $7,
         linked_tracker_event_id = $8::uuid,
         updated_at = $9::timestamptz,
         completed_at = $10::timestamptz
       WHERE reminder_id = $1 AND user_id = $2
       RETURNING
         reminder_id,
         user_id,
         canonical_job_id,
         task_type,
         title,
         note,
         due_at::text,
         status,
         linked_tracker_event_id,
         created_at::text,
         updated_at::text,
         completed_at::text`,
      [
        reminder.reminderId,
        reminder.userId,
        reminder.taskType,
        reminder.title,
        reminder.note,
        reminder.dueAt,
        reminder.status,
        reminder.linkedTrackerEventId,
        reminder.updatedAt,
        reminder.completedAt,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('reminder_update_failed');
    }

    return rowToReminder(row);
  },

  async findReminderById(userId, reminderId) {
    const result = await pool.query<ReminderRow>(
      `SELECT
         reminder_id,
         user_id,
         canonical_job_id,
         task_type,
         title,
         note,
         due_at::text,
         status,
         linked_tracker_event_id,
         created_at::text,
         updated_at::text,
         completed_at::text
       FROM user_reminder_tasks
       WHERE user_id = $1 AND reminder_id = $2
       LIMIT 1`,
      [userId, reminderId],
    );

    const row = result.rows[0];
    return row ? rowToReminder(row) : null;
  },

  async findReminderByTrackerEvent(userId, trackerEventId) {
    const result = await pool.query<ReminderRow>(
      `SELECT
         reminder_id,
         user_id,
         canonical_job_id,
         task_type,
         title,
         note,
         due_at::text,
         status,
         linked_tracker_event_id,
         created_at::text,
         updated_at::text,
         completed_at::text
       FROM user_reminder_tasks
       WHERE user_id = $1 AND linked_tracker_event_id = $2::uuid
       LIMIT 1`,
      [userId, trackerEventId],
    );

    const row = result.rows[0];
    return row ? rowToReminder(row) : null;
  },

  async listReminders({ userId, status, canonicalJobId, limit }) {
    const result = await pool.query<ReminderRow>(
      `SELECT
         reminder_id,
         user_id,
         canonical_job_id,
         task_type,
         title,
         note,
         due_at::text,
         status,
         linked_tracker_event_id,
         created_at::text,
         updated_at::text,
         completed_at::text
       FROM user_reminder_tasks
       WHERE user_id = $1
         AND ($2::text IS NULL OR status = $2)
         AND ($3::uuid IS NULL OR canonical_job_id = $3)
       ORDER BY status ASC, due_at ASC, created_at DESC
       LIMIT $4`,
      [userId, status ?? null, canonicalJobId ?? null, limit],
    );

    return result.rows.map(rowToReminder);
  },
});
