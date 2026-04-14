import type { PostgresPool } from '../../db/postgres.js';
import type {
  AtsTargetVerificationEvent,
  AtsTargetVerificationEventRepository,
} from './repository.js';

interface AtsTargetVerificationEventRow {
  event_id: string;
  target_id: string;
  attempted_at: string;
  outcome_status: AtsTargetVerificationEvent['outcomeStatus'];
  http_status: number | null;
  error_code: string | null;
  evidence_summary: string;
}

const rowToVerificationEvent = (
  row: AtsTargetVerificationEventRow,
): AtsTargetVerificationEvent => ({
  eventId: row.event_id,
  targetId: row.target_id,
  attemptedAt: row.attempted_at,
  outcomeStatus: row.outcome_status,
  httpStatus: row.http_status,
  errorCode: row.error_code,
  evidenceSummary: row.evidence_summary,
});

export const createPostgresAtsTargetVerificationEventRepository = (
  pool: PostgresPool,
): AtsTargetVerificationEventRepository => ({
  async createVerificationEvent(event) {
    const result = await pool.query<AtsTargetVerificationEventRow>(
      `INSERT INTO ats_target_verification_events (
         event_id,
         target_id,
         attempted_at,
         outcome_status,
         http_status,
         error_code,
         evidence_summary
       ) VALUES (
         $1,
         $2,
         $3::timestamptz,
         $4,
         $5,
         $6,
         $7
       )
       RETURNING
         event_id,
         target_id,
         attempted_at::text,
         outcome_status,
         http_status,
         error_code,
         evidence_summary`,
      [
        event.eventId,
        event.targetId,
        event.attemptedAt,
        event.outcomeStatus,
        event.httpStatus,
        event.errorCode,
        event.evidenceSummary,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('verification_event_insert_failed');
    }

    return rowToVerificationEvent(row);
  },

  async listVerificationEvents({ targetId, atsVendor, limit, offset }) {
    const normalizedLimit = Math.max(0, limit);
    const normalizedOffset = Math.max(0, offset);

    const result = await pool.query<AtsTargetVerificationEventRow>(
      `SELECT
         events.event_id,
         events.target_id,
         events.attempted_at::text,
         events.outcome_status,
         events.http_status,
         events.error_code,
         events.evidence_summary
       FROM ats_target_verification_events AS events
       INNER JOIN ats_target_registry AS targets
         ON targets.target_id = events.target_id
       WHERE ($1::uuid IS NULL OR events.target_id = $1::uuid)
         AND ($2::text IS NULL OR targets.ats_vendor = $2)
       ORDER BY events.attempted_at DESC, events.event_id DESC
       LIMIT $3 OFFSET $4`,
      [targetId ?? null, atsVendor ?? null, normalizedLimit, normalizedOffset],
    );

    return result.rows.map(rowToVerificationEvent);
  },
});