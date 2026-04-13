import type {
  ApplicationId,
  ApplicationRecord,
  CanonicalJobId,
} from '@job-hunter/shared';

import type { ApplicationRepository } from './repository.js';

const byCanonicalJobKey = (userId: string, canonicalJobId: CanonicalJobId): string =>
  `${userId}:${canonicalJobId}`;

const cloneApplication = (application: ApplicationRecord): ApplicationRecord => ({
  ...application,
});

export const createInMemoryApplicationRepository = (): ApplicationRepository => {
  const applicationsById = new Map<ApplicationId, ApplicationRecord>();
  const applicationIdByCanonicalJob = new Map<string, ApplicationId>();

  return {
    async createApplication(application) {
      applicationsById.set(application.applicationId, cloneApplication(application));
      applicationIdByCanonicalJob.set(
        byCanonicalJobKey(application.userId, application.canonicalJobId),
        application.applicationId,
      );

      return cloneApplication(application);
    },

    async updateApplication(application) {
      applicationsById.set(application.applicationId, cloneApplication(application));
      applicationIdByCanonicalJob.set(
        byCanonicalJobKey(application.userId, application.canonicalJobId),
        application.applicationId,
      );

      return cloneApplication(application);
    },

    async findApplicationById(userId, applicationId) {
      const application = applicationsById.get(applicationId);
      if (!application || application.userId !== userId) {
        return null;
      }

      return cloneApplication(application);
    },

    async findApplicationByCanonicalJob(userId, canonicalJobId) {
      const applicationId = applicationIdByCanonicalJob.get(
        byCanonicalJobKey(userId, canonicalJobId),
      );

      if (!applicationId) {
        return null;
      }

      const application = applicationsById.get(applicationId);
      if (!application || application.userId !== userId) {
        return null;
      }

      return cloneApplication(application);
    },

    async listApplications({ userId, status, canonicalJobId, limit }) {
      const applications = [...applicationsById.values()]
        .filter((application) => application.userId === userId)
        .filter((application) => (status ? application.status === status : true))
        .filter((application) =>
          canonicalJobId ? application.canonicalJobId === canonicalJobId : true,
        )
        .sort((left, right) => {
          if (left.updatedAt !== right.updatedAt) {
            return right.updatedAt.localeCompare(left.updatedAt);
          }

          return right.createdAt.localeCompare(left.createdAt);
        })
        .slice(0, limit)
        .map(cloneApplication);

      return applications;
    },
  };
};
