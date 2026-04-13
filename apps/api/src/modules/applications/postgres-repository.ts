import type { ApplicationRecord } from '@job-hunter/shared';

import type { PostgresPool } from '../../db/postgres.js';
import type { ApplicationRepository } from './repository.js';

interface ApplicationRow {
  application_id: string;
  user_id: string;
  canonical_job_id: string;
  status: ApplicationRecord['status'];
  applied_at: string | null;
  application_url: string | null;
  resume_id_used: string | null;
  cover_letter_doc_uri: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const rowToApplication = (row: ApplicationRow): ApplicationRecord => ({
  applicationId: row.application_id,
  userId: row.user_id,
  canonicalJobId: row.canonical_job_id,
  status: row.status,
  appliedAt: row.applied_at,
  applicationUrl: row.application_url,
  resumeIdUsed: row.resume_id_used,
  coverLetterDocUri: row.cover_letter_doc_uri,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const createPostgresApplicationRepository = (
  pool: PostgresPool,
): ApplicationRepository => ({
  async createApplication(application) {
    const result = await pool.query<ApplicationRow>(
      `INSERT INTO user_application_records (
         application_id,
         user_id,
         canonical_job_id,
         status,
         applied_at,
         application_url,
         resume_id_used,
         cover_letter_doc_uri,
         notes,
         created_at,
         updated_at
       ) VALUES (
         $1,
         $2,
         $3,
         $4,
         $5::timestamptz,
         $6,
         $7::uuid,
         $8,
         $9,
         $10::timestamptz,
         $11::timestamptz
       )
       RETURNING
         application_id,
         user_id,
         canonical_job_id,
         status,
         applied_at::text,
         application_url,
         resume_id_used,
         cover_letter_doc_uri,
         notes,
         created_at::text,
         updated_at::text`,
      [
        application.applicationId,
        application.userId,
        application.canonicalJobId,
        application.status,
        application.appliedAt,
        application.applicationUrl,
        application.resumeIdUsed,
        application.coverLetterDocUri,
        application.notes,
        application.createdAt,
        application.updatedAt,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('application_insert_failed');
    }

    return rowToApplication(row);
  },

  async updateApplication(application) {
    const result = await pool.query<ApplicationRow>(
      `UPDATE user_application_records
       SET
         status = $3,
         applied_at = $4::timestamptz,
         application_url = $5,
         resume_id_used = $6::uuid,
         cover_letter_doc_uri = $7,
         notes = $8,
         updated_at = $9::timestamptz
       WHERE application_id = $1 AND user_id = $2
       RETURNING
         application_id,
         user_id,
         canonical_job_id,
         status,
         applied_at::text,
         application_url,
         resume_id_used,
         cover_letter_doc_uri,
         notes,
         created_at::text,
         updated_at::text`,
      [
        application.applicationId,
        application.userId,
        application.status,
        application.appliedAt,
        application.applicationUrl,
        application.resumeIdUsed,
        application.coverLetterDocUri,
        application.notes,
        application.updatedAt,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('application_update_failed');
    }

    return rowToApplication(row);
  },

  async findApplicationById(userId, applicationId) {
    const result = await pool.query<ApplicationRow>(
      `SELECT
         application_id,
         user_id,
         canonical_job_id,
         status,
         applied_at::text,
         application_url,
         resume_id_used,
         cover_letter_doc_uri,
         notes,
         created_at::text,
         updated_at::text
       FROM user_application_records
       WHERE user_id = $1 AND application_id = $2
       LIMIT 1`,
      [userId, applicationId],
    );

    const row = result.rows[0];
    return row ? rowToApplication(row) : null;
  },

  async findApplicationByCanonicalJob(userId, canonicalJobId) {
    const result = await pool.query<ApplicationRow>(
      `SELECT
         application_id,
         user_id,
         canonical_job_id,
         status,
         applied_at::text,
         application_url,
         resume_id_used,
         cover_letter_doc_uri,
         notes,
         created_at::text,
         updated_at::text
       FROM user_application_records
       WHERE user_id = $1 AND canonical_job_id = $2
       LIMIT 1`,
      [userId, canonicalJobId],
    );

    const row = result.rows[0];
    return row ? rowToApplication(row) : null;
  },

  async listApplications({ userId, status, canonicalJobId, limit }) {
    const result = await pool.query<ApplicationRow>(
      `SELECT
         application_id,
         user_id,
         canonical_job_id,
         status,
         applied_at::text,
         application_url,
         resume_id_used,
         cover_letter_doc_uri,
         notes,
         created_at::text,
         updated_at::text
       FROM user_application_records
       WHERE user_id = $1
         AND ($2::text IS NULL OR status = $2)
         AND ($3::uuid IS NULL OR canonical_job_id = $3)
       ORDER BY updated_at DESC, created_at DESC
       LIMIT $4`,
      [userId, status ?? null, canonicalJobId ?? null, limit],
    );

    return result.rows.map(rowToApplication);
  },
});
