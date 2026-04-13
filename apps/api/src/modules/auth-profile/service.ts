import { randomBytes, randomUUID } from 'node:crypto';

import type {
  AuthLoginRequest,
  AuthRegisterRequest,
  AuthSession,
  AuthUser,
  Seniority,
  UserPreferences,
  UserPreferencesPayload,
  UserProfile,
  UserProfilePayload,
} from '@job-hunter/shared';

import { HttpError } from '../../http/http-errors.js';
import {
  createDefaultPreferencesPayload,
  createDefaultProfilePayload,
} from './defaults.js';
import type { AuthProfileRepository, SessionRecord } from './repository.js';

const seniorityOrder: Record<Seniority, number> = {
  intern: 0,
  junior: 1,
  mid: 2,
  senior: 3,
  staff: 4,
  principal: 5,
};

const maxUserListLimit = 10_000;

const dedupeList = (values: string[]): string[] => {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const trimmed = value.trim();
    const dedupeKey = trimmed.toLowerCase();

    if (trimmed.length === 0 || seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    deduped.push(trimmed);
  }

  return deduped;
};

const normalizePreferencesPayload = (
  payload: UserPreferencesPayload,
): UserPreferencesPayload => {
  if (
    payload.targetSeniorityMin &&
    payload.targetSeniorityMax &&
    seniorityOrder[payload.targetSeniorityMin] >
      seniorityOrder[payload.targetSeniorityMax]
  ) {
    throw new HttpError(400, 'invalid_seniority_range', {
      targetSeniorityMin: payload.targetSeniorityMin,
      targetSeniorityMax: payload.targetSeniorityMax,
    });
  }

  if (
    payload.salaryMin !== null &&
    payload.salaryTarget !== null &&
    payload.salaryTarget < payload.salaryMin
  ) {
    throw new HttpError(400, 'invalid_salary_range', {
      salaryMin: payload.salaryMin,
      salaryTarget: payload.salaryTarget,
    });
  }

  return {
    ...payload,
    preferredTitles: dedupeList(payload.preferredTitles),
    preferredIndustries: dedupeList(payload.preferredIndustries),
    preferredSkills: dedupeList(payload.preferredSkills),
    preferredLocations: dedupeList(payload.preferredLocations),
    dealBreakers: dedupeList(payload.dealBreakers),
    hiddenCompanies: dedupeList(payload.hiddenCompanies),
    hiddenTitles: dedupeList(payload.hiddenTitles),
  };
};

const normalizeUserListLimit = (limit: number | undefined): number | undefined => {
  if (limit === undefined) {
    return undefined;
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error('invalid_user_list_limit');
  }

  return Math.min(limit, maxUserListLimit);
};

export interface AuthProfileService {
  register(request: AuthRegisterRequest): Promise<AuthSession>;
  login(request: AuthLoginRequest): Promise<AuthSession>;
  authenticate(accessToken: string): Promise<AuthUser>;
  listUserIds(limit?: number): Promise<string[]>;

  getProfile(userId: string): Promise<UserProfile>;
  upsertProfile(userId: string, payload: UserProfilePayload): Promise<UserProfile>;

  getPreferences(userId: string): Promise<UserPreferences>;
  upsertPreferences(
    userId: string,
    payload: UserPreferencesPayload,
  ): Promise<UserPreferences>;
}

export interface CreateAuthProfileServiceOptions {
  repository: AuthProfileRepository;
}

const createSessionToken = (): string => randomBytes(24).toString('hex');

const createSessionRecord = (userId: string, createdAt: string): SessionRecord => ({
  accessToken: createSessionToken(),
  userId,
  createdAt,
});

const withDefaultsProfile = (
  userId: string,
  profile: UserProfile | null,
  nowIso: string,
): UserProfile => {
  if (profile) {
    return profile;
  }

  return {
    userId,
    ...createDefaultProfilePayload(),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
};

const withDefaultPreferences = (
  userId: string,
  preferences: UserPreferences | null,
  nowIso: string,
): UserPreferences => {
  if (preferences) {
    return preferences;
  }

  return {
    userId,
    ...createDefaultPreferencesPayload(),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
};

export const createAuthProfileService = ({
  repository,
}: CreateAuthProfileServiceOptions): AuthProfileService => ({
  async register(request) {
    const email = request.email.toLowerCase();
    const existing = await repository.findUserByEmail(email);
    if (existing) {
      throw new HttpError(409, 'email_already_registered');
    }

    const nowIso = new Date().toISOString();
    const user: AuthUser = {
      userId: randomUUID(),
      email,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await repository.insertUser(user);

    const profile = withDefaultsProfile(user.userId, null, nowIso);
    const preferences = withDefaultPreferences(user.userId, null, nowIso);

    await repository.upsertProfile(profile);
    await repository.upsertPreferences(preferences);

    const session = createSessionRecord(user.userId, nowIso);
    await repository.saveSession(session);

    return {
      accessToken: session.accessToken,
      user,
    };
  },

  async login(request) {
    const user = await repository.findUserByEmail(request.email.toLowerCase());
    if (!user) {
      throw new HttpError(404, 'user_not_found');
    }

    const session = createSessionRecord(user.userId, new Date().toISOString());
    await repository.saveSession(session);

    return {
      accessToken: session.accessToken,
      user,
    };
  },

  async authenticate(accessToken) {
    const session = await repository.findSessionByToken(accessToken);
    if (!session) {
      throw new HttpError(401, 'invalid_access_token');
    }

    const user = await repository.findUserById(session.userId);
    if (!user) {
      throw new HttpError(401, 'invalid_access_token');
    }

    return user;
  },

  async listUserIds(limit) {
    const normalizedLimit = normalizeUserListLimit(limit);
    return repository.listUserIds(normalizedLimit);
  },

  async getProfile(userId) {
    const existing = await repository.getProfile(userId);
    if (existing) {
      return existing;
    }

    const nowIso = new Date().toISOString();
    const profile = withDefaultsProfile(userId, null, nowIso);
    return repository.upsertProfile(profile);
  },

  async upsertProfile(userId, payload) {
    const existing = await repository.getProfile(userId);
    const nowIso = new Date().toISOString();

    const profile: UserProfile = {
      userId,
      ...payload,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };

    return repository.upsertProfile(profile);
  },

  async getPreferences(userId) {
    const existing = await repository.getPreferences(userId);
    if (existing) {
      return existing;
    }

    const nowIso = new Date().toISOString();
    const preferences = withDefaultPreferences(userId, null, nowIso);
    return repository.upsertPreferences(preferences);
  },

  async upsertPreferences(userId, payload) {
    const normalizedPayload = normalizePreferencesPayload(payload);
    const existing = await repository.getPreferences(userId);
    const nowIso = new Date().toISOString();

    const preferences: UserPreferences = {
      userId,
      ...normalizedPayload,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };

    return repository.upsertPreferences(preferences);
  },
});
