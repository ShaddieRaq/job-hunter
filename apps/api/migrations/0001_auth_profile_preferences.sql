-- Step 2: auth + profile/preferences foundation
-- PostgreSQL migration for initial identity/profile/preferences persistence model.

CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS user_sessions (
  access_token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  current_title TEXT,
  years_experience INTEGER,
  summary TEXT,
  work_authorization TEXT,
  sponsorship_required BOOLEAN,
  transition_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT user_profiles_years_experience_check
    CHECK (years_experience IS NULL OR years_experience BETWEEN 0 AND 60),
  CONSTRAINT user_profiles_work_authorization_check
    CHECK (
      work_authorization IS NULL OR
      work_authorization IN ('citizen', 'permanent_resident', 'visa', 'other')
    )
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  preferred_titles TEXT[] NOT NULL DEFAULT '{}',
  preferred_industries TEXT[] NOT NULL DEFAULT '{}',
  preferred_skills TEXT[] NOT NULL DEFAULT '{}',
  preferred_locations TEXT[] NOT NULL DEFAULT '{}',
  remote_preference TEXT NOT NULL,
  target_seniority_min TEXT,
  target_seniority_max TEXT,
  salary_min INTEGER,
  salary_target INTEGER,
  deal_breakers TEXT[] NOT NULL DEFAULT '{}',
  hidden_companies TEXT[] NOT NULL DEFAULT '{}',
  hidden_titles TEXT[] NOT NULL DEFAULT '{}',
  stretch_preference_level INTEGER NOT NULL,
  notification_preferences JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT user_preferences_remote_preference_check
    CHECK (remote_preference IN ('remote', 'hybrid', 'onsite', 'flexible')),
  CONSTRAINT user_preferences_target_seniority_min_check
    CHECK (
      target_seniority_min IS NULL OR
      target_seniority_min IN ('intern', 'junior', 'mid', 'senior', 'staff', 'principal')
    ),
  CONSTRAINT user_preferences_target_seniority_max_check
    CHECK (
      target_seniority_max IS NULL OR
      target_seniority_max IN ('intern', 'junior', 'mid', 'senior', 'staff', 'principal')
    ),
  CONSTRAINT user_preferences_stretch_preference_level_check
    CHECK (stretch_preference_level BETWEEN 1 AND 5),
  CONSTRAINT user_preferences_salary_min_check
    CHECK (salary_min IS NULL OR salary_min >= 0),
  CONSTRAINT user_preferences_salary_target_check
    CHECK (salary_target IS NULL OR salary_target >= 0),
  CONSTRAINT user_preferences_salary_range_check
    CHECK (
      salary_min IS NULL OR
      salary_target IS NULL OR
      salary_target >= salary_min
    )
);
