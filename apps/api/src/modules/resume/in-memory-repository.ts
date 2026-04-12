import type { ResumeMetadata, ResumeStructuredProfile } from '@job-hunter/shared';

import type { ResumeRecord, ResumeRepository } from './repository.js';

const cloneResumeMetadata = (resume: ResumeMetadata): ResumeMetadata => ({
  resumeId: resume.resumeId,
  userId: resume.userId,
  originalFilename: resume.originalFilename,
  contentType: resume.contentType,
  fileUri: resume.fileUri,
  sizeBytes: resume.sizeBytes,
  checksumSha256: resume.checksumSha256,
  parserVersion: resume.parserVersion,
  parseStatus: resume.parseStatus,
  uploadedAt: resume.uploadedAt,
  parsedAt: resume.parsedAt,
  createdAt: resume.createdAt,
  updatedAt: resume.updatedAt,
});

const cloneResumeRecord = (resume: ResumeRecord): ResumeRecord => ({
  ...cloneResumeMetadata(resume),
  parsedText: resume.parsedText,
});

const cloneStructuredProfile = (
  profile: ResumeStructuredProfile,
): ResumeStructuredProfile => ({
  resumeId: profile.resumeId,
  normalizedSkills: [...profile.normalizedSkills],
  experienceRoles: [...profile.experienceRoles],
  companies: [...profile.companies],
  industries: [...profile.industries],
  education: [...profile.education],
  certifications: [...profile.certifications],
  inferredSeniority: profile.inferredSeniority,
  extractionConfidence: profile.extractionConfidence,
  extractedAt: profile.extractedAt,
});

const sortByUploadedAtDesc = (a: ResumeMetadata, b: ResumeMetadata): number => {
  const difference = Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt);
  if (difference !== 0) {
    return difference;
  }

  return b.resumeId.localeCompare(a.resumeId);
};

export const createInMemoryResumeRepository = (): ResumeRepository => {
  const resumesById = new Map<string, ResumeRecord>();
  const resumeIdsByUserId = new Map<string, string[]>();
  const structuredProfilesByResumeId = new Map<string, ResumeStructuredProfile>();

  return {
    async insertResume(resume) {
      const stored = cloneResumeRecord(resume);
      resumesById.set(stored.resumeId, stored);

      const userResumeIds = resumeIdsByUserId.get(stored.userId) ?? [];
      userResumeIds.push(stored.resumeId);
      resumeIdsByUserId.set(stored.userId, userResumeIds);

      return cloneResumeMetadata(stored);
    },

    async listResumesByUserId(userId) {
      const resumeIds = resumeIdsByUserId.get(userId) ?? [];
      const resumes = resumeIds
        .map((resumeId) => resumesById.get(resumeId))
        .filter((resume): resume is ResumeRecord => resume !== undefined)
        .map((resume) => cloneResumeMetadata(resume));

      resumes.sort(sortByUploadedAtDesc);
      return resumes;
    },

    async findResumeById(userId, resumeId) {
      const resume = resumesById.get(resumeId);
      if (!resume || resume.userId !== userId) {
        return null;
      }

      return cloneResumeMetadata(resume);
    },

    async upsertStructuredProfile(profile) {
      const cloned = cloneStructuredProfile(profile);
      structuredProfilesByResumeId.set(cloned.resumeId, cloned);
      return cloneStructuredProfile(cloned);
    },

    async findStructuredProfileByResumeId(resumeId) {
      const profile = structuredProfilesByResumeId.get(resumeId);
      return profile ? cloneStructuredProfile(profile) : null;
    },
  };
};