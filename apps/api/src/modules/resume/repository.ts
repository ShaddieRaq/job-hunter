import type { ResumeMetadata, ResumeStructuredProfile } from '@job-hunter/shared';

export interface ResumeRecord extends ResumeMetadata {
  parsedText: string | null;
}

export interface ResumeRepository {
  insertResume(resume: ResumeRecord): Promise<ResumeMetadata>;
  listResumesByUserId(userId: string): Promise<ResumeMetadata[]>;
  findResumeById(userId: string, resumeId: string): Promise<ResumeMetadata | null>;

  upsertStructuredProfile(
    profile: ResumeStructuredProfile,
  ): Promise<ResumeStructuredProfile>;
  findStructuredProfileByResumeId(
    resumeId: string,
  ): Promise<ResumeStructuredProfile | null>;
}