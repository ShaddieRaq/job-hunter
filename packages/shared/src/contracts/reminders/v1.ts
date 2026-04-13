import { z } from 'zod';

import { userIdSchema } from '../auth/v1.js';
import { canonicalJobIdSchema } from '../jobs/v1.js';

export const remindersContractVersion = 'v1' as const;

const trimmedText = (max: number): z.ZodString =>
  z.string().trim().min(1).max(max);

const nullableTrimmedText = (max: number) => trimmedText(max).nullable();

export const reminderIdSchema = z.string().uuid();

export const reminderTaskTypeSchema = z.enum([
  'application_follow_up',
  'interview_prep',
  'custom',
]);

export const reminderStatusSchema = z.enum(['pending', 'completed']);

export const reminderTaskSchema = z
  .object({
    reminderId: reminderIdSchema,
    userId: userIdSchema,
    canonicalJobId: canonicalJobIdSchema,
    taskType: reminderTaskTypeSchema,
    title: trimmedText(240),
    note: nullableTrimmedText(500),
    dueAt: z.string().datetime(),
    status: reminderStatusSchema,
    linkedTrackerEventId: z.string().uuid().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
  })
  .strict();

export const reminderCreateRequestSchema = z
  .object({
    canonicalJobId: canonicalJobIdSchema,
    taskType: reminderTaskTypeSchema,
    title: trimmedText(240),
    note: nullableTrimmedText(500).optional(),
    dueAt: z.string().datetime(),
  })
  .strict();

export const reminderCompleteRequestSchema = z
  .object({
    note: nullableTrimmedText(500).optional(),
  })
  .strict();

export const reminderListResponseSchema = z
  .object({
    contractVersion: z.literal(remindersContractVersion),
    reminders: z.array(reminderTaskSchema).max(500),
  })
  .strict();

export const reminderResponseSchema = z
  .object({
    contractVersion: z.literal(remindersContractVersion),
    reminder: reminderTaskSchema,
  })
  .strict();

export type ReminderId = z.infer<typeof reminderIdSchema>;
export type ReminderTaskType = z.infer<typeof reminderTaskTypeSchema>;
export type ReminderStatus = z.infer<typeof reminderStatusSchema>;
export type ReminderTask = z.infer<typeof reminderTaskSchema>;
export type ReminderCreateRequest = z.infer<typeof reminderCreateRequestSchema>;
export type ReminderCompleteRequest = z.infer<typeof reminderCompleteRequestSchema>;
export type ReminderListResponse = z.infer<typeof reminderListResponseSchema>;
export type ReminderResponse = z.infer<typeof reminderResponseSchema>;
