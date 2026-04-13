import { createHash } from 'node:crypto';

import type {
  CanonicalMappingReasonCode,
  CanonicalRebuildRequest,
  CanonicalRebuildResponse,
  CanonicalSourceMapping,
  CanonicalJobSummary,
  SourceJobSummary,
  SourceName,
} from '@job-hunter/shared';

import { HttpError } from '../../http/http-errors.js';
import type { CanonicalJobRepository, CanonicalJobDraft } from './repository.js';
import { createInMemoryCanonicalJobRepository } from './in-memory-repository.js';

const defaultListLimit = 50;
const maxListLimit = 500;
const defaultSourceJobLimit = 500;

export interface SourceJobReader {
  listSourceJobs(options?: {
    sourceName?: SourceName;
    limit?: number;
  }): Promise<SourceJobSummary[]>;
}

interface CanonicalClusterMatch {
  matched: true;
  confidence: number;
  reasonCodes: CanonicalMappingReasonCode[];
}

interface CanonicalClusterNoMatch {
  matched: false;
}

type CanonicalClusterEvaluation = CanonicalClusterMatch | CanonicalClusterNoMatch;

interface CanonicalCluster {
  jobs: SourceJobSummary[];
  mappings: CanonicalSourceMapping[];
}

const normalizeText = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\bsr\.?\b/g, 'senior')
    .replace(/\bjr\.?\b/g, 'junior')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (value: string): Set<string> =>
  new Set(
    normalizeText(value)
      .split(' ')
      .filter((token) => token.length >= 2),
  );

const tokenOverlap = (left: Set<string>, right: Set<string>): number => {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(left.size, right.size);
};

const toCanonicalJobId = (value: string): string => {
  const hash = createHash('sha256').update(value).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};

const compareIso = (left: string, right: string): number => left.localeCompare(right);

const minIso = (values: string[]): string => values.slice().sort(compareIso)[0] ?? new Date(0).toISOString();

const maxIso = (values: string[]): string =>
  values.slice().sort(compareIso).reverse()[0] ?? new Date(0).toISOString();

const parseSalaryBand = (
  job: SourceJobSummary,
): {
  min: number;
  max: number;
} | null => {
  const min = job.salaryMin;
  const max = job.salaryMax;

  if (min === null && max === null) {
    return null;
  }

  const safeMin = min ?? max;
  const safeMax = max ?? min;
  if (safeMin === null || safeMax === null) {
    return null;
  }

  return {
    min: Math.min(safeMin, safeMax),
    max: Math.max(safeMin, safeMax),
  };
};

const hasSalaryBandOverlap = (left: SourceJobSummary, right: SourceJobSummary): boolean => {
  const leftBand = parseSalaryBand(left);
  const rightBand = parseSalaryBand(right);

  if (!leftBand || !rightBand) {
    return false;
  }

  if (
    left.salaryCurrency &&
    right.salaryCurrency &&
    left.salaryCurrency !== right.salaryCurrency
  ) {
    return false;
  }

  return leftBand.min <= rightBand.max && rightBand.min <= leftBand.max;
};

const hasLocationTokenOverlap = (left: SourceJobSummary, right: SourceJobSummary): boolean => {
  if (!left.locationText || !right.locationText) {
    return false;
  }

  const leftTokens = tokenize(left.locationText);
  const rightTokens = tokenize(right.locationText);
  return tokenOverlap(leftTokens, rightTokens) >= 0.6;
};

const sameRemoteType = (left: SourceJobSummary, right: SourceJobSummary): boolean =>
  left.remoteType !== 'unknown' &&
  right.remoteType !== 'unknown' &&
  left.remoteType === right.remoteType;

const buildReasonCodes = (input: {
  titleSimilarity: number;
  sameRemote: boolean;
  sameLocation: boolean;
  sameSalaryBand: boolean;
}): CanonicalMappingReasonCode[] => {
  const reasonCodes: CanonicalMappingReasonCode[] = [];

  if (input.titleSimilarity >= 0.94) {
    reasonCodes.push('exact_company_title');
  } else if (input.titleSimilarity >= 0.8) {
    reasonCodes.push('strong_title_overlap');
  }

  if (input.sameRemote) {
    reasonCodes.push('same_remote_type');
  }

  if (input.sameLocation) {
    reasonCodes.push('same_location_token');
  }

  if (input.sameSalaryBand) {
    reasonCodes.push('same_salary_band');
  }

  return reasonCodes;
};

const evaluateMatch = (
  left: SourceJobSummary,
  right: SourceJobSummary,
): CanonicalClusterEvaluation => {
  if (normalizeText(left.companyName) !== normalizeText(right.companyName)) {
    return { matched: false };
  }

  const titleSimilarity = tokenOverlap(tokenize(left.title), tokenize(right.title));
  const sameRemote = sameRemoteType(left, right);
  const sameLocation = hasLocationTokenOverlap(left, right);
  const sameSalaryBand = hasSalaryBandOverlap(left, right);

  const strictMatch =
    titleSimilarity >= 0.88 ||
    (titleSimilarity >= 0.8 && sameRemote && (sameLocation || sameSalaryBand));

  if (!strictMatch) {
    return { matched: false };
  }

  const confidence = Math.max(
    0,
    Math.min(
      0.99,
      0.5 +
        titleSimilarity * 0.35 +
        (sameRemote ? 0.07 : 0) +
        (sameLocation ? 0.04 : 0) +
        (sameSalaryBand ? 0.04 : 0),
    ),
  );

  return {
    matched: true,
    confidence,
    reasonCodes: buildReasonCodes({
      titleSimilarity,
      sameRemote,
      sameLocation,
      sameSalaryBand,
    }),
  };
};

const pickPrimarySourceJob = (jobs: SourceJobSummary[]): SourceJobSummary => {
  const sorted = [...jobs].sort((left, right) => {
    if (left.firstSeenAt === right.firstSeenAt) {
      if (left.sourceName === right.sourceName) {
        return left.sourceJobId.localeCompare(right.sourceJobId);
      }

      return left.sourceName.localeCompare(right.sourceName);
    }

    return left.firstSeenAt.localeCompare(right.firstSeenAt);
  });

  const primary = sorted[0];
  if (!primary) {
    throw new Error('cannot_pick_primary_source_job');
  }

  return primary;
};

const toMode = <T extends string>(values: T[], fallback: T): T => {
  if (values.length === 0) {
    return fallback;
  }

  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let best = fallback;
  let bestCount = -1;

  for (const [value, count] of counts.entries()) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
      continue;
    }

    if (count === bestCount && value < best) {
      best = value;
    }
  }

  return best;
};

const collectTopSkills = (jobs: SourceJobSummary[]): string[] => {
  const counts = new Map<string, { skill: string; count: number }>();

  for (const job of jobs) {
    for (const skill of job.normalizedSkills) {
      const normalized = normalizeText(skill);
      if (!normalized) {
        continue;
      }

      const existing = counts.get(normalized);
      if (existing) {
        existing.count += 1;
        continue;
      }

      counts.set(normalized, {
        skill: skill.trim(),
        count: 1,
      });
    }
  }

  return [...counts.values()]
    .sort((left, right) => {
      if (left.count === right.count) {
        return left.skill.localeCompare(right.skill);
      }

      return right.count - left.count;
    })
    .slice(0, 20)
    .map((entry) => entry.skill);
};

const toCanonicalDraft = (
  cluster: CanonicalCluster,
): {
  job: CanonicalJobDraft;
  mappings: CanonicalSourceMapping[];
} => {
  const primary = pickPrimarySourceJob(cluster.jobs);

  const companyKey = normalizeText(primary.companyName);
  const titleKey = normalizeText(primary.title);
  const canonicalJobId = toCanonicalJobId(`${companyKey}:${titleKey}`);

  const sourceNames = [...new Set(cluster.jobs.map((job) => job.sourceName))].sort();
  const firstSeenAt = minIso(cluster.jobs.map((job) => job.firstSeenAt));
  const lastSeenAt = maxIso(cluster.jobs.map((job) => job.lastSeenAt));

  const salaryMins = cluster.jobs
    .map((job) => job.salaryMin)
    .filter((value): value is number => value !== null);
  const salaryMaxes = cluster.jobs
    .map((job) => job.salaryMax)
    .filter((value): value is number => value !== null);

  const salaryCurrencies = [...new Set(cluster.jobs.map((job) => job.salaryCurrency).filter((value): value is string => value !== null))];
  const salaryPeriods = [...new Set(cluster.jobs.map((job) => job.salaryPeriod).filter((value): value is 'hour' | 'month' | 'year' => value !== null))];

  const jobStatus = cluster.jobs.some((job) => job.sourceStatus === 'open')
    ? 'open'
    : cluster.jobs.every((job) => job.sourceStatus === 'closed')
      ? 'closed'
      : 'unknown';

  const mappings = cluster.mappings
    .map((mapping) => ({
      ...mapping,
      mappingReasonCodes: [...mapping.mappingReasonCodes],
      isPrimary:
        mapping.sourceName === primary.sourceName &&
        mapping.sourceJobId === primary.sourceJobId,
    }))
    .sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) {
        return left.isPrimary ? -1 : 1;
      }

      if (left.sourceName === right.sourceName) {
        return left.sourceJobId.localeCompare(right.sourceJobId);
      }

      return left.sourceName.localeCompare(right.sourceName);
    });

  return {
    job: {
      canonicalJobId,
      canonicalCompanyName: primary.companyName,
      canonicalTitle: primary.title,
      normalizedLocation: primary.locationText,
      remoteType: toMode(
        cluster.jobs.map((job) => job.remoteType),
        primary.remoteType,
      ),
      employmentType: toMode(
        cluster.jobs.map((job) => job.employmentType),
        primary.employmentType,
      ),
      salaryMin: salaryMins.length > 0 ? Math.min(...salaryMins) : null,
      salaryMax: salaryMaxes.length > 0 ? Math.max(...salaryMaxes) : null,
      salaryCurrency:
        salaryCurrencies.length === 1 ? salaryCurrencies[0] : primary.salaryCurrency,
      salaryPeriod: salaryPeriods.length === 1 ? salaryPeriods[0] : primary.salaryPeriod,
      sourceCount: cluster.jobs.length,
      sourceNames,
      jobStatus,
      topSkills: collectTopSkills(cluster.jobs),
      firstSeenAt,
      lastSeenAt,
    },
    mappings,
  };
};

const buildClusters = (sourceJobs: SourceJobSummary[]): CanonicalCluster[] => {
  const sorted = [...sourceJobs].sort((left, right) => {
    if (left.firstSeenAt === right.firstSeenAt) {
      if (left.sourceName === right.sourceName) {
        return left.sourceJobId.localeCompare(right.sourceJobId);
      }

      return left.sourceName.localeCompare(right.sourceName);
    }

    return left.firstSeenAt.localeCompare(right.firstSeenAt);
  });

  const clusters: CanonicalCluster[] = [];

  for (const sourceJob of sorted) {
    let bestClusterIndex = -1;
    let bestMatch: CanonicalClusterMatch | null = null;

    for (const [index, cluster] of clusters.entries()) {
      const primary = pickPrimarySourceJob(cluster.jobs);
      const match = evaluateMatch(sourceJob, primary);
      if (!match.matched) {
        continue;
      }

      if (!bestMatch || match.confidence > bestMatch.confidence) {
        bestMatch = match;
        bestClusterIndex = index;
      }
    }

    if (!bestMatch || bestClusterIndex < 0) {
      clusters.push({
        jobs: [sourceJob],
        mappings: [
          {
            sourceName: sourceJob.sourceName,
            sourceJobId: sourceJob.sourceJobId,
            isPrimary: true,
            mappingConfidence: 1,
            mappingReasonCodes: ['exact_company_title'],
          },
        ],
      });
      continue;
    }

    const targetCluster = clusters[bestClusterIndex];
    if (!targetCluster) {
      continue;
    }

    targetCluster.jobs.push(sourceJob);
    targetCluster.mappings.push({
      sourceName: sourceJob.sourceName,
      sourceJobId: sourceJob.sourceJobId,
      isPrimary: false,
      mappingConfidence: bestMatch.confidence,
      mappingReasonCodes:
        bestMatch.reasonCodes.length > 0
          ? bestMatch.reasonCodes
          : ['strong_title_overlap'],
    });
  }

  return clusters;
};

export interface CanonicalJobsService {
  rebuildCatalog(
    request: CanonicalRebuildRequest,
  ): Promise<Omit<CanonicalRebuildResponse, 'contractVersion'>>;
  listCanonicalJobs(limit?: number): Promise<CanonicalJobSummary[]>;
  getCanonicalJob(canonicalJobId: string): Promise<{
    job: CanonicalJobSummary;
    sourceMappings: CanonicalSourceMapping[];
  } | null>;
}

export interface CreateCanonicalJobsServiceOptions {
  sourceJobReader: SourceJobReader;
  repository?: CanonicalJobRepository;
  now?: () => Date;
}

export const createCanonicalJobsService = ({
  sourceJobReader,
  repository = createInMemoryCanonicalJobRepository(),
  now = () => new Date(),
}: CreateCanonicalJobsServiceOptions): CanonicalJobsService => ({
  async rebuildCatalog(request) {
    const startedAt = now().toISOString();
    const sourceJobs = await sourceJobReader.listSourceJobs({
      sourceName: request.sourceName,
      limit: request.maxSourceJobs ?? defaultSourceJobLimit,
    });

    const clusters = buildClusters(sourceJobs);

    let canonicalJobsCreated = 0;
    let canonicalJobsUpdated = 0;

    for (const cluster of clusters) {
      const canonical = toCanonicalDraft(cluster);
      const result = await repository.upsertCanonicalJob({
        job: canonical.job,
        sourceMappings: canonical.mappings,
        nowIso: now().toISOString(),
      });

      if (result.status === 'created') {
        canonicalJobsCreated += 1;
      } else if (result.status === 'updated') {
        canonicalJobsUpdated += 1;
      }
    }

    const completedAt = now().toISOString();

    return {
      startedAt,
      completedAt,
      sourceJobsScanned: sourceJobs.length,
      canonicalJobsCreated,
      canonicalJobsUpdated,
      dedupedSourceJobs: sourceJobs.length - clusters.length,
    };
  },

  async listCanonicalJobs(limit = defaultListLimit) {
    if (limit < 1 || limit > maxListLimit) {
      throw new HttpError(400, 'invalid_canonical_job_limit', {
        limit,
        maxListLimit,
      });
    }

    return repository.listCanonicalJobs(limit);
  },

  async getCanonicalJob(canonicalJobId) {
    const record = await repository.findCanonicalJobById(canonicalJobId);
    if (!record) {
      return null;
    }

    return {
      job: record.job,
      sourceMappings: record.sourceMappings,
    };
  },
});
