import { z } from 'zod';

import { userIdSchema } from '../auth/v1.js';
import { canonicalJobIdSchema } from '../jobs/v1.js';

export const trackerContractVersion = 'v1' as const;

const trimmedText = (max: number): z.ZodString =>
  z.string().trim().min(1).max(max);

const nullableTrimmedText = (max: number) => trimmedText(max).nullable();

export const trackerStateSchema = z.enum([
  'discovered',
  'shortlisted',
  'reviewing',
  'ready_to_apply',
  'applied',
  'interview',
  'offer',
  'rejected',
  'archived',
]);

export const trackerTransitionRequestSchema = z
  .object({
    targetState: trackerStateSchema,
    note: nullableTrimmedText(500).optional(),
  })
  .strict();

export const trackerDiscoveryActionSchema = z.enum([
  'save',
  'shortlist',
  'hide',
]);

export const trackerDiscoveryActionRequestSchema = z
  .object({
    note: nullableTrimmedText(500).optional(),
  })
  .strict();

export const trackedJobStateSchema = z
  .object({
    userId: userIdSchema,
    canonicalJobId: canonicalJobIdSchema,
    state: trackerStateSchema,
    lastTransitionNote: nullableTrimmedText(500),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const trackerTransitionEventSchema = z
  .object({
    eventId: z.string().uuid(),
    userId: userIdSchema,
    canonicalJobId: canonicalJobIdSchema,
    fromState: trackerStateSchema.nullable(),
    toState: trackerStateSchema,
    note: nullableTrimmedText(500),
    transitionedAt: z.string().datetime(),
  })
  .strict();

export const trackerJobListResponseSchema = z
  .object({
    contractVersion: z.literal(trackerContractVersion),
    trackers: z.array(trackedJobStateSchema).max(500),
  })
  .strict();

export const trackerJobStateResponseSchema = z
  .object({
    contractVersion: z.literal(trackerContractVersion),
    tracker: trackedJobStateSchema,
  })
  .strict();

export const trackerTransitionResponseSchema = z
  .object({
    contractVersion: z.literal(trackerContractVersion),
    tracker: trackedJobStateSchema,
    event: trackerTransitionEventSchema.nullable(),
  })
  .strict();

export const trackerDiscoveryActionResponseSchema = z
  .object({
    contractVersion: z.literal(trackerContractVersion),
    action: trackerDiscoveryActionSchema,
    tracker: trackedJobStateSchema,
    event: trackerTransitionEventSchema.nullable(),
  })
  .strict();

export const trackerHistoryResponseSchema = z
  .object({
    contractVersion: z.literal(trackerContractVersion),
    canonicalJobId: canonicalJobIdSchema,
    events: z.array(trackerTransitionEventSchema).max(500),
  })
  .strict();

export type TrackerState = z.infer<typeof trackerStateSchema>;
export type TrackerTransitionRequest = z.infer<typeof trackerTransitionRequestSchema>;
export type TrackerDiscoveryAction = z.infer<typeof trackerDiscoveryActionSchema>;
export type TrackerDiscoveryActionRequest = z.infer<
  typeof trackerDiscoveryActionRequestSchema
>;
export type TrackedJobState = z.infer<typeof trackedJobStateSchema>;
export type TrackerTransitionEvent = z.infer<typeof trackerTransitionEventSchema>;
export type TrackerJobListResponse = z.infer<typeof trackerJobListResponseSchema>;
export type TrackerJobStateResponse = z.infer<typeof trackerJobStateResponseSchema>;
export type TrackerTransitionResponse = z.infer<typeof trackerTransitionResponseSchema>;
export type TrackerDiscoveryActionResponse = z.infer<
  typeof trackerDiscoveryActionResponseSchema
>;
export type TrackerHistoryResponse = z.infer<typeof trackerHistoryResponseSchema>;
