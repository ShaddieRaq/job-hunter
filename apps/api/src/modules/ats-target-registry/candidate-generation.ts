import type { AtsVendor } from './repository.js';

const minCandidateLength = 3;
const maxCandidateLength = 80;

const trailingCorporateSuffixes = new Set([
  'inc',
  'incorporated',
  'llc',
  'ltd',
  'limited',
  'corp',
  'corporation',
  'company',
  'co',
  'gmbh',
  'ag',
  'plc',
  'sa',
  'bv',
  'oy',
  'sarl',
  'pte',
  'llp',
]);

const ignoredLeadingDomainLabels = new Set(['www', 'jobs', 'careers', 'boards']);

const supportedVendors = ['greenhouse', 'lever'] as const;

type SupportedCandidateVendor = (typeof supportedVendors)[number];

export interface AtsTargetCandidateGenerationSeed {
  companyName: string;
  websiteDomain?: string | null;
  sourceProvenance?: string;
}

export interface AtsTargetCandidateGenerationOptions {
  companySeeds: AtsTargetCandidateGenerationSeed[];
  includeVendors?: SupportedCandidateVendor[];
  maxCandidatesPerVendor?: number;
}

export interface AtsTargetCandidate {
  atsVendor: SupportedCandidateVendor;
  identifierType: 'board_token' | 'handle';
  identifierValue: string;
  companyName: string;
  normalizedCompanyName: string;
  sourceProvenance: string;
}

interface NormalizedSeed {
  companyName: string;
  normalizedCompanyName: string;
  websiteDomain: string | null;
  sourceProvenance: string;
}

const sanitizeForWords = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const toWordTokens = (value: string): string[] => {
  const normalized = sanitizeForWords(value);
  if (normalized.length === 0) {
    return [];
  }

  return normalized.split(/\s+/).filter((token) => token.length > 0);
};

const trimCorporateSuffixes = (tokens: string[]): string[] => {
  let end = tokens.length;
  while (end > 0 && trailingCorporateSuffixes.has(tokens[end - 1] ?? '')) {
    end -= 1;
  }

  return tokens.slice(0, end);
};

const normalizeCandidate = (value: string): string | null => {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '')
    .replace(/^[_-]+|[_-]+$/g, '');

  if (normalized.length < minCandidateLength) {
    return null;
  }

  return normalized.slice(0, maxCandidateLength);
};

const uniqueInOrder = <T>(values: T[]): T[] => {
  const deduped: T[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const key = JSON.stringify(value);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(value);
  }

  return deduped;
};

const normalizeWebsiteDomainCandidate = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  let host = value.trim().toLowerCase();
  if (host.length === 0) {
    return null;
  }

  if (host.includes('://')) {
    try {
      host = new URL(host).hostname.toLowerCase();
    } catch {
      return null;
    }
  } else {
    host = host.split('/')[0] ?? host;
  }

  host = host.split(':')[0] ?? host;
  host = host.replace(/^\.+|\.+$/g, '');
  if (host.length === 0) {
    return null;
  }

  const labels = host.split('.').filter((label) => label.length > 0);
  if (labels.length === 0) {
    return null;
  }

  const firstLabel = labels[0] ?? '';
  const candidateLabel =
    ignoredLeadingDomainLabels.has(firstLabel) && labels.length > 1
      ? (labels[1] ?? firstLabel)
      : firstLabel;

  return normalizeCandidate(candidateLabel);
};

const deriveCandidateValues = (seed: NormalizedSeed): string[] => {
  const tokens = toWordTokens(seed.companyName);
  if (tokens.length === 0) {
    return [];
  }

  const withoutSuffixes = trimCorporateSuffixes(tokens);
  const base = withoutSuffixes.length > 0 ? withoutSuffixes : tokens;

  const fromName = [
    base.join(''),
    base.join('-'),
    base.join('_'),
    tokens.join(''),
    tokens.join('-'),
    tokens.join('_'),
  ]
    .map((value) => normalizeCandidate(value))
    .filter((value): value is string => value !== null);

  const fromDomain = normalizeWebsiteDomainCandidate(seed.websiteDomain);

  return uniqueInOrder([
    ...fromName,
    ...(fromDomain ? [fromDomain] : []),
  ]);
};

const normalizeSeed = (
  seed: AtsTargetCandidateGenerationSeed,
): NormalizedSeed | null => {
  const companyName = seed.companyName.trim();
  if (companyName.length === 0) {
    return null;
  }

  const normalizedTokens = trimCorporateSuffixes(toWordTokens(companyName));
  const normalizedCompanyName =
    normalizedTokens.length > 0
      ? normalizedTokens.join(' ')
      : sanitizeForWords(companyName);

  if (normalizedCompanyName.length === 0) {
    return null;
  }

  return {
    companyName,
    normalizedCompanyName,
    websiteDomain: seed.websiteDomain?.trim() || null,
    sourceProvenance:
      seed.sourceProvenance?.trim() || 'deterministic_company_seed_generation',
  };
};

const normalizeIncludeVendors = (
  includeVendors: AtsTargetCandidateGenerationOptions['includeVendors'],
): SupportedCandidateVendor[] => {
  if (!includeVendors || includeVendors.length === 0) {
    return [...supportedVendors];
  }

  return uniqueInOrder(
    includeVendors.filter(
      (vendor): vendor is SupportedCandidateVendor =>
        vendor === 'greenhouse' || vendor === 'lever',
    ),
  );
};

const normalizeMaxCandidatesPerVendor = (value: number | undefined): number => {
  if (value === undefined) {
    return Number.POSITIVE_INFINITY;
  }

  if (!Number.isSafeInteger(value) || value < 1) {
    return Number.POSITIVE_INFINITY;
  }

  return value;
};

const sortSeeds = (seeds: NormalizedSeed[]): NormalizedSeed[] =>
  [...seeds].sort((left, right) => {
    if (left.normalizedCompanyName !== right.normalizedCompanyName) {
      return left.normalizedCompanyName.localeCompare(right.normalizedCompanyName);
    }

    if (left.companyName !== right.companyName) {
      return left.companyName.localeCompare(right.companyName);
    }

    if (left.sourceProvenance !== right.sourceProvenance) {
      return left.sourceProvenance.localeCompare(right.sourceProvenance);
    }

    return (left.websiteDomain ?? '').localeCompare(right.websiteDomain ?? '');
  });

const identifierTypeByVendor: Record<SupportedCandidateVendor, 'board_token' | 'handle'> = {
  greenhouse: 'board_token',
  lever: 'handle',
};

const isSupportedVendor = (vendor: AtsVendor): vendor is SupportedCandidateVendor =>
  vendor === 'greenhouse' || vendor === 'lever';

export const generateAtsTargetCandidatesFromCompanySeeds = (
  options: AtsTargetCandidateGenerationOptions,
): AtsTargetCandidate[] => {
  const normalizedSeeds = sortSeeds(
    options.companySeeds
      .map((seed) => normalizeSeed(seed))
      .filter((seed): seed is NormalizedSeed => seed !== null),
  );

  const includeVendors = normalizeIncludeVendors(options.includeVendors);
  if (normalizedSeeds.length === 0 || includeVendors.length === 0) {
    return [];
  }

  const maxCandidatesPerVendor = normalizeMaxCandidatesPerVendor(
    options.maxCandidatesPerVendor,
  );

  const seenByVendor = new Map<SupportedCandidateVendor, Set<string>>();
  const countByVendor = new Map<SupportedCandidateVendor, number>();
  for (const vendor of includeVendors) {
    seenByVendor.set(vendor, new Set<string>());
    countByVendor.set(vendor, 0);
  }

  const candidates: AtsTargetCandidate[] = [];

  for (const seed of normalizedSeeds) {
    const candidateValues = deriveCandidateValues(seed);
    for (const identifierValue of candidateValues) {
      for (const vendor of includeVendors) {
        if (!isSupportedVendor(vendor)) {
          continue;
        }

        const currentCount = countByVendor.get(vendor) ?? 0;
        if (currentCount >= maxCandidatesPerVendor) {
          continue;
        }

        const seen = seenByVendor.get(vendor);
        if (!seen || seen.has(identifierValue)) {
          continue;
        }

        seen.add(identifierValue);
        countByVendor.set(vendor, currentCount + 1);

        candidates.push({
          atsVendor: vendor,
          identifierType: identifierTypeByVendor[vendor],
          identifierValue,
          companyName: seed.companyName,
          normalizedCompanyName: seed.normalizedCompanyName,
          sourceProvenance: seed.sourceProvenance,
        });
      }
    }
  }

  return candidates;
};
