import { randomUUID } from 'node:crypto';

import type {
  ApplicationId,
  ApplicationRecord,
  ApplicationStatus,
  CanonicalJobDetail,
  CanonicalJobId,
} from '@job-hunter/shared';

import { HttpError, isHttpError } from '../../http/http-errors.js';
import { createInMemoryApplicationRepository } from './in-memory-repository.js';
import type { ApplicationRepository } from './repository.js';

const defaultListLimit = 50;
const maxListLimit = 500;

const statusNeedsAppliedAt = new Set<ApplicationStatus>([
  'applied',
  'interview',
  'offer',
  'rejected',
  'archived',
]);

const normalizeLimit = (limit: number | undefined): number => {
  if (limit === undefined) {
    return defaultListLimit;
  }

  return Math.max(1, Math.min(maxListLimit, limit));
};

const normalizeNullableText = (
  value: string | null | undefined,
  maxLength: number,
): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }

  return normalized.slice(0, maxLength);
};

const resolveAppliedAt = (input: {
  status: ApplicationStatus;
  explicitAppliedAt: string | null | undefined;
  existingAppliedAt: string | null;
  nowIso: string;
}): string | null => {
  if (input.explicitAppliedAt !== undefined) {
    return input.explicitAppliedAt;
  }

  if (input.existingAppliedAt) {
    return input.existingAppliedAt;
  }

  if (statusNeedsAppliedAt.has(input.status)) {
    return input.nowIso;
  }

  return null;
};

export interface CanonicalJobLookup {
  getCanonicalJob(canonicalJobId: CanonicalJobId): Promise<CanonicalJobDetail | null>;
}

export interface ResumeLookup {
  getResume(userId: string, resumeId: string): Promise<unknown>;
}

export interface CreateApplicationInput {
  canonicalJobId: CanonicalJobId;
  status?: ApplicationStatus;
  appliedAt?: string | null;
  applicationUrl?: string | null;
  resumeIdUsed?: string | null;
  coverLetterDocUri?: string | null;
  notes?: string | null;
}

export interface UpdateApplicationInput {
  status?: ApplicationStatus;
  appliedAt?: string | null;
  applicationUrl?: string | null;
  resumeIdUsed?: string | null;
  coverLetterDocUri?: string | null;
  notes?: string | null;
}

export interface ApplicationService {
  createApplication(
    userId: string,
    input: CreateApplicationInput,
  ): Promise<ApplicationRecord>;
  listApplications(options: {
    userId: string;
    status?: ApplicationStatus;
    canonicalJobId?: CanonicalJobId;
    limit?: number;
  }): Promise<ApplicationRecord[]>;
  getApplication(
    userId: string,
    applicationId: ApplicationId,
  ): Promise<ApplicationRecord | null>;
  updateApplication(
    userId: string,
    applicationId: ApplicationId,
    input: UpdateApplicationInput,
  ): Promise<ApplicationRecord>;
}

export interface CreateApplicationServiceOptions {
  canonicalJobLookup: CanonicalJobLookup;
  resumeLookup: ResumeLookup;
  repository?: ApplicationRepository;
  now?: () => Date;
}

const validateResumeExists = async (
  resumeLookup: ResumeLookup,
  userId: string,
  resumeId: string,
): Promise<void> => {
  try {
    await resumeLookup.getResume(userId, resumeId);
  } catch (error: unknown) {
    if (isHttpError(error) && error.code === 'resume_not_found') {
      throw error;
    }

    throw error;
  }
};

export const createApplicationService = ({
  canonicalJobLookup,
  resumeLookup,
  repository = createInMemoryApplicationRepository(),
  now = () => new Date(),
}: CreateApplicationServiceOptions): ApplicationService => ({
  async createApplication(userId, input) {
    const canonical = await canonicalJobLookup.getCanonicalJob(input.canonicalJobId);
    if (!canonical) {
      throw new HttpError(404, 'canonical_job_not_found', {
        canonicalJobId: input.canonicalJobId,
      });
    }

    const existing = await repository.findApplicationByCanonicalJob(
      userId,
      input.canonicalJobId,
    );

    if (existing) {
      throw new HttpError(409, 'application_already_exists_for_job', {
        canonicalJobId: input.canonicalJobId,
      });
    }

    const resumeIdUsed =
      input.resumeIdUsed === undefined
        ? null
        : normalizeNullableText(input.resumeIdUsed, 64);

    if (resumeIdUsed !== null) {
      await validateResumeExists(resumeLookup, userId, resumeIdUsed);
    }

    const nowIso = now().toISOString();
    const status = input.status ?? 'ready_to_apply';

    const application: ApplicationRecord = {
      applicationId: randomUUID(),
      userId,
      canonicalJobId: input.canonicalJobId,
      status,
      appliedAt: resolveAppliedAt({
        status,
        explicitAppliedAt: input.appliedAt,
        existingAppliedAt: null,
        nowIso,
      }),
      applicationUrl: normalizeNullableText(input.applicationUrl, 2048),
      resumeIdUsed,
      coverLetterDocUri: normalizeNullableText(input.coverLetterDocUri, 2048),
      notes: normalizeNullableText(input.notes, 2000),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    return repository.createApplication(application);
  },

  async listApplications({ userId, status, canonicalJobId, limit }) {
    const resolvedLimit = normalizeLimit(limit);

    return repository.listApplications({
      userId,
      status,
      canonicalJobId,
      limit: resolvedLimit,
    });
  },

  async getApplication(userId, applicationId) {
    return repository.findApplicationById(userId, applicationId);
  },

  async updateApplication(userId, applicationId, input) {
    const existing = await repository.findApplicationById(userId, applicationId);
    if (!existing) {
      throw new HttpError(404, 'application_not_found', {
        applicationId,
      });
    }

    const resumeIdUsed =
      input.resumeIdUsed === undefined
        ? existing.resumeIdUsed
        : normalizeNullableText(input.resumeIdUsed, 64);

    if (resumeIdUsed !== null) {
      await validateResumeExists(resumeLookup, userId, resumeIdUsed);
    }

    const nowIso = now().toISOString();
    const status = input.status ?? existing.status;

    const nextApplication: ApplicationRecord = {
      ...existing,
      status,
      appliedAt: resolveAppliedAt({
        status,
        explicitAppliedAt: input.appliedAt,
        existingAppliedAt: existing.appliedAt,
        nowIso,
      }),
      applicationUrl:
        input.applicationUrl === undefined
          ? existing.applicationUrl
          : normalizeNullableText(input.applicationUrl, 2048),
      resumeIdUsed,
      coverLetterDocUri:
        input.coverLetterDocUri === undefined
          ? existing.coverLetterDocUri
          : normalizeNullableText(input.coverLetterDocUri, 2048),
      notes:
        input.notes === undefined
          ? existing.notes
          : normalizeNullableText(input.notes, 2000),
      updatedAt: nowIso,
    };

    return repository.updateApplication(nextApplication);
  },
});
