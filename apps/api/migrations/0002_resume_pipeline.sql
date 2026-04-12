-- Step 3: resume upload and parsing pipeline.
-- PostgreSQL migration for resume metadata storage and structured extraction snapshots.

CREATE TABLE IF NOT EXISTS resumes (
  resume_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  file_uri TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  parse_status TEXT NOT NULL,
  parsed_text TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL,
  parsed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT resumes_content_type_check
    CHECK (
      content_type IN (
        'text/plain',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
    ),
  CONSTRAINT resumes_size_bytes_check
    CHECK (size_bytes > 0),
  CONSTRAINT resumes_checksum_sha256_check
    CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT resumes_parse_status_check
    CHECK (parse_status IN ('parsed', 'unsupported_format', 'failed'))
);

CREATE INDEX IF NOT EXISTS resumes_user_uploaded_idx
  ON resumes (user_id, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS resume_structured_profiles (
  resume_id UUID PRIMARY KEY REFERENCES resumes(resume_id) ON DELETE CASCADE,
  normalized_skills TEXT[] NOT NULL DEFAULT '{}',
  experience_roles TEXT[] NOT NULL DEFAULT '{}',
  companies TEXT[] NOT NULL DEFAULT '{}',
  industries TEXT[] NOT NULL DEFAULT '{}',
  education TEXT[] NOT NULL DEFAULT '{}',
  certifications TEXT[] NOT NULL DEFAULT '{}',
  inferred_seniority TEXT,
  extraction_confidence NUMERIC(4, 3) NOT NULL,
  extracted_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT resume_structured_profiles_inferred_seniority_check
    CHECK (
      inferred_seniority IS NULL OR
      inferred_seniority IN ('intern', 'junior', 'mid', 'senior', 'staff', 'principal')
    ),
  CONSTRAINT resume_structured_profiles_confidence_check
    CHECK (extraction_confidence >= 0 AND extraction_confidence <= 1)
);