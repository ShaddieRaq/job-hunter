import { randomUUID } from 'node:crypto';

import type {
  ApplicationId,
  ApplicationMaterialGuidance,
  ApplicationRecord,
  ApplicationStatus,
  CanonicalJobDetail,
  CanonicalJobId,
  UserPreferences,
  UserProfile,
} from '@job-hunter/shared';

import { HttpError, isHttpError } from '../../http/http-errors.js';
import { createInMemoryApplicationRepository } from './in-memory-repository.js';
import type { ApplicationRepository } from './repository.js';

const defaultListLimit = Number.MAX_SAFE_INTEGER;

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

  return Math.max(1, limit);
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

const dedupeOrderedStrings = (values: string[]): string[] => {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = value.trim();
    if (normalized.length === 0) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(normalized);
  }

  return deduped;
};

const statusChecklistPrompt: Record<ApplicationStatus, string> = {
  ready_to_apply:
    'Confirm a tailored resume version is attached before submitting this application.',
  applied:
    'Set a follow-up reminder with a concise value recap tied to this role.',
  interview:
    'Prepare two STAR stories mapped directly to the most important role skills.',
  offer:
    'Summarize your decision criteria and compensation expectations before responding.',
  rejected:
    'Capture one lesson learned and recycle the strongest material for similar roles.',
  archived:
    'Record archive reason and keep reusable tailored bullets for future applications.',
};

const buildKeywordSuggestions = (
  canonicalJob: CanonicalJobDetail,
  preferences: UserPreferences,
): string[] => {
  const suggestions = dedupeOrderedStrings([
    ...canonicalJob.job.topSkills,
    ...preferences.preferredSkills,
    ...preferences.preferredTitles,
    canonicalJob.job.canonicalTitle,
  ]);

  if (suggestions.length === 0) {
    return ['Impact', 'Ownership', 'Delivery'];
  }

  return suggestions.slice(0, 12);
};

const buildChecklist = (input: {
  application: ApplicationRecord;
  canonicalJob: CanonicalJobDetail;
  profile: UserProfile;
  preferences: UserPreferences;
}): string[] => {
  const topSkills = input.canonicalJob.job.topSkills.slice(0, 3);
  const currentTitle = input.profile.currentTitle?.trim() ?? '';

  const checklist = dedupeOrderedStrings([
    `Mirror the role title "${input.canonicalJob.job.canonicalTitle}" in your resume headline or summary.`,
    topSkills.length > 0
      ? `Anchor your first two bullets to these skills: ${topSkills.join(', ')}.`
      : 'Anchor your first two bullets to the most important technical requirements.',
    currentTitle.length > 0
      ? `Translate scope from your current title (${currentTitle}) into outcomes relevant to this role.`
      : 'Add one sentence on your current scope to establish role-level alignment quickly.',
    input.application.resumeIdUsed
      ? 'Keep resume version history clear so you can reuse the strongest tailored draft.'
      : 'Select and store the exact resume version used for this application.',
    input.application.applicationUrl
      ? 'Verify application URL metadata and submission timestamp in your tracker notes.'
      : 'Save the application URL so follow-up and status updates stay auditable.',
    statusChecklistPrompt[input.application.status],
    input.preferences.remotePreference !== 'flexible' &&
    input.canonicalJob.job.remoteType !== input.preferences.remotePreference
      ? `Address work model alignment: role is ${input.canonicalJob.job.remoteType}, preference is ${input.preferences.remotePreference}.`
      : 'Include one sentence confirming work model and collaboration expectations are aligned.',
  ]);

  return checklist.slice(0, 12);
};

const buildBulletSuggestions = (input: {
  canonicalJob: CanonicalJobDetail;
  profile: UserProfile;
}) => {
  const roleLabel = input.canonicalJob.job.canonicalTitle;
  const skillPrompts = input.canonicalJob.job.topSkills.slice(0, 4).map((skill) => ({
    focusArea: skill,
    prompt: `Write one bullet showing measurable impact where you used ${skill} to improve delivery, reliability, or product outcomes in a role comparable to ${roleLabel}.`,
  }));

  const suggestions = [...skillPrompts];

  if ((input.profile.yearsExperience ?? 0) >= 5) {
    suggestions.push({
      focusArea: 'Leadership and ownership',
      prompt:
        'Add one bullet that quantifies cross-functional ownership, decision making, and the business impact of your technical leadership.',
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      focusArea: roleLabel,
      prompt:
        'Add one quantified bullet that demonstrates direct scope alignment with this target role.',
    });
  }

  return suggestions.slice(0, 8);
};

const buildCoverLetterTalkingPoints = (input: {
  canonicalJob: CanonicalJobDetail;
  profile: UserProfile;
  preferences: UserPreferences;
}): string[] => {
  const topSkills = input.canonicalJob.job.topSkills.slice(0, 2);
  const currentTitle = input.profile.currentTitle?.trim() ?? '';

  const points = dedupeOrderedStrings([
    `Open with a fit statement that links your background to ${input.canonicalJob.job.canonicalTitle} at ${input.canonicalJob.job.canonicalCompanyName}.`,
    topSkills.length > 0
      ? `Connect recent impact to these role skills: ${topSkills.join(', ')}.`
      : 'Connect your most relevant impact to this role\'s core technical scope.',
    currentTitle.length > 0
      ? `Reference your current role (${currentTitle}) and why this next scope is a deliberate progression.`
      : 'Describe the progression logic from your current scope to this target role.',
    input.preferences.remotePreference === 'flexible'
      ? `Confirm collaboration model fit for ${input.canonicalJob.job.remoteType} work.`
      : `Address work model alignment (${input.preferences.remotePreference} preference vs ${input.canonicalJob.job.remoteType} role model).`,
  ]);

  return points.slice(0, 8);
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

export interface GetApplicationMaterialGuidanceInput {
  userId: string;
  applicationId: ApplicationId;
  profile: UserProfile;
  preferences: UserPreferences;
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
  getApplicationMaterialGuidance(
    input: GetApplicationMaterialGuidanceInput,
  ): Promise<ApplicationMaterialGuidance>;
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

  async getApplicationMaterialGuidance({
    userId,
    applicationId,
    profile,
    preferences,
  }) {
    const application = await repository.findApplicationById(userId, applicationId);
    if (!application) {
      throw new HttpError(404, 'application_not_found', {
        applicationId,
      });
    }

    const canonicalJob = await canonicalJobLookup.getCanonicalJob(
      application.canonicalJobId,
    );
    if (!canonicalJob) {
      throw new HttpError(404, 'canonical_job_not_found', {
        canonicalJobId: application.canonicalJobId,
      });
    }

    return {
      application,
      canonicalJob: {
        canonicalJobId: canonicalJob.job.canonicalJobId,
        canonicalTitle: canonicalJob.job.canonicalTitle,
        canonicalCompanyName: canonicalJob.job.canonicalCompanyName,
        remoteType: canonicalJob.job.remoteType,
        employmentType: canonicalJob.job.employmentType,
        topSkills: canonicalJob.job.topSkills.slice(0, 12),
      },
      checklist: buildChecklist({
        application,
        canonicalJob,
        profile,
        preferences,
      }),
      keywordSuggestions: buildKeywordSuggestions(canonicalJob, preferences),
      bulletSuggestions: buildBulletSuggestions({
        canonicalJob,
        profile,
      }),
      coverLetterTalkingPoints: buildCoverLetterTalkingPoints({
        canonicalJob,
        profile,
        preferences,
      }),
    };
  },
});
