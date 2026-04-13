import { randomUUID } from 'node:crypto';

import type {
  MatchScoreArtifact,
  NotificationLog,
  NotificationStatus,
  ReminderTask,
  TrackerState,
} from '@job-hunter/shared';

import { createInMemoryNotificationRepository } from './in-memory-repository.js';
import type { NotificationRepository } from './repository.js';

const defaultListLimit = 50;
const maxListLimit = 500;
const dispatchLimit = 500;
const dispatchAllUsersLimit = 10_000;
const highFitMinimumOverallScore = 75;
const highFitEligibleTrackerStates = new Set<TrackerState>([
  'discovered',
  'shortlisted',
  'reviewing',
  'ready_to_apply',
]);

const normalizeLimit = (limit: number | undefined): number => {
  if (limit === undefined) {
    return defaultListLimit;
  }

  return Math.max(1, Math.min(maxListLimit, limit));
};

const buildReminderDueMessage = (reminder: ReminderTask): string => {
  const baseMessage = `Reminder due: ${reminder.title}`;
  return baseMessage.slice(0, 500);
};

const buildHighFitAlertMessage = (
  candidate: HighFitNotificationCandidate,
  artifact: MatchScoreArtifact,
): string => {
  const scoreLabel = artifact.scoreBreakdown.overallScore.toFixed(1);
  const baseMessage = `High-fit alert: ${candidate.canonicalTitle} at ${candidate.canonicalCompanyName} scored ${scoreLabel}.`;
  return baseMessage.slice(0, 500);
};

const parseIsoToEpochMs = (value: string): number | null => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return parsed;
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'unknown_error';
};

export interface ReminderReader {
  listReminders(options: {
    userId: string;
    status?: 'pending' | 'completed';
    limit?: number;
  }): Promise<ReminderTask[]>;
}

export interface HighFitNotificationCandidate {
  canonicalJobId: string;
  canonicalCompanyName: string;
  canonicalTitle: string;
  latestScoreArtifact: MatchScoreArtifact | null;
  trackerState: TrackerState | null;
}

export interface HighFitCandidateReader {
  listCandidates(options: {
    userId: string;
    limit?: number;
  }): Promise<HighFitNotificationCandidate[]>;
}

export interface UserIdReader {
  listUserIds(limit?: number): Promise<string[]>;
}

export interface DispatchReminderNotificationsInput {
  referenceTime?: string;
}

export interface DispatchReminderNotificationsResult {
  queuedCount: number;
  sentCount: number;
  skippedCount: number;
}

export interface DispatchAllHighFitNotificationsResult {
  attemptedUsers: number;
  dispatchedUsers: number;
  failedUsers: number;
  queuedCount: number;
  sentCount: number;
  skippedCount: number;
  errors: string[];
}

export interface NotificationService {
  listNotifications(options: {
    userId: string;
    status?: NotificationStatus;
    limit?: number;
  }): Promise<NotificationLog[]>;
  dispatchDueReminderNotifications(
    userId: string,
    input?: DispatchReminderNotificationsInput,
  ): Promise<DispatchReminderNotificationsResult>;
  dispatchHighFitNotifications(
    userId: string,
    input?: DispatchReminderNotificationsInput,
  ): Promise<DispatchReminderNotificationsResult>;
  dispatchHighFitNotificationsForAllUsers(
    input?: DispatchReminderNotificationsInput,
  ): Promise<DispatchAllHighFitNotificationsResult>;
}

export interface CreateNotificationServiceOptions {
  reminderReader: ReminderReader;
  highFitCandidateReader?: HighFitCandidateReader;
  userIdReader?: UserIdReader;
  repository?: NotificationRepository;
  now?: () => Date;
}

const isHighFitArtifact = (artifact: MatchScoreArtifact): boolean =>
  artifact.recommendation === 'apply' &&
  artifact.scoreBreakdown.overallScore >= highFitMinimumOverallScore &&
  artifact.dealBreakers.length === 0;

const isHighFitTrackerStateEligible = (trackerState: TrackerState | null): boolean =>
  trackerState === null || highFitEligibleTrackerStates.has(trackerState);

export const createNotificationService = ({
  reminderReader,
  highFitCandidateReader,
  userIdReader,
  repository = createInMemoryNotificationRepository(),
  now = () => new Date(),
}: CreateNotificationServiceOptions): NotificationService => {
  const dispatchHighFitNotificationsForUser = async (
    userId: string,
    input?: DispatchReminderNotificationsInput,
  ): Promise<DispatchReminderNotificationsResult> => {
    if (!highFitCandidateReader) {
      return {
        queuedCount: 0,
        sentCount: 0,
        skippedCount: 0,
      };
    }

    const referenceTimeIso = input?.referenceTime ?? now().toISOString();
    const referenceTimeMs = parseIsoToEpochMs(referenceTimeIso);

    if (referenceTimeMs === null) {
      return {
        queuedCount: 0,
        sentCount: 0,
        skippedCount: 0,
      };
    }

    const candidates = await highFitCandidateReader.listCandidates({
      userId,
      limit: dispatchLimit,
    });

    let queuedCount = 0;
    let skippedCount = 0;

    for (const candidate of candidates) {
      const artifact = candidate.latestScoreArtifact;
      if (!artifact || !isHighFitArtifact(artifact)) {
        continue;
      }

      if (!isHighFitTrackerStateEligible(candidate.trackerState)) {
        continue;
      }

      const scoredAtMs = parseIsoToEpochMs(artifact.scoredAt);
      if (scoredAtMs === null || scoredAtMs > referenceTimeMs) {
        continue;
      }

      const existing = await repository.findHighFitNotification(
        userId,
        candidate.canonicalJobId,
        artifact.artifactVersion,
      );

      if (existing) {
        skippedCount += 1;
        continue;
      }

      const nowIso = now().toISOString();
      const notification: NotificationLog = {
        notificationId: randomUUID(),
        userId,
        reminderId: null,
        canonicalJobId: candidate.canonicalJobId,
        matchArtifactVersion: artifact.artifactVersion,
        notificationType: 'high_fit_alert',
        channel: 'in_app',
        status: 'queued',
        message: buildHighFitAlertMessage(candidate, artifact),
        scheduledFor: artifact.scoredAt,
        sentAt: null,
        failedAt: null,
        errorCode: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await repository.createNotification(notification);
      queuedCount += 1;
    }

    const queuedNotifications = await repository.listQueuedNotifications({
      userId,
      scheduledBefore: referenceTimeIso,
      limit: dispatchLimit,
      notificationType: 'high_fit_alert',
    });

    let sentCount = 0;

    for (const queuedNotification of queuedNotifications) {
      const nowIso = now().toISOString();
      await repository.updateNotification({
        ...queuedNotification,
        status: 'sent',
        sentAt: nowIso,
        updatedAt: nowIso,
      });
      sentCount += 1;
    }

    return {
      queuedCount,
      sentCount,
      skippedCount,
    };
  };

  return {
    async dispatchHighFitNotificationsForAllUsers(input) {
      if (!userIdReader || !highFitCandidateReader) {
        return {
          attemptedUsers: 0,
          dispatchedUsers: 0,
          failedUsers: 0,
          queuedCount: 0,
          sentCount: 0,
          skippedCount: 0,
          errors: [],
        };
      }

      const userIds = await userIdReader.listUserIds(dispatchAllUsersLimit);
      let dispatchedUsers = 0;
      let failedUsers = 0;
      let queuedCount = 0;
      let sentCount = 0;
      let skippedCount = 0;
      const errors: string[] = [];

      for (const userId of userIds) {
        try {
          const result = await dispatchHighFitNotificationsForUser(userId, input);
          queuedCount += result.queuedCount;
          sentCount += result.sentCount;
          skippedCount += result.skippedCount;
          dispatchedUsers += 1;
        } catch (error: unknown) {
          failedUsers += 1;
          if (errors.length < dispatchLimit) {
            const errorMessage = toErrorMessage(error);
            errors.push(`user:${userId}:${errorMessage}`.slice(0, 500));
          }
        }
      }

      return {
        attemptedUsers: userIds.length,
        dispatchedUsers,
        failedUsers,
        queuedCount,
        sentCount,
        skippedCount,
        errors,
      };
    },

    async listNotifications({ userId, status, limit }) {
      const resolvedLimit = normalizeLimit(limit);

      return repository.listNotifications({
        userId,
        status,
        limit: resolvedLimit,
      });
    },

    async dispatchDueReminderNotifications(userId, input) {
      const referenceTimeIso = input?.referenceTime ?? now().toISOString();
      const referenceTimeMs = parseIsoToEpochMs(referenceTimeIso);

      if (referenceTimeMs === null) {
        return {
          queuedCount: 0,
          sentCount: 0,
          skippedCount: 0,
        };
      }

      const reminders = await reminderReader.listReminders({
        userId,
        status: 'pending',
        limit: dispatchLimit,
      });

      let queuedCount = 0;
      let skippedCount = 0;

      for (const reminder of reminders) {
        const dueAtMs = parseIsoToEpochMs(reminder.dueAt);
        if (dueAtMs === null || dueAtMs > referenceTimeMs) {
          continue;
        }

        const existing = await repository.findReminderDueNotification(
          userId,
          reminder.reminderId,
        );

        if (existing) {
          skippedCount += 1;
          continue;
        }

        const nowIso = now().toISOString();
        const notification: NotificationLog = {
          notificationId: randomUUID(),
          userId,
          reminderId: reminder.reminderId,
          canonicalJobId: reminder.canonicalJobId,
          matchArtifactVersion: null,
          notificationType: 'reminder_due',
          channel: 'in_app',
          status: 'queued',
          message: buildReminderDueMessage(reminder),
          scheduledFor: reminder.dueAt,
          sentAt: null,
          failedAt: null,
          errorCode: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        await repository.createNotification(notification);
        queuedCount += 1;
      }

      const queuedNotifications = await repository.listQueuedNotifications({
        userId,
        scheduledBefore: referenceTimeIso,
        limit: dispatchLimit,
        notificationType: 'reminder_due',
      });

      let sentCount = 0;

      for (const queuedNotification of queuedNotifications) {
        const nowIso = now().toISOString();
        await repository.updateNotification({
          ...queuedNotification,
          status: 'sent',
          sentAt: nowIso,
          updatedAt: nowIso,
        });
        sentCount += 1;
      }

      return {
        queuedCount,
        sentCount,
        skippedCount,
      };
    },

    async dispatchHighFitNotifications(userId, input) {
      return dispatchHighFitNotificationsForUser(userId, input);
    },
  };
};
