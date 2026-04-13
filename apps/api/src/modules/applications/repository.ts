import type {
  ApplicationId,
  ApplicationRecord,
  ApplicationStatus,
  CanonicalJobId,
} from '@job-hunter/shared';

export interface ApplicationRepository {
  createApplication(application: ApplicationRecord): Promise<ApplicationRecord>;
  updateApplication(application: ApplicationRecord): Promise<ApplicationRecord>;
  findApplicationById(
    userId: string,
    applicationId: ApplicationId,
  ): Promise<ApplicationRecord | null>;
  findApplicationByCanonicalJob(
    userId: string,
    canonicalJobId: CanonicalJobId,
  ): Promise<ApplicationRecord | null>;
  listApplications(options: {
    userId: string;
    status?: ApplicationStatus;
    canonicalJobId?: CanonicalJobId;
    limit: number;
  }): Promise<ApplicationRecord[]>;
}
