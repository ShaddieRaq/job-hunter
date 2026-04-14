import { z } from 'zod';

export const connectorContractVersion = 'v1' as const;

const trimmedText = (max: number): z.ZodString =>
  z.string().trim().min(1).max(max);

const nullableTrimmedText = (max: number) => trimmedText(max).nullable();

const checksumSha256Pattern = /^[a-f0-9]{64}$/;

export const sourceNameSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);

export const sourceConnectorHealthStatusSchema = z.enum([
  'unknown',
  'healthy',
  'degraded',
  'unhealthy',
]);

export const sourceRemoteTypeSchema = z.enum([
  'remote',
  'hybrid',
  'onsite',
  'unknown',
]);

export const sourceEmploymentTypeSchema = z.enum([
  'full_time',
  'part_time',
  'contract',
  'internship',
  'temporary',
  'unknown',
]);

export const sourceJobStatusSchema = z.enum(['open', 'closed', 'unknown']);

export const sourceSalaryPeriodSchema = z.enum(['hour', 'month', 'year']);

export const sourceConnectorSchema = z
  .object({
    sourceName: sourceNameSchema,
    displayName: trimmedText(120),
    connectorVersion: trimmedText(64),
    healthStatus: sourceConnectorHealthStatusSchema,
    lastSyncAt: z.string().datetime().nullable(),
    lastSuccessAt: z.string().datetime().nullable(),
    lastFailureAt: z.string().datetime().nullable(),
    lastErrorCode: nullableTrimmedText(64),
  })
  .strict();

export const sourceJobSummarySchema = z
  .object({
    sourceName: sourceNameSchema,
    sourceJobId: trimmedText(160),
    sourceCompanyId: nullableTrimmedText(160),
    sourceStatus: sourceJobStatusSchema,
    title: trimmedText(240),
    companyName: trimmedText(200),
    fetchUrl: z.string().url().max(2048),
    applicationUrl: z.string().url().max(2048).nullable(),
    locationText: nullableTrimmedText(200),
    remoteType: sourceRemoteTypeSchema,
    employmentType: sourceEmploymentTypeSchema,
    postedAt: z.string().datetime().nullable(),
    firstSeenAt: z.string().datetime(),
    lastSeenAt: z.string().datetime(),
    fetchedAt: z.string().datetime(),
    checksumSha256: z.string().regex(checksumSha256Pattern),
    normalizedSkills: z.array(trimmedText(120)).max(240),
    requiredSkills: z.array(trimmedText(120)).max(240),
    preferredSkills: z.array(trimmedText(120)).max(240),
    salaryMin: z.number().int().min(0).nullable(),
    salaryMax: z.number().int().min(0).nullable(),
    salaryCurrency: nullableTrimmedText(12),
    salaryPeriod: sourceSalaryPeriodSchema.nullable(),
  })
  .strict();

export const sourceJobDetailSchema = sourceJobSummarySchema
  .extend({
    descriptionText: trimmedText(200_000),
  })
  .strict();

export const connectorListResponseSchema = z
  .object({
    contractVersion: z.literal(connectorContractVersion),
    connectors: z.array(sourceConnectorSchema).max(50),
  })
  .strict();

export const connectorSyncRequestSchema = z
  .object({
    maxRecords: z.number().int().min(1).optional(),
  })
  .strict();

export const connectorSyncResponseSchema = z
  .object({
    contractVersion: z.literal(connectorContractVersion),
    sourceName: sourceNameSchema,
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    fetchedCount: z.number().int().min(0).max(100_000),
    insertedCount: z.number().int().min(0).max(100_000),
    updatedCount: z.number().int().min(0).max(100_000),
    unchangedCount: z.number().int().min(0).max(100_000),
    failedCount: z.number().int().min(0).max(100_000),
    healthStatus: sourceConnectorHealthStatusSchema,
    errors: z.array(trimmedText(240)).max(200),
  })
  .strict();

export const sourceJobListResponseSchema = z
  .object({
    contractVersion: z.literal(connectorContractVersion),
    sourceJobs: z.array(sourceJobSummarySchema),
  })
  .strict();

export const sourceJobDetailResponseSchema = z
  .object({
    contractVersion: z.literal(connectorContractVersion),
    sourceJob: sourceJobDetailSchema,
  })
  .strict();

export type SourceName = z.infer<typeof sourceNameSchema>;
export type SourceConnectorHealthStatus = z.infer<
  typeof sourceConnectorHealthStatusSchema
>;
export type SourceRemoteType = z.infer<typeof sourceRemoteTypeSchema>;
export type SourceEmploymentType = z.infer<typeof sourceEmploymentTypeSchema>;
export type SourceJobStatus = z.infer<typeof sourceJobStatusSchema>;
export type SourceSalaryPeriod = z.infer<typeof sourceSalaryPeriodSchema>;
export type SourceConnector = z.infer<typeof sourceConnectorSchema>;
export type SourceJobSummary = z.infer<typeof sourceJobSummarySchema>;
export type SourceJobDetail = z.infer<typeof sourceJobDetailSchema>;
export type ConnectorListResponse = z.infer<typeof connectorListResponseSchema>;
export type ConnectorSyncRequest = z.infer<typeof connectorSyncRequestSchema>;
export type ConnectorSyncResponse = z.infer<typeof connectorSyncResponseSchema>;
export type SourceJobListResponse = z.infer<typeof sourceJobListResponseSchema>;
export type SourceJobDetailResponse = z.infer<typeof sourceJobDetailResponseSchema>;
