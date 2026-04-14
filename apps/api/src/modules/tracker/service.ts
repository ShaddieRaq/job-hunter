import { randomUUID } from 'node:crypto';

import type {
  CanonicalJobDetail,
  TrackerDiscoveryAction,
  CanonicalJobId,
  TrackerState,
  TrackerTransitionEvent,
  TrackedJobState,
} from '@job-hunter/shared';

import { HttpError } from '../../http/http-errors.js';
import { createInMemoryTrackerRepository } from './in-memory-repository.js';
import type { TrackerRepository } from './repository.js';

const defaultListLimit = Number.MAX_SAFE_INTEGER;
const defaultHistoryLimit = Number.MAX_SAFE_INTEGER;

const normalizeNote = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }

  return normalized.slice(0, 500);
};

const normalizeLimit = (
  limit: number | undefined,
  fallback: number,
): number => {
  if (limit === undefined) {
    return fallback;
  }

  return Math.max(1, limit);
};

const trackerTransitionRules: Record<TrackerState, Set<TrackerState>> = {
  discovered: new Set(['shortlisted', 'reviewing', 'archived']),
  shortlisted: new Set(['discovered', 'reviewing', 'ready_to_apply', 'archived']),
  reviewing: new Set(['discovered', 'shortlisted', 'ready_to_apply', 'archived']),
  ready_to_apply: new Set(['shortlisted', 'reviewing', 'applied', 'archived']),
  applied: new Set(['interview', 'offer', 'rejected', 'archived']),
  interview: new Set(['offer', 'rejected', 'archived']),
  offer: new Set(['archived']),
  rejected: new Set(['archived']),
  archived: new Set(['discovered']),
};

const trackerDiscoveryActionTargets: Record<TrackerDiscoveryAction, TrackerState> = {
  save: 'reviewing',
  shortlist: 'shortlisted',
  hide: 'archived',
};

const trackerDiscoveryActionDefaultNotes: Record<TrackerDiscoveryAction, string> = {
  save: 'Saved from discovery feed',
  shortlist: 'Shortlisted from discovery feed',
  hide: 'Hidden from discovery feed',
};

const canTransition = (fromState: TrackerState, toState: TrackerState): boolean =>
  trackerTransitionRules[fromState].has(toState);

export interface CanonicalJobLookup {
  getCanonicalJob(canonicalJobId: CanonicalJobId): Promise<CanonicalJobDetail | null>;
}

export interface TransitionTrackerStateInput {
  canonicalJobId: CanonicalJobId;
  targetState: TrackerState;
  note?: string | null;
}

export interface TransitionTrackerStateResult {
  tracker: TrackedJobState;
  event: TrackerTransitionEvent | null;
}

export interface ApplyTrackerDiscoveryActionInput {
  canonicalJobId: CanonicalJobId;
  action: TrackerDiscoveryAction;
  note?: string | null;
}

export interface ApplyTrackerDiscoveryActionResult extends TransitionTrackerStateResult {
  action: TrackerDiscoveryAction;
}

export interface TrackerTransitionObserver {
  onTrackerTransition(event: TrackerTransitionEvent): Promise<void>;
}

export interface TrackerService {
  listTrackedJobs(options: {
    userId: string;
    state?: TrackerState;
    limit?: number;
  }): Promise<TrackedJobState[]>;
  getTrackedJob(
    userId: string,
    canonicalJobId: CanonicalJobId,
  ): Promise<TrackedJobState | null>;
  transitionTrackedJobState(
    userId: string,
    input: TransitionTrackerStateInput,
  ): Promise<TransitionTrackerStateResult>;
  applyDiscoveryAction(
    userId: string,
    input: ApplyTrackerDiscoveryActionInput,
  ): Promise<ApplyTrackerDiscoveryActionResult>;
  listTransitionEvents(options: {
    userId: string;
    canonicalJobId: CanonicalJobId;
    limit?: number;
  }): Promise<TrackerTransitionEvent[]>;
}

export interface CreateTrackerServiceOptions {
  canonicalJobLookup: CanonicalJobLookup;
  repository?: TrackerRepository;
  transitionObservers?: TrackerTransitionObserver[];
  now?: () => Date;
}

export const createTrackerService = ({
  canonicalJobLookup,
  repository = createInMemoryTrackerRepository(),
  transitionObservers = [],
  now = () => new Date(),
}: CreateTrackerServiceOptions): TrackerService => {
  const transitionTrackedJobState = async (
    userId: string,
    input: TransitionTrackerStateInput,
  ): Promise<TransitionTrackerStateResult> => {
    const canonical = await canonicalJobLookup.getCanonicalJob(input.canonicalJobId);
    if (!canonical) {
      throw new HttpError(404, 'canonical_job_not_found', {
        canonicalJobId: input.canonicalJobId,
      });
    }

    const existing = await repository.findTrackedJob(userId, input.canonicalJobId);
    const targetState = input.targetState;
    const note = normalizeNote(input.note);

    if (
      existing &&
      existing.state === targetState &&
      existing.lastTransitionNote === note
    ) {
      return {
        tracker: existing,
        event: null,
      };
    }

    if (existing && !canTransition(existing.state, targetState)) {
      throw new HttpError(400, 'invalid_tracker_transition', {
        fromState: existing.state,
        toState: targetState,
      });
    }

    const nowIso = now().toISOString();
    const tracker: TrackedJobState = {
      userId,
      canonicalJobId: input.canonicalJobId,
      state: targetState,
      lastTransitionNote: note,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };

    const savedTracker = await repository.upsertTrackedJob(tracker);

    const event: TrackerTransitionEvent = {
      eventId: randomUUID(),
      userId,
      canonicalJobId: input.canonicalJobId,
      fromState: existing?.state ?? null,
      toState: targetState,
      note,
      transitionedAt: nowIso,
    };

    await repository.insertTransitionEvent(event);

    for (const observer of transitionObservers) {
      await observer.onTrackerTransition(event);
    }

    return {
      tracker: savedTracker,
      event,
    };
  };

  const applyDiscoveryAction = async (
    userId: string,
    input: ApplyTrackerDiscoveryActionInput,
  ): Promise<ApplyTrackerDiscoveryActionResult> => {
    const mappedState = trackerDiscoveryActionTargets[input.action];
    const result = await transitionTrackedJobState(userId, {
      canonicalJobId: input.canonicalJobId,
      targetState: mappedState,
      note: input.note ?? trackerDiscoveryActionDefaultNotes[input.action],
    });

    return {
      action: input.action,
      tracker: result.tracker,
      event: result.event,
    };
  };

  const listTrackedJobs = async ({
    userId,
    state,
    limit,
  }: {
    userId: string;
    state?: TrackerState;
    limit?: number;
  }): Promise<TrackedJobState[]> => {
    const resolvedLimit = normalizeLimit(limit, defaultListLimit);

    return repository.listTrackedJobs({
      userId,
      state,
      limit: resolvedLimit,
    });
  };

  const getTrackedJob = async (
    userId: string,
    canonicalJobId: CanonicalJobId,
  ): Promise<TrackedJobState | null> => repository.findTrackedJob(userId, canonicalJobId);

  const listTransitionEvents = async ({ userId, canonicalJobId, limit }: {
    userId: string;
    canonicalJobId: CanonicalJobId;
    limit?: number;
  }): Promise<TrackerTransitionEvent[]> => {
    const resolvedLimit = normalizeLimit(limit, defaultHistoryLimit);

    return repository.listTransitionEvents({
      userId,
      canonicalJobId,
      limit: resolvedLimit,
    });
  };

  return {
    listTrackedJobs,
    getTrackedJob,
    transitionTrackedJobState,
    applyDiscoveryAction,
    listTransitionEvents,
  };
};
