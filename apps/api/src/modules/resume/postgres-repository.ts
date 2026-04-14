import type {
  ResumeMetadata,
  ResumeStructuredProfile,
} from '@job-hunter/shared';

import type { PostgresPool } from '../../db/postgres.js';
import type { ResumeRepository } from './repository.js';
import type { ResumeRow, ResumeStructuredProfileRow } from './persistence-model.js';

const rowToResumeMetadata = (row: ResumeRow): ResumeMetadata => ({
  resumeId: row.resume_id,
  userId: row.user_id,
  originalFilename: row.original_filename,
  contentType: row.content_type,
  fileUri: row.file_uri,
  sizeBytes: row.size_bytes,
  checksumSha256: row.checksum_sha256,
  parserVersion: row.parser_version,
  parseStatus: row.parse_status,
  uploadedAt: row.uploaded_at,
  parsedAt: row.parsed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const rowToStructuredProfile = (
  row: ResumeStructuredProfileRow,
): ResumeStructuredProfile => ({
  resumeId: row.resume_id,
  normalizedSkills: row.normalized_skills,
  experienceRoles: row.experience_roles,
  companies: row.companies,
  industries: row.industries,
  education: row.education,
  certifications: row.certifications,
  inferredSeniority: row.inferred_seniority,
  extractionConfidence: row.extraction_confidence,
  extractedAt: row.extracted_at,
});

export const createPostgresResumeRepository = (
  pool: PostgresPool,
): ResumeRepository => ({
  async insertResume(resume) {
    const result = await pool.query<ResumeRow>(
      `INSERT INTO resumes (
         resume_id,
         user_id,
         file_uri,
         original_filename,
         content_type,
         size_bytes,
         checksum_sha256,
         parser_version,
         parse_status,
         parsed_text,
         uploaded_at,
         parsed_at,
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
         $11::timestamptz,
         $12::timestamptz,
         $13::timestamptz,
         $14::timestamptz
       )
       RETURNING
         resume_id,
         user_id,
         file_uri,
         original_filename,
         content_type,
         size_bytes,
         checksum_sha256,
         parser_version,
         parse_status,
         parsed_text,
         uploaded_at::text,
         parsed_at::text,
         created_at::text,
         updated_at::text`,
      [
        resume.resumeId,
        resume.userId,
        resume.fileUri,
        resume.originalFilename,
        resume.contentType,
        resume.sizeBytes,
        resume.checksumSha256,
        resume.parserVersion,
        resume.parseStatus,
        resume.parsedText,
        resume.uploadedAt,
        resume.parsedAt,
        resume.createdAt,
        resume.updatedAt,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('resume_insert_failed');
    }

    return rowToResumeMetadata(row);
  },

  async listResumesByUserId(userId) {
    const result = await pool.query<ResumeRow>(
      `SELECT
         resume_id,
         user_id,
         file_uri,
         original_filename,
         content_type,
         size_bytes,
         checksum_sha256,
         parser_version,
         parse_status,
         parsed_text,
         uploaded_at::text,
         parsed_at::text,
         created_at::text,
         updated_at::text
       FROM resumes
       WHERE user_id = $1
       ORDER BY uploaded_at DESC, resume_id DESC`,
      [userId],
    );

    return result.rows.map(rowToResumeMetadata);
  },

  async findResumeById(userId, resumeId) {
    const result = await pool.query<ResumeRow>(
      `SELECT
         resume_id,
         user_id,
         file_uri,
         original_filename,
         content_type,
         size_bytes,
         checksum_sha256,
         parser_version,
         parse_status,
         parsed_text,
         uploaded_at::text,
         parsed_at::text,
         created_at::text,
         updated_at::text
       FROM resumes
       WHERE user_id = $1 AND resume_id = $2
       LIMIT 1`,
      [userId, resumeId],
    );

    const row = result.rows[0];
    return row ? rowToResumeMetadata(row) : null;
  },

  async upsertStructuredProfile(profile) {
    const result = await pool.query<ResumeStructuredProfileRow>(
      `INSERT INTO resume_structured_profiles (
         resume_id,
         normalized_skills,
         experience_roles,
         companies,
         industries,
         education,
         certifications,
         inferred_seniority,
         extraction_confidence,
         extracted_at
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
         $10::timestamptz
       )
       ON CONFLICT (resume_id)
       DO UPDATE SET
         normalized_skills = EXCLUDED.normalized_skills,
         experience_roles = EXCLUDED.experience_roles,
         companies = EXCLUDED.companies,
         industries = EXCLUDED.industries,
         education = EXCLUDED.education,
         certifications = EXCLUDED.certifications,
         inferred_seniority = EXCLUDED.inferred_seniority,
         extraction_confidence = EXCLUDED.extraction_confidence,
         extracted_at = EXCLUDED.extracted_at
       RETURNING
         resume_id,
         normalized_skills,
         experience_roles,
         companies,
         industries,
         education,
         certifications,
         inferred_seniority,
         extraction_confidence::float8,
         extracted_at::text`,
      [
        profile.resumeId,
        profile.normalizedSkills,
        profile.experienceRoles,
        profile.companies,
        profile.industries,
        profile.education,
        profile.certifications,
        profile.inferredSeniority,
        profile.extractionConfidence,
        profile.extractedAt,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('resume_structured_profile_upsert_failed');
    }

    return rowToStructuredProfile(row);
  },

  async findStructuredProfileByResumeId(resumeId) {
    const result = await pool.query<ResumeStructuredProfileRow>(
      `SELECT
         resume_id,
         normalized_skills,
         experience_roles,
         companies,
         industries,
         education,
         certifications,
         inferred_seniority,
         extraction_confidence::float8,
         extracted_at::text
       FROM resume_structured_profiles
       WHERE resume_id = $1
       LIMIT 1`,
      [resumeId],
    );

    const row = result.rows[0];
    return row ? rowToStructuredProfile(row) : null;
  },
});
