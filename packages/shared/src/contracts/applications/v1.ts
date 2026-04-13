import { z } from 'zod';

import { userIdSchema } from '../auth/v1.js';
import { canonicalJobIdSchema } from '../jobs/v1.js';
import { resumeIdSchema } from '../resume/v1.js';

export const applicationsContractVersion = 'v1' as const;

const trimmedText = (max: number): z.ZodString =>
  z.string().trim().min(1).max(max);

const nullableTrimmedText = (max: number) => trimmedText(max).nullable();

export const applicationIdSchema = z.string().uuid();

export const applicationStatusSchema = z.enum([
  'ready_to_apply',
  'applied',
  'interview',
  'offer',
  'rejected',
  'archived',
]);

export const applicationRecordSchema = z
  .object({
    applicationId: applicationIdSchema,
    userId: userIdSchema,
    canonicalJobId: canonicalJobIdSchema,
    status: applicationStatusSchema,
    appliedAt: z.string().datetime().nullable(),
    applicationUrl: nullableTrimmedText(2048),
    resumeIdUsed: resumeIdSchema.nullable(),
    coverLetterDocUri: nullableTrimmedText(2048),
    notes: nullableTrimmedText(2000),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const applicationCreateRequestSchema = z
  .object({
    canonicalJobId: canonicalJobIdSchema,
    status: applicationStatusSchema.optional(),
    appliedAt: z.string().datetime().nullable().optional(),
    applicationUrl: nullableTrimmedText(2048).optional(),
    resumeIdUsed: resumeIdSchema.nullable().optional(),
    coverLetterDocUri: nullableTrimmedText(2048).optional(),
    notes: nullableTrimmedText(2000).optional(),
  })
  .strict();

export const applicationUpdateRequestSchema = z
  .object({
    status: applicationStatusSchema.optional(),
    appliedAt: z.string().datetime().nullable().optional(),
    applicationUrl: nullableTrimmedText(2048).optional(),
    resumeIdUsed: resumeIdSchema.nullable().optional(),
    coverLetterDocUri: nullableTrimmedText(2048).optional(),
    notes: nullableTrimmedText(2000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const applicationListResponseSchema = z
  .object({
    contractVersion: z.literal(applicationsContractVersion),
    applications: z.array(applicationRecordSchema).max(500),
  })
  .strict();

export const applicationResponseSchema = z
  .object({
    contractVersion: z.literal(applicationsContractVersion),
    application: applicationRecordSchema,
  })
  .strict();

export type ApplicationId = z.infer<typeof applicationIdSchema>;
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;
export type ApplicationRecord = z.infer<typeof applicationRecordSchema>;
export type ApplicationCreateRequest = z.infer<typeof applicationCreateRequestSchema>;
export type ApplicationUpdateRequest = z.infer<typeof applicationUpdateRequestSchema>;
export type ApplicationListResponse = z.infer<typeof applicationListResponseSchema>;
export type ApplicationResponse = z.infer<typeof applicationResponseSchema>;
