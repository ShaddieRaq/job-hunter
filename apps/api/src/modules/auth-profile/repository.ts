import type { AuthUser, UserPreferences, UserProfile } from '@job-hunter/shared';

export interface SessionRecord {
  accessToken: string;
  userId: string;
  createdAt: string;
}

export interface AuthProfileRepository {
  insertUser(user: AuthUser): Promise<void>;
  findUserByEmail(email: string): Promise<AuthUser | null>;
  findUserById(userId: string): Promise<AuthUser | null>;

  saveSession(session: SessionRecord): Promise<void>;
  findSessionByToken(accessToken: string): Promise<SessionRecord | null>;

  getProfile(userId: string): Promise<UserProfile | null>;
  upsertProfile(profile: UserProfile): Promise<UserProfile>;

  getPreferences(userId: string): Promise<UserPreferences | null>;
  upsertPreferences(preferences: UserPreferences): Promise<UserPreferences>;
}
