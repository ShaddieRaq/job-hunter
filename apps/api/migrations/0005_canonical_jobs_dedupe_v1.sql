-- Step 5: canonical job catalog and dedupe v1 scaffold.
-- PostgreSQL migration for canonical jobs and source-to-canonical mapping traceability.

CREATE TABLE IF NOT EXISTS canonical_jobs (
  canonical_job_id UUID PRIMARY KEY,
  canonical_company_name TEXT NOT NULL,
  canonical_title TEXT NOT NULL,
  normalized_location TEXT,
  remote_type TEXT NOT NULL,
  employment_type TEXT NOT NULL,
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency TEXT,
  salary_period TEXT,
  source_count INTEGER NOT NULL,
  source_names TEXT[] NOT NULL DEFAULT '{}',
  job_status TEXT NOT NULL,
  top_skills TEXT[] NOT NULL DEFAULT '{}',
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  canonicalization_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT canonical_jobs_remote_type_check
    CHECK (remote_type IN ('remote', 'hybrid', 'onsite', 'unknown')),
  CONSTRAINT canonical_jobs_employment_type_check
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
  CONSTRAINT canonical_jobs_salary_min_check
    CHECK (salary_min IS NULL OR salary_min >= 0),
  CONSTRAINT canonical_jobs_salary_max_check
    CHECK (salary_max IS NULL OR salary_max >= 0),
  CONSTRAINT canonical_jobs_salary_range_check
    CHECK (
      salary_min IS NULL OR
      salary_max IS NULL OR
      salary_max >= salary_min
    ),
  CONSTRAINT canonical_jobs_salary_period_check
    CHECK (
      salary_period IS NULL OR
      salary_period IN ('hour', 'month', 'year')
    ),
  CONSTRAINT canonical_jobs_source_count_check
    CHECK (source_count >= 1),
  CONSTRAINT canonical_jobs_job_status_check
    CHECK (job_status IN ('open', 'closed', 'unknown'))
);

CREATE INDEX IF NOT EXISTS canonical_jobs_seen_idx
  ON canonical_jobs (last_seen_at DESC, first_seen_at DESC);

CREATE TABLE IF NOT EXISTS canonical_job_source_mappings (
  canonical_job_id UUID NOT NULL REFERENCES canonical_jobs(canonical_job_id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  source_job_id TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL,
  mapping_confidence NUMERIC(4, 3) NOT NULL,
  mapping_reason_codes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (canonical_job_id, source_name, source_job_id),
  CONSTRAINT canonical_job_source_mappings_confidence_check
    CHECK (mapping_confidence >= 0 AND mapping_confidence <= 1)
);

CREATE INDEX IF NOT EXISTS canonical_job_source_mappings_source_idx
  ON canonical_job_source_mappings (source_name, source_job_id);

CREATE UNIQUE INDEX IF NOT EXISTS canonical_job_source_mappings_primary_unique_idx
  ON canonical_job_source_mappings (canonical_job_id)
  WHERE is_primary = TRUE;
