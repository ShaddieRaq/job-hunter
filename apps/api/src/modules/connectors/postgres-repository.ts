import type {
  SourceConnector,
  SourceJobSummary,
  SourceName,
} from '@job-hunter/shared';

import type { PostgresPool } from '../../db/postgres.js';
import type {
  ConnectorRepository,
  SourceJobRecord,
  UpsertSourceJobInput,
  UpsertSourceJobResult,
} from './repository.js';
import type { SourceConnectorRow, SourceJobRow } from './persistence-model.js';

const rowToSourceConnector = (row: SourceConnectorRow): SourceConnector => ({
  sourceName: row.source_name as SourceName,
  displayName: row.display_name,
  connectorVersion: row.connector_version,
  healthStatus: row.health_status,
  lastSyncAt: row.last_sync_at,
  lastSuccessAt: row.last_success_at,
  lastFailureAt: row.last_failure_at,
  lastErrorCode: row.last_error_code,
});

const rowToSourceJobSummary = (row: SourceJobRow): SourceJobSummary => ({
  sourceName: row.source_name as SourceName,
  sourceJobId: row.source_job_id,
  sourceCompanyId: row.source_company_id,
  sourceStatus: row.source_status,
  title: row.title,
  companyName: row.company_name,
  fetchUrl: row.fetch_url,
  applicationUrl: row.application_url,
  locationText: row.location_text,
  remoteType: row.remote_type,
  employmentType: row.employment_type,
  postedAt: row.posted_at,
  firstSeenAt: row.first_seen_at,
  lastSeenAt: row.last_seen_at,
  fetchedAt: row.fetched_at,
  checksumSha256: row.checksum_sha256,
  normalizedSkills: row.normalized_skills,
  requiredSkills: row.required_skills,
  preferredSkills: row.preferred_skills,
  salaryMin: row.salary_min,
  salaryMax: row.salary_max,
  salaryCurrency: row.salary_currency,
  salaryPeriod: row.salary_period,
});

const rowToSourceJobRecord = (row: SourceJobRow): SourceJobRecord => ({
  ...rowToSourceJobSummary(row),
  descriptionText: row.description_text,
  rawPayload: row.raw_payload_json,
});

export const createPostgresConnectorRepository = (
  pool: PostgresPool,
): ConnectorRepository => ({
  async listConnectorStates() {
    const result = await pool.query<SourceConnectorRow>(
      `SELECT
         source_name,
         display_name,
         connector_version,
         health_status,
         last_sync_at::text,
         last_success_at::text,
         last_failure_at::text,
         last_error_code
       FROM job_sources
       ORDER BY source_name ASC`,
    );

    return result.rows.map(rowToSourceConnector);
  },

  async upsertConnectorState(state) {
    await pool.query(
      `INSERT INTO job_sources (
         source_name,
         display_name,
         connector_version,
         health_status,
         last_sync_at,
         last_success_at,
         last_failure_at,
         last_error_code,
         updated_at
       ) VALUES (
         $1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7::timestamptz, $8, NOW()
       )
       ON CONFLICT (source_name)
       DO UPDATE SET
         display_name = EXCLUDED.display_name,
         connector_version = EXCLUDED.connector_version,
         health_status = EXCLUDED.health_status,
         last_sync_at = EXCLUDED.last_sync_at,
         last_success_at = EXCLUDED.last_success_at,
         last_failure_at = EXCLUDED.last_failure_at,
         last_error_code = EXCLUDED.last_error_code,
         updated_at = NOW()`,
      [
        state.sourceName,
        state.displayName,
        state.connectorVersion,
        state.healthStatus,
        state.lastSyncAt,
        state.lastSuccessAt,
        state.lastFailureAt,
        state.lastErrorCode,
      ],
    );
  },

  async upsertSourceJob(input: UpsertSourceJobInput): Promise<UpsertSourceJobResult> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const existing = await client.query<Pick<SourceJobRow, 'checksum_sha256'>>(
        `SELECT checksum_sha256
         FROM source_jobs
         WHERE source_name = $1 AND source_job_id = $2
         FOR UPDATE`,
        [input.sourceName, input.job.sourceJobId],
      );

      const existingChecksum = existing.rows[0]?.checksum_sha256 ?? null;
      const status: UpsertSourceJobResult = !existingChecksum
        ? 'inserted'
        : existingChecksum === input.checksumSha256
          ? 'unchanged'
          : 'updated';

      if (!existingChecksum) {
        await client.query(
          `INSERT INTO source_jobs (
             source_name,
             source_job_id,
             source_company_id,
             source_status,
             title,
             company_name,
             fetch_url,
             application_url,
             location_text,
             remote_type,
             employment_type,
             posted_at,
             first_seen_at,
             last_seen_at,
             fetched_at,
             checksum_sha256,
             description_text,
             normalized_skills,
             required_skills,
             preferred_skills,
             salary_min,
             salary_max,
             salary_currency,
             salary_period,
             raw_payload_json,
             created_at,
             updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8,
             $9, $10, $11, $12::timestamptz, $13::timestamptz, $14::timestamptz,
             $15::timestamptz, $16, $17, $18, $19, $20, $21, $22, $23, $24,
             $25::jsonb, NOW(), NOW()
           )`,
          [
            input.sourceName,
            input.job.sourceJobId,
            input.job.sourceCompanyId,
            input.job.sourceStatus,
            input.job.title,
            input.job.companyName,
            input.job.fetchUrl,
            input.job.applicationUrl,
            input.job.locationText,
            input.job.remoteType,
            input.job.employmentType,
            input.job.postedAt,
            input.observedAt,
            input.observedAt,
            input.fetchedAt,
            input.checksumSha256,
            input.job.descriptionText,
            input.job.normalizedSkills,
            input.job.requiredSkills,
            input.job.preferredSkills,
            input.job.salaryMin,
            input.job.salaryMax,
            input.job.salaryCurrency,
            input.job.salaryPeriod,
            JSON.stringify(input.job.rawPayload),
          ],
        );
      } else {
        await client.query(
          `UPDATE source_jobs
           SET
             source_company_id = $3,
             source_status = $4,
             title = $5,
             company_name = $6,
             fetch_url = $7,
             application_url = $8,
             location_text = $9,
             remote_type = $10,
             employment_type = $11,
             posted_at = $12::timestamptz,
             last_seen_at = $13::timestamptz,
             fetched_at = $14::timestamptz,
             checksum_sha256 = $15,
             description_text = $16,
             normalized_skills = $17,
             required_skills = $18,
             preferred_skills = $19,
             salary_min = $20,
             salary_max = $21,
             salary_currency = $22,
             salary_period = $23,
             raw_payload_json = $24::jsonb,
             updated_at = NOW()
           WHERE source_name = $1 AND source_job_id = $2`,
          [
            input.sourceName,
            input.job.sourceJobId,
            input.job.sourceCompanyId,
            input.job.sourceStatus,
            input.job.title,
            input.job.companyName,
            input.job.fetchUrl,
            input.job.applicationUrl,
            input.job.locationText,
            input.job.remoteType,
            input.job.employmentType,
            input.job.postedAt,
            input.observedAt,
            input.fetchedAt,
            input.checksumSha256,
            input.job.descriptionText,
            input.job.normalizedSkills,
            input.job.requiredSkills,
            input.job.preferredSkills,
            input.job.salaryMin,
            input.job.salaryMax,
            input.job.salaryCurrency,
            input.job.salaryPeriod,
            JSON.stringify(input.job.rawPayload),
          ],
        );
      }

      await client.query('COMMIT');
      return status;
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async listSourceJobs({ sourceName, limit }) {
    const hasSourceNameFilter = Boolean(sourceName);

    const result =
      limit === undefined
        ? await pool.query<SourceJobRow>(
            `SELECT
         source_name,
         source_job_id,
         source_company_id,
         source_status,
         title,
         company_name,
         fetch_url,
         application_url,
         location_text,
         remote_type,
         employment_type,
         posted_at::text,
         first_seen_at::text,
         last_seen_at::text,
         fetched_at::text,
         checksum_sha256,
         description_text,
         normalized_skills,
         required_skills,
         preferred_skills,
         salary_min,
         salary_max,
         salary_currency,
         salary_period,
         raw_payload_json
       FROM source_jobs
       WHERE ($1::text IS NULL OR source_name = $1)
       ORDER BY last_seen_at DESC, source_name ASC, source_job_id ASC`,
            [hasSourceNameFilter ? sourceName : null],
          )
        : await pool.query<SourceJobRow>(
            `SELECT
         source_name,
         source_job_id,
         source_company_id,
         source_status,
         title,
         company_name,
         fetch_url,
         application_url,
         location_text,
         remote_type,
         employment_type,
         posted_at::text,
         first_seen_at::text,
         last_seen_at::text,
         fetched_at::text,
         checksum_sha256,
         description_text,
         normalized_skills,
         required_skills,
         preferred_skills,
         salary_min,
         salary_max,
         salary_currency,
         salary_period,
         raw_payload_json
       FROM source_jobs
       WHERE ($1::text IS NULL OR source_name = $1)
       ORDER BY last_seen_at DESC, source_name ASC, source_job_id ASC
       LIMIT $2`,
            [hasSourceNameFilter ? sourceName : null, limit],
          );

    return result.rows.map(rowToSourceJobSummary);
  },

  async findSourceJob(sourceName, sourceJobId) {
    const result = await pool.query<SourceJobRow>(
      `SELECT
         source_name,
         source_job_id,
         source_company_id,
         source_status,
         title,
         company_name,
         fetch_url,
         application_url,
         location_text,
         remote_type,
         employment_type,
         posted_at::text,
         first_seen_at::text,
         last_seen_at::text,
         fetched_at::text,
         checksum_sha256,
         description_text,
         normalized_skills,
         required_skills,
         preferred_skills,
         salary_min,
         salary_max,
         salary_currency,
         salary_period,
         raw_payload_json
       FROM source_jobs
       WHERE source_name = $1 AND source_job_id = $2
       LIMIT 1`,
      [sourceName, sourceJobId],
    );

    const row = result.rows[0];
    return row ? rowToSourceJobRecord(row) : null;
  },
});
