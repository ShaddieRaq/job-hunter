import { z } from 'zod';

import { matchScoreArtifactSchema } from '../ai/v1.js';
import {
  sourceEmploymentTypeSchema,
  sourceJobSummarySchema,
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

export const dedupeTraceEventTypeSchema = z.enum([
  'linked_to_canonical',
  'unlinked_from_canonical',
]);

export const canonicalDedupeTraceEventSchema = z
  .object({
    eventId: z.string().uuid(),
    canonicalJobId: canonicalJobIdSchema,
    sourceName: sourceNameSchema,
    sourceJobId: trimmedText(160),
    eventType: dedupeTraceEventTypeSchema,
    mappingConfidence: z.number().min(0).max(1),
    mappingReasonCodes: z.array(canonicalMappingReasonCodeSchema).max(10),
    reversible: z.boolean(),
    dedupeVersion: trimmedText(64),
    occurredAt: z.string().datetime(),
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

export const canonicalDedupeTraceEventsResponseSchema = z
  .object({
    contractVersion: z.literal(jobsContractVersion),
    canonicalJobId: canonicalJobIdSchema,
    events: z.array(canonicalDedupeTraceEventSchema).max(500),
  })
  .strict();

export const feedRecommendationFilterSchema = z.enum([
  'high_fit',
  'all',
  'apply',
  'review',
  'skip',
  'unscored',
]);

export const feedRemoteFilterSchema = z.enum([
  'aligned',
  'any',
  'remote',
  'hybrid',
  'onsite',
]);

export const feedSortSchema = z.enum(['fit', 'recent', 'salary']);

export const feedSourceFilterSchema = z.union([
  z.literal('any'),
  sourceNameSchema,
]);

export const feedQuerySchema = z
  .object({
    q: z.string().trim().max(120),
    recommendation: feedRecommendationFilterSchema,
    remote: feedRemoteFilterSchema,
    source: feedSourceFilterSchema,
    sort: feedSortSchema,
    includeHidden: z.boolean(),
    limit: z.number().int().min(1).max(500),
  })
  .strict();

export const feedJobCardSchema = z
  .object({
    job: canonicalJobSummarySchema,
    latestScoreArtifact: matchScoreArtifactSchema.nullable(),
  })
  .strict();

export const feedResponseSchema = z
  .object({
    contractVersion: z.literal(jobsContractVersion),
    items: z.array(feedJobCardSchema).max(500),
  })
  .strict();

export const feedDetailResponseSchema = z
  .object({
    contractVersion: z.literal(jobsContractVersion),
    canonical: canonicalJobDetailSchema,
    latestScoreArtifact: matchScoreArtifactSchema.nullable(),
    dedupeEvents: z.array(canonicalDedupeTraceEventSchema).max(500),
    sourceJobs: z.array(sourceJobSummarySchema).max(200),
  })
  .strict();

export type CanonicalJobId = z.infer<typeof canonicalJobIdSchema>;
export type CanonicalMappingReasonCode = z.infer<
  typeof canonicalMappingReasonCodeSchema
>;
export type CanonicalSourceMapping = z.infer<typeof canonicalSourceMappingSchema>;
export type CanonicalDedupeTraceEvent = z.infer<
  typeof canonicalDedupeTraceEventSchema
>;
export type CanonicalJobSummary = z.infer<typeof canonicalJobSummarySchema>;
export type CanonicalJobDetail = z.infer<typeof canonicalJobDetailSchema>;
export type CanonicalRebuildRequest = z.infer<typeof canonicalRebuildRequestSchema>;
export type CanonicalRebuildResponse = z.infer<typeof canonicalRebuildResponseSchema>;
export type CanonicalJobListResponse = z.infer<typeof canonicalJobListResponseSchema>;
export type CanonicalJobDetailsResponse = z.infer<
  typeof canonicalJobDetailsResponseSchema
>;
export type CanonicalDedupeTraceEventsResponse = z.infer<
  typeof canonicalDedupeTraceEventsResponseSchema
>;
export type FeedRecommendationFilter = z.infer<
  typeof feedRecommendationFilterSchema
>;
export type FeedRemoteFilter = z.infer<typeof feedRemoteFilterSchema>;
export type FeedSort = z.infer<typeof feedSortSchema>;
export type FeedSourceFilter = z.infer<typeof feedSourceFilterSchema>;
export type FeedQuery = z.infer<typeof feedQuerySchema>;
export type FeedJobCard = z.infer<typeof feedJobCardSchema>;
export type FeedResponse = z.infer<typeof feedResponseSchema>;
export type FeedDetailResponse = z.infer<typeof feedDetailResponseSchema>;
