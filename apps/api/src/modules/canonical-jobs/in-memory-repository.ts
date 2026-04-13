import type {
  CanonicalDedupeTraceEvent,
  CanonicalJobId,
  CanonicalJobSummary,
  CanonicalSourceMapping,
} from '@job-hunter/shared';

import type {
  CanonicalJobDraft,
  CanonicalJobRecord,
  CanonicalJobRepository,
  UpsertCanonicalJobResult,
} from './repository.js';

const cloneSummary = (job: CanonicalJobSummary): CanonicalJobSummary => ({
  ...job,
  sourceNames: [...job.sourceNames],
  topSkills: [...job.topSkills],
});

const cloneMappings = (
  sourceMappings: CanonicalSourceMapping[],
): CanonicalSourceMapping[] =>
  sourceMappings.map((mapping) => ({
    ...mapping,
    mappingReasonCodes: [...mapping.mappingReasonCodes],
  }));

const cloneDedupeTraceEvent = (
  event: CanonicalDedupeTraceEvent,
): CanonicalDedupeTraceEvent => ({
  ...event,
  mappingReasonCodes: [...event.mappingReasonCodes],
});

const cloneRecord = (record: CanonicalJobRecord): CanonicalJobRecord => ({
  job: cloneSummary(record.job),
  sourceMappings: cloneMappings(record.sourceMappings),
});

const canonicalJobDraftEquals = (
  left: CanonicalJobDraft,
  right: CanonicalJobDraft,
): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const canonicalMappingsEqual = (
  left: CanonicalSourceMapping[],
  right: CanonicalSourceMapping[],
): boolean => JSON.stringify(left) === JSON.stringify(right);

const toDraft = (job: CanonicalJobSummary): CanonicalJobDraft => ({
  canonicalJobId: job.canonicalJobId,
  canonicalCompanyName: job.canonicalCompanyName,
  canonicalTitle: job.canonicalTitle,
  normalizedLocation: job.normalizedLocation,
  remoteType: job.remoteType,
  employmentType: job.employmentType,
  salaryMin: job.salaryMin,
  salaryMax: job.salaryMax,
  salaryCurrency: job.salaryCurrency,
  salaryPeriod: job.salaryPeriod,
  sourceCount: job.sourceCount,
  sourceNames: [...job.sourceNames],
  jobStatus: job.jobStatus,
  topSkills: [...job.topSkills],
  firstSeenAt: job.firstSeenAt,
  lastSeenAt: job.lastSeenAt,
});

const toSummary = (
  draft: CanonicalJobDraft,
  timestamps: {
    createdAt: string;
    updatedAt: string;
  },
): CanonicalJobSummary => ({
  ...draft,
  sourceNames: [...draft.sourceNames],
  topSkills: [...draft.topSkills],
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
});

export const createInMemoryCanonicalJobRepository = (): CanonicalJobRepository => {
  const recordStore = new Map<CanonicalJobId, CanonicalJobRecord>();
  const dedupeEventStore = new Map<CanonicalJobId, Map<string, CanonicalDedupeTraceEvent>>();

  return {
    async upsertCanonicalJob({ job, sourceMappings, nowIso }): Promise<UpsertCanonicalJobResult> {
      const existing = recordStore.get(job.canonicalJobId);
      if (!existing) {
        const createdSummary = toSummary(job, {
          createdAt: nowIso,
          updatedAt: nowIso,
        });

        recordStore.set(job.canonicalJobId, {
          job: cloneSummary(createdSummary),
          sourceMappings: cloneMappings(sourceMappings),
        });

        return {
          status: 'created',
          job: cloneSummary(createdSummary),
        };
      }

      const existingDraft = toDraft(existing.job);
      if (
        canonicalJobDraftEquals(existingDraft, job) &&
        canonicalMappingsEqual(existing.sourceMappings, sourceMappings)
      ) {
        return {
          status: 'unchanged',
          job: cloneSummary(existing.job),
        };
      }

      const updatedSummary = toSummary(job, {
        createdAt: existing.job.createdAt,
        updatedAt: nowIso,
      });

      recordStore.set(job.canonicalJobId, {
        job: cloneSummary(updatedSummary),
        sourceMappings: cloneMappings(sourceMappings),
      });

      return {
        status: 'updated',
        job: cloneSummary(updatedSummary),
      };
    },

    async listCanonicalJobs(limit) {
      return [...recordStore.values()]
        .map((record) => cloneSummary(record.job))
        .sort((left, right) => {
          if (left.lastSeenAt === right.lastSeenAt) {
            return left.canonicalJobId.localeCompare(right.canonicalJobId);
          }

          return right.lastSeenAt.localeCompare(left.lastSeenAt);
        })
        .slice(0, limit);
    },

    async findCanonicalJobById(canonicalJobId) {
      const record = recordStore.get(canonicalJobId);
      return record ? cloneRecord(record) : null;
    },

    async upsertDedupeTraceEvents(events) {
      for (const event of events) {
        const existingForJob = dedupeEventStore.get(event.canonicalJobId);
        const eventMap = existingForJob ?? new Map<string, CanonicalDedupeTraceEvent>();

        eventMap.set(event.eventId, cloneDedupeTraceEvent(event));
        dedupeEventStore.set(event.canonicalJobId, eventMap);
      }
    },

    async listDedupeTraceEvents(canonicalJobId, limit) {
      const events = [...(dedupeEventStore.get(canonicalJobId)?.values() ?? [])]
        .sort((left, right) => {
          if (left.occurredAt === right.occurredAt) {
            return right.eventId.localeCompare(left.eventId);
          }

          return right.occurredAt.localeCompare(left.occurredAt);
        })
        .slice(0, limit)
        .map(cloneDedupeTraceEvent);

      return events;
    },
  };
};
