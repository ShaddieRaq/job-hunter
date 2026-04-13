import type {
  CanonicalJobId,
  TrackerTransitionEvent,
  TrackedJobState,
} from '@job-hunter/shared';

import type { TrackerRepository } from './repository.js';

const trackerKey = (userId: string, canonicalJobId: CanonicalJobId): string =>
  `${userId}:${canonicalJobId}`;

const cloneTrackedJobState = (tracker: TrackedJobState): TrackedJobState => ({
  ...tracker,
});

const cloneTransitionEvent = (
  event: TrackerTransitionEvent,
): TrackerTransitionEvent => ({
  ...event,
});

export const createInMemoryTrackerRepository = (): TrackerRepository => {
  const trackersByKey = new Map<string, TrackedJobState>();
  const transitionsByKey = new Map<string, TrackerTransitionEvent[]>();

  return {
    async upsertTrackedJob(tracker) {
      const key = trackerKey(tracker.userId, tracker.canonicalJobId);
      trackersByKey.set(key, cloneTrackedJobState(tracker));
      return cloneTrackedJobState(tracker);
    },

    async findTrackedJob(userId, canonicalJobId) {
      const key = trackerKey(userId, canonicalJobId);
      const tracker = trackersByKey.get(key);
      return tracker ? cloneTrackedJobState(tracker) : null;
    },

    async listTrackedJobs({ userId, state, limit }) {
      const trackers = [...trackersByKey.values()]
        .filter((tracker) => tracker.userId === userId)
        .filter((tracker) => (state ? tracker.state === state : true))
        .sort((left, right) => {
          if (left.updatedAt === right.updatedAt) {
            return left.canonicalJobId.localeCompare(right.canonicalJobId);
          }

          return right.updatedAt.localeCompare(left.updatedAt);
        })
        .slice(0, limit)
        .map(cloneTrackedJobState);

      return trackers;
    },

    async insertTransitionEvent(event) {
      const key = trackerKey(event.userId, event.canonicalJobId);
      const events = transitionsByKey.get(key) ?? [];
      events.push(cloneTransitionEvent(event));
      transitionsByKey.set(key, events);
    },

    async listTransitionEvents({ userId, canonicalJobId, limit }) {
      const key = trackerKey(userId, canonicalJobId);
      const events = [...(transitionsByKey.get(key) ?? [])]
        .sort((left, right) => {
          if (left.transitionedAt === right.transitionedAt) {
            return right.eventId.localeCompare(left.eventId);
          }

          return right.transitionedAt.localeCompare(left.transitionedAt);
        })
        .slice(0, limit)
        .map(cloneTransitionEvent);

      return events;
    },
  };
};
