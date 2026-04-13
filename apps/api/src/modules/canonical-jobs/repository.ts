import type {
  CanonicalJobDetail,
  CanonicalJobId,
  CanonicalJobSummary,
  CanonicalSourceMapping,
} from '@job-hunter/shared';

export type CanonicalJobDraft = Omit<CanonicalJobSummary, 'createdAt' | 'updatedAt'>;

export interface CanonicalJobRecord extends CanonicalJobDetail {
  job: CanonicalJobSummary;
  sourceMappings: CanonicalSourceMapping[];
}

export type UpsertCanonicalJobResult =
  | {
      status: 'created';
      job: CanonicalJobSummary;
    }
  | {
      status: 'updated';
      job: CanonicalJobSummary;
    }
  | {
      status: 'unchanged';
      job: CanonicalJobSummary;
    };

export interface CanonicalJobRepository {
  upsertCanonicalJob(input: {
    job: CanonicalJobDraft;
    sourceMappings: CanonicalSourceMapping[];
    nowIso: string;
  }): Promise<UpsertCanonicalJobResult>;
  listCanonicalJobs(limit: number): Promise<CanonicalJobSummary[]>;
  findCanonicalJobById(canonicalJobId: CanonicalJobId): Promise<CanonicalJobRecord | null>;
}
