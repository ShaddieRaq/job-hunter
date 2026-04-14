import { randomUUID } from 'node:crypto';

import type {
  CanonicalJobDetail,
  CanonicalJobId,
  ReminderId,
  ReminderStatus,
  ReminderTask,
  ReminderTaskType,
  TrackerTransitionEvent,
} from '@job-hunter/shared';

import { HttpError } from '../../http/http-errors.js';
import { createInMemoryReminderRepository } from './in-memory-repository.js';
import type { ReminderRepository } from './repository.js';

const defaultListLimit = Number.MAX_SAFE_INTEGER;

const normalizeLimit = (limit: number | undefined): number => {
  if (limit === undefined) {
    return defaultListLimit;
  }

  return Math.max(1, limit);
};

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

const addDays = (sourceDate: Date, days: number): Date => {
  const result = new Date(sourceDate);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

const autoReminderTemplate = (
  toState: TrackerTransitionEvent['toState'],
):
  | {
      taskType: ReminderTaskType;
      title: string;
      daysUntilDue: number;
    }
  | null => {
  if (toState === 'applied') {
    return {
      taskType: 'application_follow_up',
      title: 'Follow up on submitted application',
      daysUntilDue: 7,
    };
  }

  if (toState === 'interview') {
    return {
      taskType: 'interview_prep',
      title: 'Prepare for interview loop',
      daysUntilDue: 2,
    };
  }

  return null;
};

export interface CanonicalJobLookup {
  getCanonicalJob(canonicalJobId: CanonicalJobId): Promise<CanonicalJobDetail | null>;
}

export interface CreateReminderInput {
  canonicalJobId: CanonicalJobId;
  taskType: ReminderTaskType;
  title: string;
  dueAt: string;
  note?: string | null;
}

export interface CompleteReminderInput {
  note?: string | null;
}

export interface ReminderTransitionObserver {
  onTrackerTransition(event: TrackerTransitionEvent): Promise<void>;
}

export interface ReminderService extends ReminderTransitionObserver {
  createReminder(userId: string, input: CreateReminderInput): Promise<ReminderTask>;
  listReminders(options: {
    userId: string;
    status?: ReminderStatus;
    canonicalJobId?: CanonicalJobId;
    limit?: number;
  }): Promise<ReminderTask[]>;
  getReminder(userId: string, reminderId: ReminderId): Promise<ReminderTask | null>;
  completeReminder(
    userId: string,
    reminderId: ReminderId,
    input: CompleteReminderInput,
  ): Promise<ReminderTask>;
}

export interface CreateReminderServiceOptions {
  canonicalJobLookup: CanonicalJobLookup;
  repository?: ReminderRepository;
  now?: () => Date;
}

export const createReminderService = ({
  canonicalJobLookup,
  repository = createInMemoryReminderRepository(),
  now = () => new Date(),
}: CreateReminderServiceOptions): ReminderService => ({
  async createReminder(userId, input) {
    const canonical = await canonicalJobLookup.getCanonicalJob(input.canonicalJobId);
    if (!canonical) {
      throw new HttpError(404, 'canonical_job_not_found', {
        canonicalJobId: input.canonicalJobId,
      });
    }

    const nowIso = now().toISOString();
    const reminder: ReminderTask = {
      reminderId: randomUUID(),
      userId,
      canonicalJobId: input.canonicalJobId,
      taskType: input.taskType,
      title: input.title.trim().slice(0, 240),
      note: normalizeNote(input.note),
      dueAt: input.dueAt,
      status: 'pending',
      linkedTrackerEventId: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
    };

    return repository.createReminder(reminder);
  },

  async listReminders({ userId, status, canonicalJobId, limit }) {
    const resolvedLimit = normalizeLimit(limit);

    return repository.listReminders({
      userId,
      status,
      canonicalJobId,
      limit: resolvedLimit,
    });
  },

  async getReminder(userId, reminderId) {
    return repository.findReminderById(userId, reminderId);
  },

  async completeReminder(userId, reminderId, input) {
    const existing = await repository.findReminderById(userId, reminderId);
    if (!existing) {
      throw new HttpError(404, 'reminder_not_found', {
        reminderId,
      });
    }

    if (existing.status === 'completed') {
      return existing;
    }

    const nowIso = now().toISOString();
    const nextReminder: ReminderTask = {
      ...existing,
      status: 'completed',
      note: normalizeNote(input.note) ?? existing.note,
      updatedAt: nowIso,
      completedAt: nowIso,
    };

    return repository.updateReminder(nextReminder);
  },

  async onTrackerTransition(event) {
    const template = autoReminderTemplate(event.toState);
    if (!template) {
      return;
    }

    const existing = await repository.findReminderByTrackerEvent(
      event.userId,
      event.eventId,
    );
    if (existing) {
      return;
    }

    const dueBase = Number.isNaN(Date.parse(event.transitionedAt))
      ? now()
      : new Date(event.transitionedAt);

    const dueAt = addDays(dueBase, template.daysUntilDue).toISOString();
    const nowIso = now().toISOString();

    const reminder: ReminderTask = {
      reminderId: randomUUID(),
      userId: event.userId,
      canonicalJobId: event.canonicalJobId,
      taskType: template.taskType,
      title: template.title,
      note: `Auto-created from tracker transition to ${event.toState}.`,
      dueAt,
      status: 'pending',
      linkedTrackerEventId: event.eventId,
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
    };

    await repository.createReminder(reminder);
  },
});
