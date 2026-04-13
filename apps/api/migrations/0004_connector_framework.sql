-- Step 4: connector framework and first connector ingestion storage.
-- PostgreSQL migration for connector health snapshots and source job payload persistence.

CREATE TABLE IF NOT EXISTS job_sources (
  source_name TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  connector_version TEXT NOT NULL,
  health_status TEXT NOT NULL,
  last_sync_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_error_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT job_sources_health_status_check
    CHECK (health_status IN ('unknown', 'healthy', 'degraded', 'unhealthy'))
);

CREATE TABLE IF NOT EXISTS source_jobs (
  source_name TEXT NOT NULL REFERENCES job_sources(source_name) ON DELETE CASCADE,
  source_job_id TEXT NOT NULL,
  source_company_id TEXT,
  source_status TEXT NOT NULL,
  title TEXT NOT NULL,
  company_name TEXT NOT NULL,
  fetch_url TEXT NOT NULL,
  application_url TEXT,
  location_text TEXT,
  remote_type TEXT NOT NULL,
  employment_type TEXT NOT NULL,
  posted_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  description_text TEXT NOT NULL,
  normalized_skills TEXT[] NOT NULL DEFAULT '{}',
  required_skills TEXT[] NOT NULL DEFAULT '{}',
  preferred_skills TEXT[] NOT NULL DEFAULT '{}',
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency TEXT,
  salary_period TEXT,
  raw_payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (source_name, source_job_id),
  CONSTRAINT source_jobs_source_status_check
    CHECK (source_status IN ('open', 'closed', 'unknown')),
  CONSTRAINT source_jobs_remote_type_check
    CHECK (remote_type IN ('remote', 'hybrid', 'onsite', 'unknown')),
  CONSTRAINT source_jobs_employment_type_check
    CHECK (
      employment_type IN (
        'full_time',
        'part_time',
        'contract',
        'internship',
        'temporary',
        'unknown'
      )
    ),
  CONSTRAINT source_jobs_checksum_sha256_check
    CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT source_jobs_salary_min_check
    CHECK (salary_min IS NULL OR salary_min >= 0),
  CONSTRAINT source_jobs_salary_max_check
    CHECK (salary_max IS NULL OR salary_max >= 0),
  CONSTRAINT source_jobs_salary_range_check
    CHECK (
      salary_min IS NULL OR
      salary_max IS NULL OR
      salary_max >= salary_min
    ),
  CONSTRAINT source_jobs_salary_period_check
    CHECK (
      salary_period IS NULL OR
      salary_period IN ('hour', 'month', 'year')
    )
);

CREATE INDEX IF NOT EXISTS source_jobs_seen_idx
  ON source_jobs (source_name, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS source_jobs_status_idx
  ON source_jobs (source_status, remote_type, employment_type);
