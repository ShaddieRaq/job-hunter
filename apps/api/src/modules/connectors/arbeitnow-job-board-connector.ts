import type { SourceName } from '@job-hunter/shared';
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

const defaultArbeitnowSourceName = 'arbeitnow_job_board';
const defaultConnectorVersion = 'arbeitnow-job-board-v1';
const defaultEndpointBaseUrl = 'https://www.arbeitnow.com/api/job-board-api';
const defaultPageSize = 200;

const knownSkills: Array<{ skill: string; pattern: RegExp }> = [
  { skill: 'TypeScript', pattern: /\btypescript\b/i },
  { skill: 'JavaScript', pattern: /\bjavascript\b/i },
  { skill: 'Node.js', pattern: /\bnode\.?js\b/i },
  { skill: 'Python', pattern: /\bpython\b/i },
  { skill: 'Java', pattern: /\bjava\b/i },
  { skill: 'PHP', pattern: /\bphp\b/i },
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

const arbeitnowResponseSchema = z
  .object({
    data: z.array(z.unknown()),
    links: z
      .object({
        next: z.string().url().nullable().optional(),
      })
      .partial()
      .optional(),
  })
  .passthrough();

const arbeitnowPostingSchema = z
  .object({
    slug: z.string().trim().min(1).max(260),
    company_name: z.string().trim().min(1).max(400),
    title: z.string().trim().min(1).max(600),
    description: z.string().optional(),
    remote: z.union([z.boolean(), z.number().int(), z.string().trim().min(1)]).optional(),
    url: z.string().url().max(2048),
    tags: z.array(z.string().trim().min(1).max(200)).optional(),
    job_types: z.array(z.string().trim().min(1).max(200)).optional(),
    location: z.string().trim().max(300).optional(),
    created_at: z.union([z.number().int().nonnegative(), z.string().trim().min(1)]).optional(),
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

const truncate = (value: string, maxLength: number): string =>
  value.length <= maxLength ? value : value.slice(0, maxLength);

const normalizeLocationText = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }

  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? truncate(normalized, 200) : null;
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

  if (/\bcontract\b|\bcontractor\b|\bfreelance\b/.test(lower)) {
    return 'contract';
  }

  if (/\bintern\b|\binternship\b|\bworking student\b/.test(lower)) {
    return 'internship';
  }

  if (/\btemporary\b|\btemp\b/.test(lower)) {
    return 'temporary';
  }

  return 'unknown';
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

const toBooleanOrNull = (
  value: boolean | number | string | undefined,
): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y'].includes(normalized)) {
      return true;
    }

    if (['0', 'false', 'no', 'n'].includes(normalized)) {
      return false;
    }
  }

  return null;
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

const toCompanyId = (companyName: string): string | null => {
  const normalized = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (normalized.length === 0) {
    return null;
  }

  return truncate(normalized, 160);
};

const toConnectorJobCandidate = (
  sourceName: SourceName,
  rawPosting: z.infer<typeof arbeitnowPostingSchema>,
): ConnectorJobCandidate => {
  const descriptionText = stripHtml(rawPosting.description ?? rawPosting.title);
  const locationText = normalizeLocationText(rawPosting.location);
  const explicitRemote = toBooleanOrNull(rawPosting.remote);

  const remoteContext = [
    locationText ?? '',
    rawPosting.title,
    descriptionText,
    ...(rawPosting.job_types ?? []),
  ].join(' ');

  const employmentContext = [
    ...(rawPosting.job_types ?? []),
    rawPosting.title,
    descriptionText,
  ].join(' ');

  const tagSkills = (rawPosting.tags ?? [])
    .map((value) => normalizeWhitespace(value))
    .filter((value) => value.length > 0)
    .map((value) => truncate(value, 120));

  const extractedSkills = extractSkills(
    [rawPosting.title, descriptionText, ...(rawPosting.tags ?? [])].join(' '),
  );

  const normalizedSkills = dedupeCaseInsensitive([...tagSkills, ...extractedSkills]).slice(
    0,
    240,
  );

  const extractedRequiredSkills = extractSkillsFromSection(descriptionText, [
    'requirements',
    'must have',
    'qualifications',
  ]);

  const hasRequiredSection =
    /\brequirements\b|\bmust have\b|\bqualifications\b/i.test(descriptionText);

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

  const remoteType =
    explicitRemote === true ? 'remote' : inferRemoteType(remoteContext);

  return {
    sourceJobId: truncate(rawPosting.slug, 160),
    sourceCompanyId: toCompanyId(rawPosting.company_name),
    sourceStatus: 'open',
    title: truncate(rawPosting.title, 240),
    companyName: truncate(rawPosting.company_name, 200),
    fetchUrl: rawPosting.url,
    applicationUrl: rawPosting.url,
    locationText,
    remoteType,
    employmentType: inferEmploymentType(employmentContext),
    postedAt: parseCreatedAtOrNull(rawPosting.created_at),
    descriptionText: descriptionText.length > 0 ? descriptionText : rawPosting.title,
    normalizedSkills,
    requiredSkills,
    preferredSkills,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    rawPayload: {
      sourceName,
      posting: rawPosting,
    },
  };
};

export interface CreateArbeitnowJobBoardConnectorOptions {
  sourceName?: string;
  displayName?: string;
  connectorVersion?: string;
  endpointBaseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export const createArbeitnowJobBoardConnector = ({
  sourceName = defaultArbeitnowSourceName,
  displayName = 'Arbeitnow Job Board',
  connectorVersion = defaultConnectorVersion,
  endpointBaseUrl = defaultEndpointBaseUrl,
  fetchImpl = fetch,
  now = () => new Date(),
}: CreateArbeitnowJobBoardConnectorOptions): SourceConnectorDefinition => {
  const parsedSourceName = sourceNameSchema.parse(sourceName);
  const normalizedEndpointBaseUrl = endpointBaseUrl.trim();

  return {
    sourceName: parsedSourceName,
    displayName,
    connectorVersion,
    async sync(input: ConnectorSyncInput): Promise<ConnectorSyncResult> {
      if (normalizedEndpointBaseUrl.length === 0) {
        throw new HttpError(400, 'arbeitnow_endpoint_missing', {
          sourceName: parsedSourceName,
        });
      }

      const maxRecords = input.maxRecords ?? Number.MAX_SAFE_INTEGER;
      const startEndpoint = new URL(normalizedEndpointBaseUrl);
      if (!startEndpoint.searchParams.has('limit')) {
        startEndpoint.searchParams.set('limit', String(defaultPageSize));
      }

      const errors: string[] = [];
      const jobs: ConnectorJobCandidate[] = [];
      const visitedEndpoints = new Set<string>();

      let nextEndpoint: URL | null = startEndpoint;
      let postingIndex = 0;

      while (nextEndpoint && jobs.length < maxRecords) {
        const endpointKey = nextEndpoint.toString();
        if (visitedEndpoints.has(endpointKey)) {
          errors.push('pagination terminated due to repeated next link');
          break;
        }

        visitedEndpoints.add(endpointKey);

        const response = await fetchImpl(nextEndpoint, {
          method: 'GET',
          headers: {
            accept: 'application/json',
          },
        });

        if (!response.ok) {
          throw new HttpError(502, 'arbeitnow_fetch_failed', {
            sourceName: parsedSourceName,
            httpStatus: response.status,
          });
        }

        let body: unknown;
        try {
          body = await response.json();
        } catch {
          throw new HttpError(502, 'arbeitnow_invalid_response', {
            sourceName: parsedSourceName,
            reason: 'invalid_json',
          });
        }

        const parsedResponse = arbeitnowResponseSchema.safeParse(body);
        if (!parsedResponse.success) {
          throw new HttpError(502, 'arbeitnow_invalid_response', {
            sourceName: parsedSourceName,
          });
        }

        for (const rawPosting of parsedResponse.data.data) {
          if (jobs.length >= maxRecords) {
            break;
          }

          const currentIndex = postingIndex;
          postingIndex += 1;

          const parsedPosting = arbeitnowPostingSchema.safeParse(rawPosting);
          if (!parsedPosting.success) {
            errors.push(
              `posting[${currentIndex}] invalid shape: ${parsedPosting.error.issues
                .map((issue) => issue.message)
                .join('; ')}`,
            );
            continue;
          }

          try {
            const candidate = toConnectorJobCandidate(
              parsedSourceName,
              parsedPosting.data,
            );

            const validatedCandidate = connectorJobCandidateSchema.safeParse(candidate);
            if (!validatedCandidate.success) {
              errors.push(
                `posting[${currentIndex}] normalization failed: ${validatedCandidate.error.issues
                  .map((issue) => issue.message)
                  .join('; ')}`,
              );
              continue;
            }

            jobs.push(validatedCandidate.data);
          } catch (error: unknown) {
            const details = error instanceof Error ? error.message : 'unknown_error';
            errors.push(`posting[${currentIndex}] normalization failed: ${details}`);
          }
        }

        const nextLink = parsedResponse.data.links?.next;
        if (typeof nextLink !== 'string' || nextLink.trim().length === 0) {
          nextEndpoint = null;
          continue;
        }

        try {
          nextEndpoint = new URL(nextLink);
        } catch {
          errors.push('pagination terminated due to invalid next link');
          nextEndpoint = null;
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
