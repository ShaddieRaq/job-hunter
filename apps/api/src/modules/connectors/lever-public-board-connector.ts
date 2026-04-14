import type { SourceSalaryPeriod, SourceName } from '@job-hunter/shared';
import { sourceNameSchema } from '@job-hunter/shared';
import { z } from 'zod';

import { HttpError } from '../../http/http-errors.js';
import {
  connectorJobCandidateSchema,
  type ConnectorJobCandidate,
  type ConnectorSyncInput,
  type ConnectorSyncResult,
  type SourceConnectorDefinition,
} from './types.js';

const defaultLeverSourceName = 'lever_public_board';
const defaultConnectorVersion = 'lever-public-board-v1';
const defaultEndpointBaseUrl = 'https://api.lever.co/v0/postings';

const knownSkills: Array<{ skill: string; pattern: RegExp }> = [
  { skill: 'TypeScript', pattern: /\btypescript\b/i },
  { skill: 'JavaScript', pattern: /\bjavascript\b/i },
  { skill: 'Node.js', pattern: /\bnode\.?js\b/i },
  { skill: 'Python', pattern: /\bpython\b/i },
  { skill: 'Java', pattern: /\bjava\b/i },
  { skill: 'Go', pattern: /\bgolang\b|\bgo\b/i },
  { skill: 'Rust', pattern: /\brust\b/i },
  { skill: 'SQL', pattern: /\bsql\b/i },
  { skill: 'PostgreSQL', pattern: /\bpostgres(?:ql)?\b/i },
  { skill: 'AWS', pattern: /\baws\b|\bamazon web services\b/i },
  { skill: 'GCP', pattern: /\bgcp\b|\bgoogle cloud\b/i },
  { skill: 'Azure', pattern: /\bazure\b/i },
  { skill: 'Docker', pattern: /\bdocker\b/i },
  { skill: 'Kubernetes', pattern: /\bkubernetes\b|\bk8s\b/i },
  { skill: 'React', pattern: /\breact\b/i },
  { skill: 'Next.js', pattern: /\bnext\.?js\b/i },
  { skill: 'GraphQL', pattern: /\bgraphql\b/i },
  { skill: 'Terraform', pattern: /\bterraform\b/i },
];

const leverResponseSchema = z.array(z.unknown());

const leverPostingSchema = z
  .object({
    id: z.string().trim().min(1).max(160),
    text: z.string().trim().min(1).max(240),
    hostedUrl: z.string().url().max(2048).optional(),
    applyUrl: z.string().url().max(2048).optional(),
    description: z.string().optional(),
    additional: z.string().optional(),
    createdAt: z.union([z.number().int().nonnegative(), z.string().trim().min(1)]).optional(),
    workplaceType: z.string().trim().max(120).optional(),
    salaryRange: z
      .object({
        min: z.number().int().min(0).optional(),
        max: z.number().int().min(0).optional(),
        currency: z.string().trim().min(1).max(12).optional(),
        interval: z.string().trim().min(1).max(40).optional(),
      })
      .partial()
      .optional(),
    categories: z
      .object({
        location: z.string().trim().max(200).optional(),
        commitment: z.string().trim().max(200).optional(),
        team: z.string().trim().max(200).optional(),
        department: z.string().trim().max(200).optional(),
        allLocations: z.array(z.string().trim().max(200)).optional(),
      })
      .partial()
      .optional(),
    lists: z
      .array(
        z
          .object({
            text: z.string().trim().min(1).max(160).optional(),
            content: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const normalizeWhitespace = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

const decodeHtmlEntities = (value: string): string =>
  value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

const stripHtml = (value: string): string =>
  normalizeWhitespace(
    decodeHtmlEntities(
      value
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' '),
    ),
  );

const toDisplayCompanyName = (companyHandle: string): string =>
  companyHandle
    .trim()
    .split(/[-_]+/)
    .filter((segment) => segment.length > 0)
    .map((segment) =>
      segment.length === 1
        ? segment.toUpperCase()
        : segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase(),
    )
    .join(' ');

const dedupeCaseInsensitive = (values: string[]): string[] => {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    deduped.push(value.trim());
  }

  return deduped;
};

const inferRemoteType = (value: string): 'remote' | 'hybrid' | 'onsite' | 'unknown' => {
  const lower = value.toLowerCase();

  if (/\bhybrid\b/.test(lower)) {
    return 'hybrid';
  }

  if (/\bonsite\b|\bon-site\b|\bin office\b|\bin-office\b/.test(lower)) {
    return 'onsite';
  }

  if (/\bremote\b|\bdistributed\b|\bwork from home\b/.test(lower)) {
    return 'remote';
  }

  return 'unknown';
};

const inferEmploymentType = (
  value: string,
): 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary' | 'unknown' => {
  const lower = value.toLowerCase();

  if (/\bfull[ -]?time\b/.test(lower)) {
    return 'full_time';
  }

  if (/\bpart[ -]?time\b/.test(lower)) {
    return 'part_time';
  }

  if (/\bcontract\b|\bcontractor\b/.test(lower)) {
    return 'contract';
  }

  if (/\bintern\b|\binternship\b/.test(lower)) {
    return 'internship';
  }

  if (/\btemporary\b|\btemp\b/.test(lower)) {
    return 'temporary';
  }

  return 'unknown';
};

const intervalToSalaryPeriod = (value: string | undefined): SourceSalaryPeriod | null => {
  if (!value) {
    return null;
  }

  const lower = value.toLowerCase();
  if (lower.includes('hour') || lower === 'hr') {
    return 'hour';
  }

  if (lower.includes('month')) {
    return 'month';
  }

  if (lower.includes('year') || lower.includes('annual') || lower === 'yr') {
    return 'year';
  }

  return null;
};

const parseCreatedAtOrNull = (value: number | string | undefined): string | null => {
  if (value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    const epochMs = value < 10_000_000_000 ? value * 1000 : value;
    const parsed = new Date(epochMs);
    if (Number.isNaN(parsed.valueOf())) {
      return null;
    }

    return parsed.toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }

  return parsed.toISOString();
};

const extractSkills = (value: string): string[] => {
  const matches = knownSkills
    .filter((entry) => entry.pattern.test(value))
    .map((entry) => entry.skill);

  return dedupeCaseInsensitive(matches);
};

const extractSkillsFromSection = (
  fullText: string,
  sectionMarkers: string[],
): string[] => {
  const lower = fullText.toLowerCase();

  for (const marker of sectionMarkers) {
    const index = lower.indexOf(marker);
    if (index < 0) {
      continue;
    }

    const sectionText = fullText.slice(index, index + 3000);
    return extractSkills(sectionText);
  }

  return [];
};

const toConnectorJobCandidate = (
  sourceName: SourceName,
  companyHandle: string,
  rawPosting: z.infer<typeof leverPostingSchema>,
): ConnectorJobCandidate => {
  const listText = (rawPosting.lists ?? [])
    .map((item) => `${item.text ?? ''} ${stripHtml(item.content ?? '')}`)
    .join(' ');

  const descriptionText = stripHtml(
    [rawPosting.description ?? '', rawPosting.additional ?? '', listText]
      .filter((segment) => segment.length > 0)
      .join(' '),
  );

  const fetchUrl = rawPosting.hostedUrl ?? rawPosting.applyUrl;
  if (!fetchUrl) {
    throw new Error('missing_posting_url');
  }

  const locationText =
    rawPosting.categories?.location ?? rawPosting.categories?.allLocations?.[0] ?? null;

  const textForSkills = [rawPosting.text, descriptionText].join(' ');
  const normalizedSkills = extractSkills(textForSkills);

  const extractedRequiredSkills = extractSkillsFromSection(descriptionText, [
    'requirements',
    'must have',
    'qualifications',
  ]);

  const hasRequiredSection =
    /\brequirements\b|\bmust have\b|\bqualifications\b/i.test(
      descriptionText,
    );

  const requiredSkills =
    extractedRequiredSkills.length > 0
      ? extractedRequiredSkills
      : hasRequiredSection
        ? normalizedSkills.slice(0, 3)
        : [];

  const extractedPreferredSkills = extractSkillsFromSection(descriptionText, [
    'preferred',
    'nice to have',
    'bonus',
  ]);

  const hasPreferredSection =
    /\bpreferred\b|\bnice to have\b|\bbonus\b/i.test(descriptionText);

  const preferredSkills = dedupeCaseInsensitive(
    (extractedPreferredSkills.length > 0
      ? extractedPreferredSkills
      : hasPreferredSection
        ? normalizedSkills.slice(0, 4)
        : []
    ).filter(
      (skill) =>
        !requiredSkills.some(
          (required) => required.toLowerCase() === skill.toLowerCase(),
        ),
    ),
  );

  const remoteContext = [
    locationText ?? '',
    rawPosting.workplaceType ?? '',
    rawPosting.text,
    descriptionText,
  ].join(' ');

  const employmentContext = [
    rawPosting.categories?.commitment ?? '',
    rawPosting.text,
    descriptionText,
  ].join(' ');

  return {
    sourceJobId: rawPosting.id,
    sourceCompanyId: companyHandle,
    sourceStatus: 'open',
    title: rawPosting.text,
    companyName: toDisplayCompanyName(companyHandle),
    fetchUrl,
    applicationUrl: rawPosting.applyUrl ?? rawPosting.hostedUrl ?? null,
    locationText,
    remoteType: inferRemoteType(remoteContext),
    employmentType: inferEmploymentType(employmentContext),
    postedAt: parseCreatedAtOrNull(rawPosting.createdAt),
    descriptionText: descriptionText.length > 0 ? descriptionText : rawPosting.text,
    normalizedSkills,
    requiredSkills,
    preferredSkills,
    salaryMin: rawPosting.salaryRange?.min ?? null,
    salaryMax: rawPosting.salaryRange?.max ?? null,
    salaryCurrency: rawPosting.salaryRange?.currency?.toUpperCase() ?? null,
    salaryPeriod: intervalToSalaryPeriod(rawPosting.salaryRange?.interval),
    rawPayload: {
      sourceName,
      companyHandle,
      posting: rawPosting,
    },
  };
};

export interface CreateLeverPublicBoardConnectorOptions {
  companyHandle: string;
  sourceName?: string;
  displayName?: string;
  connectorVersion?: string;
  endpointBaseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export const createLeverPublicBoardConnector = ({
  companyHandle,
  sourceName = defaultLeverSourceName,
  displayName = 'Lever Public Board',
  connectorVersion = defaultConnectorVersion,
  endpointBaseUrl = defaultEndpointBaseUrl,
  fetchImpl = fetch,
  now = () => new Date(),
}: CreateLeverPublicBoardConnectorOptions): SourceConnectorDefinition => {
  const parsedSourceName = sourceNameSchema.parse(sourceName);
  const normalizedCompanyHandle = companyHandle.trim();

  return {
    sourceName: parsedSourceName,
    displayName,
    connectorVersion,
    async sync(input: ConnectorSyncInput): Promise<ConnectorSyncResult> {
      if (normalizedCompanyHandle.length === 0) {
        throw new HttpError(400, 'lever_company_handle_missing', {
          sourceName: parsedSourceName,
        });
      }

      const maxRecords = input.maxRecords ?? Number.MAX_SAFE_INTEGER;
      const endpoint = new URL(
        `${endpointBaseUrl}/${encodeURIComponent(normalizedCompanyHandle)}`,
      );
      endpoint.searchParams.set('mode', 'json');

      const response = await fetchImpl(endpoint, {
        method: 'GET',
        headers: {
          accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new HttpError(502, 'lever_fetch_failed', {
          sourceName: parsedSourceName,
          httpStatus: response.status,
        });
      }

      const body = (await response.json()) as unknown;
      const parsedResponse = leverResponseSchema.safeParse(body);
      if (!parsedResponse.success) {
        throw new HttpError(502, 'lever_invalid_response', {
          sourceName: parsedSourceName,
        });
      }

      const errors: string[] = [];
      const jobs: ConnectorJobCandidate[] = [];

      for (const [index, rawPosting] of parsedResponse.data.entries()) {
        if (jobs.length >= maxRecords) {
          break;
        }

        const parsedPosting = leverPostingSchema.safeParse(rawPosting);
        if (!parsedPosting.success) {
          errors.push(
            `posting[${index}] invalid shape: ${parsedPosting.error.issues
              .map((issue) => issue.message)
              .join('; ')}`,
          );
          continue;
        }

        try {
          const candidate = toConnectorJobCandidate(
            parsedSourceName,
            normalizedCompanyHandle,
            parsedPosting.data,
          );

          const validatedCandidate = connectorJobCandidateSchema.safeParse(candidate);
          if (!validatedCandidate.success) {
            errors.push(
              `posting[${index}] normalization failed: ${validatedCandidate.error.issues
                .map((issue) => issue.message)
                .join('; ')}`,
            );
            continue;
          }

          jobs.push(validatedCandidate.data);
        } catch (error: unknown) {
          const details = error instanceof Error ? error.message : 'unknown_error';
          errors.push(`posting[${index}] normalization failed: ${details}`);
        }
      }

      return {
        fetchedAt: now().toISOString(),
        jobs,
        errors,
      };
    },
  };
};
