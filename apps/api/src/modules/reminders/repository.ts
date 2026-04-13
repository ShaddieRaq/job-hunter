import type {
  CanonicalJobId,
  ReminderId,
  ReminderStatus,
  ReminderTask,
} from '@job-hunter/shared';

export interface ReminderRepository {
  createReminder(reminder: ReminderTask): Promise<ReminderTask>;
  updateReminder(reminder: ReminderTask): Promise<ReminderTask>;
  findReminderById(
    userId: string,
    reminderId: ReminderId,
  ): Promise<ReminderTask | null>;
  findReminderByTrackerEvent(
    userId: string,
    trackerEventId: string,
  ): Promise<ReminderTask | null>;
  listReminders(options: {
    userId: string;
    status?: ReminderStatus;
    canonicalJobId?: CanonicalJobId;
    limit: number;
  }): Promise<ReminderTask[]>;
}
