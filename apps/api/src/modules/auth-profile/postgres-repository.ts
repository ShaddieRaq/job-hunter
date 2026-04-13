import type {
  AuthUser,
  UserPreferences,
  UserProfile,
} from '@job-hunter/shared';

import type { PostgresPool } from '../../db/postgres.js';
import type { AuthProfileRepository, SessionRecord } from './repository.js';
import type {
  UserPreferencesRow,
  UserProfileRow,
  UserRow,
  UserSessionRow,
} from './persistence-model.js';

const rowToUser = (row: UserRow): AuthUser => ({
  userId: row.user_id,
  email: row.email,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const rowToSession = (row: UserSessionRow): SessionRecord => ({
  accessToken: row.access_token,
  userId: row.user_id,
  createdAt: row.created_at,
});

const rowToProfile = (row: UserProfileRow): UserProfile => ({
  userId: row.user_id,
  currentTitle: row.current_title,
  yearsExperience: row.years_experience,
  summary: row.summary,
  workAuthorization: row.work_authorization,
  sponsorshipRequired: row.sponsorship_required,
  transitionNotes: row.transition_notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const rowToPreferences = (row: UserPreferencesRow): UserPreferences => ({
  userId: row.user_id,
  preferredTitles: row.preferred_titles,
  preferredIndustries: row.preferred_industries,
  preferredSkills: row.preferred_skills,
  preferredLocations: row.preferred_locations,
  remotePreference: row.remote_preference,
  targetSeniorityMin: row.target_seniority_min,
  targetSeniorityMax: row.target_seniority_max,
  salaryMin: row.salary_min,
  salaryTarget: row.salary_target,
  dealBreakers: row.deal_breakers,
  hiddenCompanies: row.hidden_companies,
  hiddenTitles: row.hidden_titles,
  stretchPreferenceLevel: row.stretch_preference_level,
  notificationPreferences: row.notification_preferences,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const createPostgresAuthProfileRepository = (
  pool: PostgresPool,
): AuthProfileRepository => ({
  async insertUser(user) {
    await pool.query(
      `INSERT INTO users (
         user_id,
         email,
         created_at,
         updated_at
       ) VALUES (
         $1,
         $2,
         $3::timestamptz,
         $4::timestamptz
       )`,
      [user.userId, user.email, user.createdAt, user.updatedAt],
    );
  },

  async findUserByEmail(email) {
    const result = await pool.query<UserRow>(
      `SELECT
         user_id,
         email,
         created_at::text,
         updated_at::text
       FROM users
       WHERE lower(email) = lower($1)
       LIMIT 1`,
      [email],
    );

    const row = result.rows[0];
    return row ? rowToUser(row) : null;
  },

  async findUserById(userId) {
    const result = await pool.query<UserRow>(
      `SELECT
         user_id,
         email,
         created_at::text,
         updated_at::text
       FROM users
       WHERE user_id = $1
       LIMIT 1`,
      [userId],
    );

    const row = result.rows[0];
    return row ? rowToUser(row) : null;
  },

  async listUserIds(limit) {
    if (limit === undefined) {
      const result = await pool.query<Pick<UserRow, 'user_id'>>(
        `SELECT user_id
         FROM users
         ORDER BY created_at DESC, user_id ASC`,
      );

      return result.rows.map((row) => row.user_id);
    }

    const result = await pool.query<Pick<UserRow, 'user_id'>>(
      `SELECT user_id
       FROM users
       ORDER BY created_at DESC, user_id ASC
       LIMIT $1`,
      [limit],
    );

    return result.rows.map((row) => row.user_id);
  },

  async saveSession(session) {
    await pool.query(
      `INSERT INTO user_sessions (
         access_token,
         user_id,
         created_at
       ) VALUES (
         $1,
         $2,
         $3::timestamptz
       )
       ON CONFLICT (access_token)
       DO UPDATE SET
         user_id = EXCLUDED.user_id,
         created_at = EXCLUDED.created_at`,
      [session.accessToken, session.userId, session.createdAt],
    );
  },

  async findSessionByToken(accessToken) {
    const result = await pool.query<UserSessionRow>(
      `SELECT
         access_token,
         user_id,
         created_at::text
       FROM user_sessions
       WHERE access_token = $1
       LIMIT 1`,
      [accessToken],
    );

    const row = result.rows[0];
    return row ? rowToSession(row) : null;
  },

  async getProfile(userId) {
    const result = await pool.query<UserProfileRow>(
      `SELECT
         user_id,
         current_title,
         years_experience,
         summary,
         work_authorization,
         sponsorship_required,
         transition_notes,
         created_at::text,
         updated_at::text
       FROM user_profiles
       WHERE user_id = $1
       LIMIT 1`,
      [userId],
    );

    const row = result.rows[0];
    return row ? rowToProfile(row) : null;
  },

  async upsertProfile(profile) {
    const result = await pool.query<UserProfileRow>(
      `INSERT INTO user_profiles (
         user_id,
         current_title,
         years_experience,
         summary,
         work_authorization,
         sponsorship_required,
         transition_notes,
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
         $8::timestamptz,
         $9::timestamptz
       )
       ON CONFLICT (user_id)
       DO UPDATE SET
         current_title = EXCLUDED.current_title,
         years_experience = EXCLUDED.years_experience,
         summary = EXCLUDED.summary,
         work_authorization = EXCLUDED.work_authorization,
         sponsorship_required = EXCLUDED.sponsorship_required,
         transition_notes = EXCLUDED.transition_notes,
         created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at
       RETURNING
         user_id,
         current_title,
         years_experience,
         summary,
         work_authorization,
         sponsorship_required,
         transition_notes,
         created_at::text,
         updated_at::text`,
      [
        profile.userId,
        profile.currentTitle,
        profile.yearsExperience,
        profile.summary,
        profile.workAuthorization,
        profile.sponsorshipRequired,
        profile.transitionNotes,
        profile.createdAt,
        profile.updatedAt,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('user_profile_upsert_failed');
    }

    return rowToProfile(row);
  },

  async getPreferences(userId) {
    const result = await pool.query<UserPreferencesRow>(
      `SELECT
         user_id,
         preferred_titles,
         preferred_industries,
         preferred_skills,
         preferred_locations,
         remote_preference,
         target_seniority_min,
         target_seniority_max,
         salary_min,
         salary_target,
         deal_breakers,
         hidden_companies,
         hidden_titles,
         stretch_preference_level,
         notification_preferences,
         created_at::text,
         updated_at::text
       FROM user_preferences
       WHERE user_id = $1
       LIMIT 1`,
      [userId],
    );

    const row = result.rows[0];
    return row ? rowToPreferences(row) : null;
  },

  async upsertPreferences(preferences) {
    const result = await pool.query<UserPreferencesRow>(
      `INSERT INTO user_preferences (
         user_id,
         preferred_titles,
         preferred_industries,
         preferred_skills,
         preferred_locations,
         remote_preference,
         target_seniority_min,
         target_seniority_max,
         salary_min,
         salary_target,
         deal_breakers,
         hidden_companies,
         hidden_titles,
         stretch_preference_level,
         notification_preferences,
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
         $15::jsonb,
         $16::timestamptz,
         $17::timestamptz
       )
       ON CONFLICT (user_id)
       DO UPDATE SET
         preferred_titles = EXCLUDED.preferred_titles,
         preferred_industries = EXCLUDED.preferred_industries,
         preferred_skills = EXCLUDED.preferred_skills,
         preferred_locations = EXCLUDED.preferred_locations,
         remote_preference = EXCLUDED.remote_preference,
         target_seniority_min = EXCLUDED.target_seniority_min,
         target_seniority_max = EXCLUDED.target_seniority_max,
         salary_min = EXCLUDED.salary_min,
         salary_target = EXCLUDED.salary_target,
         deal_breakers = EXCLUDED.deal_breakers,
         hidden_companies = EXCLUDED.hidden_companies,
         hidden_titles = EXCLUDED.hidden_titles,
         stretch_preference_level = EXCLUDED.stretch_preference_level,
         notification_preferences = EXCLUDED.notification_preferences,
         created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at
       RETURNING
         user_id,
         preferred_titles,
         preferred_industries,
         preferred_skills,
         preferred_locations,
         remote_preference,
         target_seniority_min,
         target_seniority_max,
         salary_min,
         salary_target,
         deal_breakers,
         hidden_companies,
         hidden_titles,
         stretch_preference_level,
         notification_preferences,
         created_at::text,
         updated_at::text`,
      [
        preferences.userId,
        preferences.preferredTitles,
        preferences.preferredIndustries,
        preferences.preferredSkills,
        preferences.preferredLocations,
        preferences.remotePreference,
        preferences.targetSeniorityMin,
        preferences.targetSeniorityMax,
        preferences.salaryMin,
        preferences.salaryTarget,
        preferences.dealBreakers,
        preferences.hiddenCompanies,
        preferences.hiddenTitles,
        preferences.stretchPreferenceLevel,
        JSON.stringify(preferences.notificationPreferences),
        preferences.createdAt,
        preferences.updatedAt,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('user_preferences_upsert_failed');
    }

    return rowToPreferences(row);
  },
});
