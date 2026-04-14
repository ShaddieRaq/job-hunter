import type {
  CanonicalDedupeTraceEvent,
  CanonicalJobId,
  CanonicalJobSummary,
  CanonicalSourceMapping,
} from '@job-hunter/shared';

import type { PostgresPool } from '../../db/postgres.js';
import type {
  CanonicalJobDraft,
  CanonicalJobRecord,
  CanonicalJobRepository,
  UpsertCanonicalJobResult,
} from './repository.js';
import type {
  CanonicalDedupeTraceEventRow,
  CanonicalJobRow,
  CanonicalSourceMappingRow,
} from './persistence-model.js';

const defaultCanonicalizationVersion = 'canonical-dedupe-v1';

const toMappingConfidence = (value: number | string): number => {
  if (typeof value === 'number') {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const rowToCanonicalSummary = (row: CanonicalJobRow): CanonicalJobSummary => ({
  canonicalJobId: row.canonical_job_id,
  canonicalCompanyName: row.canonical_company_name,
  canonicalTitle: row.canonical_title,
  normalizedLocation: row.normalized_location,
  remoteType: row.remote_type,
  employmentType: row.employment_type,
  salaryMin: row.salary_min,
  salaryMax: row.salary_max,
  salaryCurrency: row.salary_currency,
  salaryPeriod: row.salary_period,
  sourceCount: row.source_count,
  sourceNames: row.source_names,
  jobStatus: row.job_status,
  topSkills: row.top_skills,
  firstSeenAt: row.first_seen_at,
  lastSeenAt: row.last_seen_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const rowToCanonicalSourceMapping = (
  row: CanonicalSourceMappingRow,
): CanonicalSourceMapping => ({
  sourceName: row.source_name,
  sourceJobId: row.source_job_id,
  isPrimary: row.is_primary,
  mappingConfidence: toMappingConfidence(row.mapping_confidence),
  mappingReasonCodes: row.mapping_reason_codes,
});

const rowToCanonicalDedupeTraceEvent = (
  row: CanonicalDedupeTraceEventRow,
): CanonicalDedupeTraceEvent => ({
  eventId: row.event_id,
  canonicalJobId: row.canonical_job_id,
  sourceName: row.source_name,
  sourceJobId: row.source_job_id,
  eventType: row.event_type,
  mappingConfidence: toMappingConfidence(row.mapping_confidence),
  mappingReasonCodes: row.mapping_reason_codes,
  reversible: row.reversible,
  dedupeVersion: row.dedupe_version,
  occurredAt: row.occurred_at,
});

const draftEqualsSummary = (
  draft: CanonicalJobDraft,
  summary: CanonicalJobSummary,
): boolean =>
  JSON.stringify({
    canonicalJobId: draft.canonicalJobId,
    canonicalCompanyName: draft.canonicalCompanyName,
    canonicalTitle: draft.canonicalTitle,
    normalizedLocation: draft.normalizedLocation,
    remoteType: draft.remoteType,
    employmentType: draft.employmentType,
    salaryMin: draft.salaryMin,
    salaryMax: draft.salaryMax,
    salaryCurrency: draft.salaryCurrency,
    salaryPeriod: draft.salaryPeriod,
    sourceCount: draft.sourceCount,
    sourceNames: draft.sourceNames,
    jobStatus: draft.jobStatus,
    topSkills: draft.topSkills,
    firstSeenAt: draft.firstSeenAt,
    lastSeenAt: draft.lastSeenAt,
  }) ===
  JSON.stringify({
    canonicalJobId: summary.canonicalJobId,
    canonicalCompanyName: summary.canonicalCompanyName,
    canonicalTitle: summary.canonicalTitle,
    normalizedLocation: summary.normalizedLocation,
    remoteType: summary.remoteType,
    employmentType: summary.employmentType,
    salaryMin: summary.salaryMin,
    salaryMax: summary.salaryMax,
    salaryCurrency: summary.salaryCurrency,
    salaryPeriod: summary.salaryPeriod,
    sourceCount: summary.sourceCount,
    sourceNames: summary.sourceNames,
    jobStatus: summary.jobStatus,
    topSkills: summary.topSkills,
    firstSeenAt: summary.firstSeenAt,
    lastSeenAt: summary.lastSeenAt,
  });

const mappingsEqual = (
  left: CanonicalSourceMapping[],
  right: CanonicalSourceMapping[],
): boolean => JSON.stringify(left) === JSON.stringify(right);

export const createPostgresCanonicalJobRepository = (
  pool: PostgresPool,
  options?: {
    canonicalizationVersion?: string;
  },
): CanonicalJobRepository => {
  const canonicalizationVersion =
    options?.canonicalizationVersion ?? defaultCanonicalizationVersion;

  return {
    async upsertCanonicalJob({
      job,
      sourceMappings,
      nowIso,
    }): Promise<UpsertCanonicalJobResult> {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const existingJobResult = await client.query<CanonicalJobRow>(
          `SELECT
             canonical_job_id,
             canonical_company_name,
             canonical_title,
             normalized_location,
             remote_type,
             employment_type,
             salary_min,
             salary_max,
             salary_currency,
             salary_period,
             source_count,
             source_names,
             job_status,
             top_skills,
             first_seen_at::text,
             last_seen_at::text,
             created_at::text,
             updated_at::text
           FROM canonical_jobs
           WHERE canonical_job_id = $1
           FOR UPDATE`,
          [job.canonicalJobId],
        );

        const existingSummary = existingJobResult.rows[0]
          ? rowToCanonicalSummary(existingJobResult.rows[0])
          : null;

        const existingMappingsResult = await client.query<CanonicalSourceMappingRow>(
          `SELECT
             source_name,
             source_job_id,
             is_primary,
             mapping_confidence,
             mapping_reason_codes
           FROM canonical_job_source_mappings
           WHERE canonical_job_id = $1
           ORDER BY is_primary DESC, source_name ASC, source_job_id ASC`,
          [job.canonicalJobId],
        );

        const existingMappings = existingMappingsResult.rows.map(
          rowToCanonicalSourceMapping,
        );

        if (
          existingSummary &&
          draftEqualsSummary(job, existingSummary) &&
          mappingsEqual(existingMappings, sourceMappings)
        ) {
          await client.query('COMMIT');
          return {
            status: 'unchanged',
            job: existingSummary,
          };
        }

        if (!existingSummary) {
          await client.query(
            `INSERT INTO canonical_jobs (
               canonical_job_id,
               canonical_company_name,
               canonical_title,
               normalized_location,
               remote_type,
               employment_type,
               salary_min,
               salary_max,
               salary_currency,
               salary_period,
               source_count,
               source_names,
               job_status,
               top_skills,
               first_seen_at,
               last_seen_at,
               canonicalization_version,
               created_at,
               updated_at
             ) VALUES (
               $1,
               $2,
               $3,
               $4,
               $5,
               $6,
               $7,
               $8,
               $9,
               $10,
               $11,
               $12,
               $13,
               $14,
               $15::timestamptz,
               $16::timestamptz,
               $17,
               $18::timestamptz,
               $18::timestamptz
             )`,
            [
              job.canonicalJobId,
              job.canonicalCompanyName,
              job.canonicalTitle,
              job.normalizedLocation,
              job.remoteType,
              job.employmentType,
              job.salaryMin,
              job.salaryMax,
              job.salaryCurrency,
              job.salaryPeriod,
              job.sourceCount,
              job.sourceNames,
              job.jobStatus,
              job.topSkills,
              job.firstSeenAt,
              job.lastSeenAt,
              canonicalizationVersion,
              nowIso,
            ],
          );
        } else {
          await client.query(
            `UPDATE canonical_jobs
             SET
               canonical_company_name = $2,
               canonical_title = $3,
               normalized_location = $4,
               remote_type = $5,
               employment_type = $6,
               salary_min = $7,
               salary_max = $8,
               salary_currency = $9,
               salary_period = $10,
               source_count = $11,
               source_names = $12,
               job_status = $13,
               top_skills = $14,
               first_seen_at = $15::timestamptz,
               last_seen_at = $16::timestamptz,
               canonicalization_version = $17,
               updated_at = $18::timestamptz
             WHERE canonical_job_id = $1`,
            [
              job.canonicalJobId,
              job.canonicalCompanyName,
              job.canonicalTitle,
              job.normalizedLocation,
              job.remoteType,
              job.employmentType,
              job.salaryMin,
              job.salaryMax,
              job.salaryCurrency,
              job.salaryPeriod,
              job.sourceCount,
              job.sourceNames,
              job.jobStatus,
              job.topSkills,
              job.firstSeenAt,
              job.lastSeenAt,
              canonicalizationVersion,
              nowIso,
            ],
          );
        }

        await client.query(
          `DELETE FROM canonical_job_source_mappings
           WHERE canonical_job_id = $1`,
          [job.canonicalJobId],
        );

        for (const mapping of sourceMappings) {
          await client.query(
            `INSERT INTO canonical_job_source_mappings (
               canonical_job_id,
               source_name,
               source_job_id,
               is_primary,
               mapping_confidence,
               mapping_reason_codes,
               created_at,
               updated_at
             ) VALUES (
               $1,
               $2,
               $3,
               $4,
               $5,
               $6,
               $7::timestamptz,
               $7::timestamptz
             )`,
            [
              job.canonicalJobId,
              mapping.sourceName,
              mapping.sourceJobId,
              mapping.isPrimary,
              mapping.mappingConfidence,
              mapping.mappingReasonCodes,
              nowIso,
            ],
          );
        }

        const updatedSummaryResult = await client.query<CanonicalJobRow>(
          `SELECT
             canonical_job_id,
             canonical_company_name,
             canonical_title,
             normalized_location,
             remote_type,
             employment_type,
             salary_min,
             salary_max,
             salary_currency,
             salary_period,
             source_count,
             source_names,
             job_status,
             top_skills,
             first_seen_at::text,
             last_seen_at::text,
             created_at::text,
             updated_at::text
           FROM canonical_jobs
           WHERE canonical_job_id = $1`,
          [job.canonicalJobId],
        );

        const summaryRow = updatedSummaryResult.rows[0];
        if (!summaryRow) {
          throw new Error('canonical_job_upsert_failed');
        }

        await client.query('COMMIT');

        return {
          status: existingSummary ? 'updated' : 'created',
          job: rowToCanonicalSummary(summaryRow),
        };
      } catch (error: unknown) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async listCanonicalJobs(limit) {
      const result =
        limit === undefined
          ? await pool.query<CanonicalJobRow>(
              `SELECT
           canonical_job_id,
           canonical_company_name,
           canonical_title,
           normalized_location,
           remote_type,
           employment_type,
           salary_min,
           salary_max,
           salary_currency,
           salary_period,
           source_count,
           source_names,
           job_status,
           top_skills,
           first_seen_at::text,
           last_seen_at::text,
           created_at::text,
           updated_at::text
         FROM canonical_jobs
         ORDER BY last_seen_at DESC, canonical_job_id ASC`,
            )
          : await pool.query<CanonicalJobRow>(
              `SELECT
           canonical_job_id,
           canonical_company_name,
           canonical_title,
           normalized_location,
           remote_type,
           employment_type,
           salary_min,
           salary_max,
           salary_currency,
           salary_period,
           source_count,
           source_names,
           job_status,
           top_skills,
           first_seen_at::text,
           last_seen_at::text,
           created_at::text,
           updated_at::text
         FROM canonical_jobs
         ORDER BY last_seen_at DESC, canonical_job_id ASC
         LIMIT $1`,
              [limit],
            );

      return result.rows.map(rowToCanonicalSummary);
    },

    async findCanonicalJobById(canonicalJobId: CanonicalJobId): Promise<CanonicalJobRecord | null> {
      const summaryResult = await pool.query<CanonicalJobRow>(
        `SELECT
           canonical_job_id,
           canonical_company_name,
           canonical_title,
           normalized_location,
           remote_type,
           employment_type,
           salary_min,
           salary_max,
           salary_currency,
           salary_period,
           source_count,
           source_names,
           job_status,
           top_skills,
           first_seen_at::text,
           last_seen_at::text,
           created_at::text,
           updated_at::text
         FROM canonical_jobs
         WHERE canonical_job_id = $1
         LIMIT 1`,
        [canonicalJobId],
      );

      const summaryRow = summaryResult.rows[0];
      if (!summaryRow) {
        return null;
      }

      const mappingsResult = await pool.query<CanonicalSourceMappingRow>(
        `SELECT
           source_name,
           source_job_id,
           is_primary,
           mapping_confidence,
           mapping_reason_codes
         FROM canonical_job_source_mappings
         WHERE canonical_job_id = $1
         ORDER BY is_primary DESC, source_name ASC, source_job_id ASC`,
        [canonicalJobId],
      );

      return {
        job: rowToCanonicalSummary(summaryRow),
        sourceMappings: mappingsResult.rows.map(rowToCanonicalSourceMapping),
      };
    },

    async upsertDedupeTraceEvents(events: CanonicalDedupeTraceEvent[]) {
      if (events.length === 0) {
        return;
      }

      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        for (const event of events) {
          await client.query(
            `INSERT INTO canonical_dedupe_trace_events (
               event_id,
               canonical_job_id,
               source_name,
               source_job_id,
               event_type,
               mapping_confidence,
               mapping_reason_codes,
               reversible,
               dedupe_version,
               occurred_at,
               created_at
             ) VALUES (
               $1,
               $2,
               $3,
               $4,
               $5,
               $6,
               $7,
               $8,
               $9,
               $10::timestamptz,
               NOW()
             )
             ON CONFLICT (event_id) DO NOTHING`,
            [
              event.eventId,
              event.canonicalJobId,
              event.sourceName,
              event.sourceJobId,
              event.eventType,
              event.mappingConfidence,
              event.mappingReasonCodes,
              event.reversible,
              event.dedupeVersion,
              event.occurredAt,
            ],
          );
        }

        await client.query('COMMIT');
      } catch (error: unknown) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async listDedupeTraceEvents(canonicalJobId, limit) {
      const result = await pool.query<CanonicalDedupeTraceEventRow>(
        `SELECT
           event_id,
           canonical_job_id,
           source_name,
           source_job_id,
           event_type,
           mapping_confidence,
           mapping_reason_codes,
           reversible,
           dedupe_version,
           occurred_at::text
         FROM canonical_dedupe_trace_events
         WHERE canonical_job_id = $1
         ORDER BY occurred_at DESC, event_id DESC
         LIMIT $2`,
        [canonicalJobId, limit],
      );

      return result.rows.map(rowToCanonicalDedupeTraceEvent);
    },
  };
};
