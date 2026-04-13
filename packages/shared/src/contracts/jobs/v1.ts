import { z } from 'zod';

import {
  sourceEmploymentTypeSchema,
  sourceJobStatusSchema,
  sourceNameSchema,
  sourceRemoteTypeSchema,
  sourceSalaryPeriodSchema,
} from '../connectors/v1.js';

export const jobsContractVersion = 'v1' as const;

const trimmedText = (max: number): z.ZodString =>
  z.string().trim().min(1).max(max);

const nullableTrimmedText = (max: number) => trimmedText(max).nullable();

export const canonicalJobIdSchema = z.string().uuid();

export const canonicalMappingReasonCodeSchema = z.enum([
  'exact_company_title',
  'strong_title_overlap',
  'same_remote_type',
  'same_location_token',
  'same_salary_band',
]);

export const canonicalSourceMappingSchema = z
  .object({
    sourceName: sourceNameSchema,
    sourceJobId: trimmedText(160),
    isPrimary: z.boolean(),
    mappingConfidence: z.number().min(0).max(1),
    mappingReasonCodes: z.array(canonicalMappingReasonCodeSchema).max(10),
  })
  .strict();

export const canonicalJobSummarySchema = z
  .object({
    canonicalJobId: canonicalJobIdSchema,
    canonicalCompanyName: trimmedText(200),
    canonicalTitle: trimmedText(240),
    normalizedLocation: nullableTrimmedText(200),
    remoteType: sourceRemoteTypeSchema,
    employmentType: sourceEmploymentTypeSchema,
    salaryMin: z.number().int().min(0).nullable(),
    salaryMax: z.number().int().min(0).nullable(),
    salaryCurrency: nullableTrimmedText(12),
    salaryPeriod: sourceSalaryPeriodSchema.nullable(),
    sourceCount: z.number().int().min(1).max(200),
    sourceNames: z.array(sourceNameSchema).min(1).max(20),
    jobStatus: sourceJobStatusSchema,
    topSkills: z.array(trimmedText(120)).max(20),
    firstSeenAt: z.string().datetime(),
    lastSeenAt: z.string().datetime(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const canonicalJobDetailSchema = z
  .object({
    job: canonicalJobSummarySchema,
    sourceMappings: z.array(canonicalSourceMappingSchema).min(1).max(200),
  })
  .strict();

export const canonicalRebuildRequestSchema = z
  .object({
    sourceName: sourceNameSchema.optional(),
    maxSourceJobs: z.number().int().min(1).max(2_000).optional(),
  })
  .strict();

export const canonicalRebuildResponseSchema = z
  .object({
    contractVersion: z.literal(jobsContractVersion),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    sourceJobsScanned: z.number().int().min(0).max(2_000_000),
    canonicalJobsCreated: z.number().int().min(0).max(2_000_000),
    canonicalJobsUpdated: z.number().int().min(0).max(2_000_000),
    dedupedSourceJobs: z.number().int().min(0).max(2_000_000),
  })
  .strict();

export const canonicalJobListResponseSchema = z
  .object({
    contractVersion: z.literal(jobsContractVersion),
    jobs: z.array(canonicalJobSummarySchema).max(2_000),
  })
  .strict();

export const canonicalJobDetailsResponseSchema = z
  .object({
    contractVersion: z.literal(jobsContractVersion),
    canonical: canonicalJobDetailSchema,
  })
  .strict();

export type CanonicalJobId = z.infer<typeof canonicalJobIdSchema>;
export type CanonicalMappingReasonCode = z.infer<
  typeof canonicalMappingReasonCodeSchema
>;
export type CanonicalSourceMapping = z.infer<typeof canonicalSourceMappingSchema>;
export type CanonicalJobSummary = z.infer<typeof canonicalJobSummarySchema>;
export type CanonicalJobDetail = z.infer<typeof canonicalJobDetailSchema>;
export type CanonicalRebuildRequest = z.infer<typeof canonicalRebuildRequestSchema>;
export type CanonicalRebuildResponse = z.infer<typeof canonicalRebuildResponseSchema>;
export type CanonicalJobListResponse = z.infer<typeof canonicalJobListResponseSchema>;
export type CanonicalJobDetailsResponse = z.infer<
  typeof canonicalJobDetailsResponseSchema
>;
