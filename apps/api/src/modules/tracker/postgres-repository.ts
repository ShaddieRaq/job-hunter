import type {
  TrackerTransitionEvent,
  TrackedJobState,
} from '@job-hunter/shared';

import type { PostgresPool } from '../../db/postgres.js';
import type { TrackerRepository } from './repository.js';

interface TrackerStateRow {
  user_id: string;
  canonical_job_id: string;
  state: TrackedJobState['state'];
  last_transition_note: string | null;
  created_at: string;
  updated_at: string;
}

interface TrackerTransitionRow {
  event_id: string;
  user_id: string;
  canonical_job_id: string;
  from_state: TrackerTransitionEvent['fromState'];
  to_state: TrackerTransitionEvent['toState'];
  note: string | null;
  transitioned_at: string;
}

const rowToTrackedJob = (row: TrackerStateRow): TrackedJobState => ({
  userId: row.user_id,
  canonicalJobId: row.canonical_job_id,
  state: row.state,
  lastTransitionNote: row.last_transition_note,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const rowToTransitionEvent = (
  row: TrackerTransitionRow,
): TrackerTransitionEvent => ({
  eventId: row.event_id,
  userId: row.user_id,
  canonicalJobId: row.canonical_job_id,
  fromState: row.from_state,
  toState: row.to_state,
  note: row.note,
  transitionedAt: row.transitioned_at,
});

export const createPostgresTrackerRepository = (
  pool: PostgresPool,
): TrackerRepository => ({
  async upsertTrackedJob(tracker) {
    const result = await pool.query<TrackerStateRow>(
      `INSERT INTO user_job_tracker_states (
         user_id,
         canonical_job_id,
         state,
         last_transition_note,
         created_at,
         updated_at
       ) VALUES (
         $1,
         $2,
         $3,
         $4,
         $5::timestamptz,
         $6::timestamptz
       )
       ON CONFLICT (user_id, canonical_job_id)
       DO UPDATE SET
         state = EXCLUDED.state,
         last_transition_note = EXCLUDED.last_transition_note,
         created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at
       RETURNING
         user_id,
         canonical_job_id,
         state,
         last_transition_note,
         created_at::text,
         updated_at::text`,
      [
        tracker.userId,
        tracker.canonicalJobId,
        tracker.state,
        tracker.lastTransitionNote,
        tracker.createdAt,
        tracker.updatedAt,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('tracker_upsert_failed');
    }

    return rowToTrackedJob(row);
  },

  async findTrackedJob(userId, canonicalJobId) {
    const result = await pool.query<TrackerStateRow>(
      `SELECT
         user_id,
         canonical_job_id,
         state,
         last_transition_note,
         created_at::text,
         updated_at::text
       FROM user_job_tracker_states
       WHERE user_id = $1 AND canonical_job_id = $2
       LIMIT 1`,
      [userId, canonicalJobId],
    );

    const row = result.rows[0];
    return row ? rowToTrackedJob(row) : null;
  },

  async listTrackedJobs({ userId, state, limit }) {
    const result = await pool.query<TrackerStateRow>(
      `SELECT
         user_id,
         canonical_job_id,
         state,
         last_transition_note,
         created_at::text,
         updated_at::text
       FROM user_job_tracker_states
       WHERE user_id = $1
         AND ($2::text IS NULL OR state = $2)
       ORDER BY updated_at DESC, canonical_job_id ASC
       LIMIT $3`,
      [userId, state ?? null, limit],
    );

    return result.rows.map(rowToTrackedJob);
  },

  async insertTransitionEvent(event) {
    await pool.query(
      `INSERT INTO user_job_tracker_transition_events (
         event_id,
         user_id,
         canonical_job_id,
         from_state,
         to_state,
         note,
         transitioned_at
       ) VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7::timestamptz
       )`,
      [
        event.eventId,
        event.userId,
        event.canonicalJobId,
        event.fromState,
        event.toState,
        event.note,
        event.transitionedAt,
      ],
    );
  },

  async listTransitionEvents({ userId, canonicalJobId, limit }) {
    const result = await pool.query<TrackerTransitionRow>(
      `SELECT
         event_id,
         user_id,
         canonical_job_id,
         from_state,
         to_state,
         note,
         transitioned_at::text
       FROM user_job_tracker_transition_events
       WHERE user_id = $1 AND canonical_job_id = $2
       ORDER BY transitioned_at DESC, event_id DESC
       LIMIT $3`,
      [userId, canonicalJobId, limit],
    );

    return result.rows.map(rowToTransitionEvent);
  },
});
