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
]);

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

const uniqueInOrder = (values: string[]): string[] => {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    deduped.push(value);
  }

  return deduped;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

export const deriveBoardHandleCandidatesFromCompanyName = (
  companyName: string,
): string[] => {
  const tokens = toWordTokens(companyName);
  if (tokens.length === 0) {
    return [];
  }

  const withoutSuffixes = trimCorporateSuffixes(tokens);
  const base = withoutSuffixes.length > 0 ? withoutSuffixes : tokens;

  const candidates = [
    base.join(''),
    base.join('-'),
    base.join('_'),
    tokens.join(''),
    tokens.join('-'),
    tokens.join('_'),
  ]
    .map((value) => normalizeCandidate(value))
    .filter((value): value is string => value !== null);

  return uniqueInOrder(candidates);
};

export const extractCompanyNamesFromArbeitnowPayload = (
  payload: unknown,
): string[] => {
  const root = asRecord(payload);
  if (!root) {
    return [];
  }

  const data = root.data;
  if (!Array.isArray(data)) {
    return [];
  }

  const names: string[] = [];

  for (const item of data) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }

    const companyName = record.company_name;
    if (typeof companyName !== 'string') {
      continue;
    }

    const trimmed = companyName.trim();
    if (trimmed.length === 0) {
      continue;
    }

    names.push(trimmed);
  }

  return uniqueInOrder(names);
};
