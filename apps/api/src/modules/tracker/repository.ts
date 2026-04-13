import type {
  CanonicalJobId,
  TrackerState,
  TrackerTransitionEvent,
  TrackedJobState,
} from '@job-hunter/shared';

export interface TrackerRepository {
  upsertTrackedJob(tracker: TrackedJobState): Promise<TrackedJobState>;
  findTrackedJob(
    userId: string,
    canonicalJobId: CanonicalJobId,
  ): Promise<TrackedJobState | null>;
  listTrackedJobs(options: {
    userId: string;
    state?: TrackerState;
    limit: number;
  }): Promise<TrackedJobState[]>;
  insertTransitionEvent(event: TrackerTransitionEvent): Promise<void>;
  listTransitionEvents(options: {
    userId: string;
    canonicalJobId: CanonicalJobId;
    limit: number;
  }): Promise<TrackerTransitionEvent[]>;
}
