import type {
  SourceConnector,
  SourceJobSummary,
  SourceName,
} from '@job-hunter/shared';

import type {
  ConnectorRepository,
  SourceJobRecord,
  UpsertSourceJobInput,
  UpsertSourceJobResult,
} from './repository.js';

const buildJobKey = (sourceName: SourceName, sourceJobId: string): string =>
  `${sourceName}:${sourceJobId}`;

const cloneConnectorState = (state: SourceConnector): SourceConnector => ({
  ...state,
});

const cloneSourceJobSummary = (record: SourceJobRecord): SourceJobSummary => ({
  sourceName: record.sourceName,
  sourceJobId: record.sourceJobId,
  sourceCompanyId: record.sourceCompanyId,
  sourceStatus: record.sourceStatus,
  title: record.title,
  companyName: record.companyName,
  fetchUrl: record.fetchUrl,
  applicationUrl: record.applicationUrl,
  locationText: record.locationText,
  remoteType: record.remoteType,
  employmentType: record.employmentType,
  postedAt: record.postedAt,
  firstSeenAt: record.firstSeenAt,
  lastSeenAt: record.lastSeenAt,
  fetchedAt: record.fetchedAt,
  checksumSha256: record.checksumSha256,
  normalizedSkills: [...record.normalizedSkills],
  requiredSkills: [...record.requiredSkills],
  preferredSkills: [...record.preferredSkills],
  salaryMin: record.salaryMin,
  salaryMax: record.salaryMax,
  salaryCurrency: record.salaryCurrency,
  salaryPeriod: record.salaryPeriod,
});

const cloneSourceJobRecord = (record: SourceJobRecord): SourceJobRecord => ({
  ...cloneSourceJobSummary(record),
  descriptionText: record.descriptionText,
  rawPayload: structuredClone(record.rawPayload),
});

const toSourceJobRecord = (
  input: UpsertSourceJobInput,
  firstSeenAt: string,
): SourceJobRecord => ({
  sourceName: input.sourceName,
  sourceJobId: input.job.sourceJobId,
  sourceCompanyId: input.job.sourceCompanyId,
  sourceStatus: input.job.sourceStatus,
  title: input.job.title,
  companyName: input.job.companyName,
  fetchUrl: input.job.fetchUrl,
  applicationUrl: input.job.applicationUrl,
  locationText: input.job.locationText,
  remoteType: input.job.remoteType,
  employmentType: input.job.employmentType,
  postedAt: input.job.postedAt,
  firstSeenAt,
  lastSeenAt: input.observedAt,
  fetchedAt: input.fetchedAt,
  checksumSha256: input.checksumSha256,
  normalizedSkills: [...input.job.normalizedSkills],
  requiredSkills: [...input.job.requiredSkills],
  preferredSkills: [...input.job.preferredSkills],
  salaryMin: input.job.salaryMin,
  salaryMax: input.job.salaryMax,
  salaryCurrency: input.job.salaryCurrency,
  salaryPeriod: input.job.salaryPeriod,
  descriptionText: input.job.descriptionText,
  rawPayload: structuredClone(input.job.rawPayload),
});

export const createInMemoryConnectorRepository = (): ConnectorRepository => {
  const connectorStateStore = new Map<SourceName, SourceConnector>();
  const sourceJobStore = new Map<string, SourceJobRecord>();

  const upsertSourceJob = async (
    input: UpsertSourceJobInput,
  ): Promise<UpsertSourceJobResult> => {
    const key = buildJobKey(input.sourceName, input.job.sourceJobId);
    const existing = sourceJobStore.get(key);

    if (!existing) {
      const inserted = toSourceJobRecord(input, input.observedAt);
      sourceJobStore.set(key, inserted);
      return 'inserted';
    }

    const nextRecord = toSourceJobRecord(input, existing.firstSeenAt);
    sourceJobStore.set(key, nextRecord);

    if (existing.checksumSha256 === input.checksumSha256) {
      return 'unchanged';
    }

    return 'updated';
  };

  return {
    async listConnectorStates() {
      return [...connectorStateStore.values()]
        .map(cloneConnectorState)
        .sort((left, right) => left.sourceName.localeCompare(right.sourceName));
    },

    async upsertConnectorState(state) {
      connectorStateStore.set(state.sourceName, cloneConnectorState(state));
    },

    upsertSourceJob,

    async listSourceJobs({ sourceName, limit }) {
      const sortedJobs = [...sourceJobStore.values()]
        .filter((record) => !sourceName || record.sourceName === sourceName)
        .sort((left, right) => {
          if (left.lastSeenAt === right.lastSeenAt) {
            if (left.sourceName === right.sourceName) {
              return left.sourceJobId.localeCompare(right.sourceJobId);
            }

            return left.sourceName.localeCompare(right.sourceName);
          }

          return right.lastSeenAt.localeCompare(left.lastSeenAt);
        });

      const jobs = (limit === undefined ? sortedJobs : sortedJobs.slice(0, limit)).map(
        cloneSourceJobSummary,
      );

      return jobs;
    },

    async findSourceJob(sourceName, sourceJobId) {
      const record = sourceJobStore.get(buildJobKey(sourceName, sourceJobId));
      return record ? cloneSourceJobRecord(record) : null;
    },
  };
};
