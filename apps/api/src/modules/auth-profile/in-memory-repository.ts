import type { AuthUser, UserPreferences, UserProfile } from '@job-hunter/shared';

import type { AuthProfileRepository, SessionRecord } from './repository.js';

const cloneUser = (user: AuthUser): AuthUser => ({ ...user });

const cloneProfile = (profile: UserProfile): UserProfile => ({
  ...profile,
});

const clonePreferences = (preferences: UserPreferences): UserPreferences => ({
  ...preferences,
  preferredTitles: [...preferences.preferredTitles],
  preferredIndustries: [...preferences.preferredIndustries],
  preferredSkills: [...preferences.preferredSkills],
  preferredLocations: [...preferences.preferredLocations],
  dealBreakers: [...preferences.dealBreakers],
  hiddenCompanies: [...preferences.hiddenCompanies],
  hiddenTitles: [...preferences.hiddenTitles],
  notificationPreferences: {
    ...preferences.notificationPreferences,
  },
});

const cloneSession = (session: SessionRecord): SessionRecord => ({ ...session });

export const createInMemoryAuthProfileRepository = (): AuthProfileRepository => {
  const usersById = new Map<string, AuthUser>();
  const userIdsByEmail = new Map<string, string>();
  const sessionsByToken = new Map<string, SessionRecord>();
  const profilesByUserId = new Map<string, UserProfile>();
  const preferencesByUserId = new Map<string, UserPreferences>();

  return {
    async insertUser(user) {
      const normalizedEmail = user.email.toLowerCase();
      if (userIdsByEmail.has(normalizedEmail)) {
        throw new Error('duplicate_email');
      }

      usersById.set(user.userId, cloneUser(user));
      userIdsByEmail.set(normalizedEmail, user.userId);
    },

    async findUserByEmail(email) {
      const userId = userIdsByEmail.get(email.toLowerCase());
      if (!userId) {
        return null;
      }

      const user = usersById.get(userId);
      return user ? cloneUser(user) : null;
    },

    async findUserById(userId) {
      const user = usersById.get(userId);
      return user ? cloneUser(user) : null;
    },

    async listUserIds(limit) {
      const userIds = Array.from(usersById.keys());
      if (limit === undefined) {
        return userIds;
      }

      return userIds.slice(0, Math.max(0, limit));
    },

    async saveSession(session) {
      sessionsByToken.set(session.accessToken, cloneSession(session));
    },

    async findSessionByToken(accessToken) {
      const session = sessionsByToken.get(accessToken);
      return session ? cloneSession(session) : null;
    },

    async getProfile(userId) {
      const profile = profilesByUserId.get(userId);
      return profile ? cloneProfile(profile) : null;
    },

    async upsertProfile(profile) {
      profilesByUserId.set(profile.userId, cloneProfile(profile));
      return cloneProfile(profile);
    },

    async getPreferences(userId) {
      const preferences = preferencesByUserId.get(userId);
      return preferences ? clonePreferences(preferences) : null;
    },

    async upsertPreferences(preferences) {
      preferencesByUserId.set(preferences.userId, clonePreferences(preferences));
      return clonePreferences(preferences);
    },
  };
};
