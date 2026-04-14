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

const defaultGreenhouseSourceName = 'greenhouse_public_board';
const defaultConnectorVersion = 'greenhouse-public-board-v1';
const defaultEndpointBaseUrl = 'https://boards-api.greenhouse.io/v1';

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

const greenhouseResponseSchema = z
  .object({
    jobs: z.array(z.unknown()),
  })
  .passthrough();

const greenhouseJobSchema = z
  .object({
    id: z.union([z.number().int(), z.string().trim().min(1)]),
    title: z.string().trim().min(1).max(240),
    absolute_url: z.string().url().max(2048),
    updated_at: z.string().trim().optional(),
    content: z.string().optional(),
    location: z
      .object({
        name: z.string().trim().min(1).max(200),
      })
      .nullable()
      .optional(),
    metadata: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(120),
            value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
          })
          .passthrough(),
      )
      .nullable()
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

const toDisplayCompanyName = (boardToken: string): string =>
  boardToken
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

const detectSalaryPeriod = (text: string): SourceSalaryPeriod | null => {
  const lower = text.toLowerCase();

  if (/\bper hour\b|\/\s?hour\b|\bhourly\b/.test(lower)) {
    return 'hour';
  }

  if (/\bper month\b|\/\s?month\b|\bmonthly\b/.test(lower)) {
    return 'month';
  }

  if (/\bper year\b|\/\s?year\b|\bannual\b|\byearly\b/.test(lower)) {
    return 'year';
  }

  return null;
};

const detectSalaryCurrency = (text: string): string | null => {
  const lower = text.toLowerCase();

  if (lower.includes('usd') || lower.includes('$')) {
    return 'USD';
  }

  if (lower.includes('eur') || lower.includes('€')) {
    return 'EUR';
  }

  if (lower.includes('gbp') || lower.includes('£')) {
    return 'GBP';
  }

  return null;
};

const parseSalaryRange = (
  text: string,
): {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SourceSalaryPeriod | null;
} => {
  const match = text.match(
    /\$?\s?(\d{2,3}(?:,\d{3})+)\s*(?:-|–|to)\s*\$?\s?(\d{2,3}(?:,\d{3})+)/i,
  );

  if (!match) {
    return {
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: null,
    };
  }

  const first = Number(match[1]?.replace(/,/g, ''));
  const second = Number(match[2]?.replace(/,/g, ''));
  const salaryMin = Math.min(first, second);
  const salaryMax = Math.max(first, second);

  if (!Number.isFinite(salaryMin) || !Number.isFinite(salaryMax)) {
    return {
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: null,
    };
  }

  return {
    salaryMin,
    salaryMax,
    salaryCurrency: detectSalaryCurrency(text),
    salaryPeriod: detectSalaryPeriod(text),
  };
};

const parseIsoDateOrNull = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }

  return parsed.toISOString();
};

const collectMetadataText = (
  metadata:
    | Array<{ name: string; value?: string | number | boolean | null }>
    | null
    | undefined,
): string => {
  if (!metadata || metadata.length === 0) {
    return '';
  }

  return metadata
    .map((entry) => {
      const rawValue = entry.value;
      if (rawValue === null || rawValue === undefined) {
        return `${entry.name}`;
      }

      return `${entry.name}: ${String(rawValue)}`;
    })
    .join(' | ');
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
  boardToken: string,
  rawJob: z.infer<typeof greenhouseJobSchema>,
): ConnectorJobCandidate => {
  const descriptionText = stripHtml(rawJob.content ?? '');
  const metadataText = collectMetadataText(rawJob.metadata);
  const remoteText = [rawJob.location?.name ?? '', metadataText, rawJob.title].join(' ');
  const employmentText = [rawJob.title, metadataText, descriptionText].join(' ');
  const textForSkills = [rawJob.title, descriptionText].join(' ');
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

  const salary = parseSalaryRange(descriptionText);

  return {
    sourceJobId: String(rawJob.id),
    sourceCompanyId: boardToken,
    sourceStatus: 'open',
    title: rawJob.title,
    companyName: toDisplayCompanyName(boardToken),
    fetchUrl: rawJob.absolute_url,
    applicationUrl: rawJob.absolute_url,
    locationText: rawJob.location?.name ?? null,
    remoteType: inferRemoteType(remoteText),
    employmentType: inferEmploymentType(employmentText),
    postedAt: parseIsoDateOrNull(rawJob.updated_at),
    descriptionText: descriptionText.length > 0 ? descriptionText : rawJob.title,
    normalizedSkills,
    requiredSkills,
    preferredSkills,
    salaryMin: salary.salaryMin,
    salaryMax: salary.salaryMax,
    salaryCurrency: salary.salaryCurrency,
    salaryPeriod: salary.salaryPeriod,
    rawPayload: {
      sourceName,
      boardToken,
      job: rawJob,
    },
  };
};

export interface CreateGreenhousePublicBoardConnectorOptions {
  boardToken: string;
  sourceName?: string;
  displayName?: string;
  connectorVersion?: string;
  endpointBaseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export const createGreenhousePublicBoardConnector = ({
  boardToken,
  sourceName = defaultGreenhouseSourceName,
  displayName = 'Greenhouse Public Board',
  connectorVersion = defaultConnectorVersion,
  endpointBaseUrl = defaultEndpointBaseUrl,
  fetchImpl = fetch,
  now = () => new Date(),
}: CreateGreenhousePublicBoardConnectorOptions): SourceConnectorDefinition => {
  const parsedSourceName = sourceNameSchema.parse(sourceName);
  const normalizedBoardToken = boardToken.trim();

  return {
    sourceName: parsedSourceName,
    displayName,
    connectorVersion,
    async sync(input: ConnectorSyncInput): Promise<ConnectorSyncResult> {
      if (normalizedBoardToken.length === 0) {
        throw new HttpError(400, 'greenhouse_board_token_missing', {
          sourceName: parsedSourceName,
        });
      }

      const maxRecords = input.maxRecords ?? Number.MAX_SAFE_INTEGER;
      const endpoint = new URL(
        `${endpointBaseUrl}/boards/${encodeURIComponent(normalizedBoardToken)}/jobs`,
      );
      endpoint.searchParams.set('content', 'true');

      const response = await fetchImpl(endpoint, {
        method: 'GET',
        headers: {
          accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new HttpError(502, 'greenhouse_fetch_failed', {
          sourceName: parsedSourceName,
          httpStatus: response.status,
        });
      }

      const body = (await response.json()) as unknown;
      const parsedResponse = greenhouseResponseSchema.safeParse(body);
      if (!parsedResponse.success) {
        throw new HttpError(502, 'greenhouse_invalid_response', {
          sourceName: parsedSourceName,
        });
      }

      const errors: string[] = [];
      const jobs: ConnectorJobCandidate[] = [];

      for (const [index, rawJob] of parsedResponse.data.jobs.entries()) {
        if (jobs.length >= maxRecords) {
          break;
        }

        const parsedJob = greenhouseJobSchema.safeParse(rawJob);
        if (!parsedJob.success) {
          errors.push(
            `job[${index}] invalid shape: ${parsedJob.error.issues
              .map((issue) => issue.message)
              .join('; ')}`,
          );
          continue;
        }

        const candidate = toConnectorJobCandidate(
          parsedSourceName,
          normalizedBoardToken,
          parsedJob.data,
        );

        const validatedCandidate = connectorJobCandidateSchema.safeParse(candidate);
        if (!validatedCandidate.success) {
          errors.push(
            `job[${index}] normalization failed: ${validatedCandidate.error.issues
              .map((issue) => issue.message)
              .join('; ')}`,
          );
          continue;
        }

        jobs.push(validatedCandidate.data);
      }

      return {
        fetchedAt: now().toISOString(),
        jobs,
        errors,
      };
    },
  };
};
