-- Step 7: explainable match scoring artifacts.
-- PostgreSQL migration for deterministic score breakdowns and versioned explanation snapshots.

CREATE TABLE IF NOT EXISTS user_job_scores (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  canonical_job_id UUID NOT NULL,
  artifact_version INTEGER NOT NULL,
  scoring_version TEXT NOT NULL,
  overall_score NUMERIC(5, 2) NOT NULL,
  title_score NUMERIC(5, 2) NOT NULL,
  skill_score NUMERIC(5, 2) NOT NULL,
  seniority_score NUMERIC(5, 2) NOT NULL,
  location_score NUMERIC(5, 2) NOT NULL,
  compensation_score NUMERIC(5, 2) NOT NULL,
  domain_score NUMERIC(5, 2) NOT NULL,
  requirement_score NUMERIC(5, 2) NOT NULL,
  trajectory_score NUMERIC(5, 2) NOT NULL,
  penalty_score NUMERIC(5, 2) NOT NULL,
  strengths_json JSONB NOT NULL,
  gaps_json JSONB NOT NULL,
  deal_breakers_json JSONB NOT NULL,
  recommendation TEXT NOT NULL,
  explanation_json JSONB,
  explanation_metadata_json JSONB,
  explanation_error_code TEXT,
  scored_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, canonical_job_id, artifact_version),
  CONSTRAINT user_job_scores_artifact_version_check
    CHECK (artifact_version > 0),
  CONSTRAINT user_job_scores_recommendation_check
    CHECK (recommendation IN ('apply', 'review', 'skip')),
  CONSTRAINT user_job_scores_score_range_check
    CHECK (
      overall_score BETWEEN 0 AND 100 AND
      title_score BETWEEN 0 AND 100 AND
      skill_score BETWEEN 0 AND 100 AND
      seniority_score BETWEEN 0 AND 100 AND
      location_score BETWEEN 0 AND 100 AND
      compensation_score BETWEEN 0 AND 100 AND
      domain_score BETWEEN 0 AND 100 AND
      requirement_score BETWEEN 0 AND 100 AND
      trajectory_score BETWEEN 0 AND 100 AND
      penalty_score BETWEEN 0 AND 100
    )
);

CREATE INDEX IF NOT EXISTS user_job_scores_latest_idx
  ON user_job_scores (user_id, canonical_job_id, artifact_version DESC);

CREATE INDEX IF NOT EXISTS user_job_scores_rank_idx
  ON user_job_scores (user_id, overall_score DESC, scored_at DESC);