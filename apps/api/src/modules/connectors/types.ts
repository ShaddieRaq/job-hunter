import {
  sourceEmploymentTypeSchema,
  sourceJobStatusSchema,
  sourceNameSchema,
  sourceRemoteTypeSchema,
  sourceSalaryPeriodSchema,
} from '@job-hunter/shared';
import { z } from 'zod';

const trimmedText = (max: number): z.ZodString =>
  z.string().trim().min(1).max(max);

const nullableTrimmedText = (max: number) => trimmedText(max).nullable();

export const connectorJobCandidateSchema = z
  .object({
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
    descriptionText: trimmedText(200_000),
    normalizedSkills: z.array(trimmedText(120)).max(240),
    requiredSkills: z.array(trimmedText(120)).max(240),
    preferredSkills: z.array(trimmedText(120)).max(240),
    salaryMin: z.number().int().min(0).nullable(),
    salaryMax: z.number().int().min(0).nullable(),
    salaryCurrency: nullableTrimmedText(12),
    salaryPeriod: sourceSalaryPeriodSchema.nullable(),
    rawPayload: z.unknown(),
  })
  .strict();

export interface ConnectorSyncInput {
  maxRecords?: number;
}

export interface ConnectorSyncResult {
  fetchedAt: string;
  jobs: ConnectorJobCandidate[];
  errors: string[];
}

export interface SourceConnectorDefinition {
  sourceName: z.infer<typeof sourceNameSchema>;
  displayName: string;
  connectorVersion: string;
  sync(input: ConnectorSyncInput): Promise<ConnectorSyncResult>;
}

export type ConnectorJobCandidate = z.infer<typeof connectorJobCandidateSchema>;
