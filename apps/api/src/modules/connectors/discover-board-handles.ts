import {
  deriveBoardHandleCandidatesFromCompanyName,
  extractCompanyNamesFromArbeitnowPayload,
} from './board-handle-discovery.js';

const defaultArbeitnowApiUrl = 'https://www.arbeitnow.com/api/job-board-api?limit=100';
const defaultGreenhouseApiBase = 'https://boards-api.greenhouse.io/v1/boards';
const defaultLeverApiBase = 'https://api.lever.co/v0/postings';

const parsePositiveInt = (value: string | undefined, fallbackValue: number): number => {
  if (!value) {
    return fallbackValue;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return fallbackValue;
  }

  return parsed;
};

const parseCsv = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const requestJsonWithTimeout = async (
  input: string,
  timeoutMs: number,
): Promise<{ status: number; body: unknown }> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(input, {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
      signal: controller.signal,
    });

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    return {
      status: response.status,
      body,
    };
  } finally {
    clearTimeout(timeout);
  }
};

const fetchArbeitnowCompanyNames = async (options: {
  startUrl: string;
  maxPages: number;
  timeoutMs: number;
}): Promise<string[]> => {
  const names: string[] = [];
  const seenNames = new Set<string>();
  let nextUrl: string | null = options.startUrl;

  for (let pageIndex = 0; pageIndex < options.maxPages; pageIndex += 1) {
    if (!nextUrl) {
      break;
    }

    const response = await requestJsonWithTimeout(nextUrl, options.timeoutMs);
    if (response.status !== 200) {
      break;
    }

    const extracted = extractCompanyNamesFromArbeitnowPayload(response.body);
    for (const name of extracted) {
      const key = name.toLowerCase();
      if (seenNames.has(key)) {
        continue;
      }

      seenNames.add(key);
      names.push(name);
    }

    const root = response.body;
    const links =
      typeof root === 'object' && root !== null && !Array.isArray(root)
        ? (root as Record<string, unknown>).links
        : null;
    const next =
      typeof links === 'object' && links !== null && !Array.isArray(links)
        ? (links as Record<string, unknown>).next
        : null;

    nextUrl = typeof next === 'string' && next.length > 0 ? next : null;
  }

  return names;
};

const probeGreenhouseToken = async (
  token: string,
  timeoutMs: number,
): Promise<boolean> => {
  const endpoint = new URL(
    `${defaultGreenhouseApiBase}/${encodeURIComponent(token)}/jobs`,
  );
  endpoint.searchParams.set('content', 'false');

  try {
    const response = await requestJsonWithTimeout(endpoint.toString(), timeoutMs);
    return response.status === 200;
  } catch {
    return false;
  }
};

const probeLeverHandle = async (
  handle: string,
  timeoutMs: number,
): Promise<boolean> => {
  const endpoint = new URL(
    `${defaultLeverApiBase}/${encodeURIComponent(handle)}`,
  );
  endpoint.searchParams.set('mode', 'json');

  try {
    const response = await requestJsonWithTimeout(endpoint.toString(), timeoutMs);
    return response.status === 200;
  } catch {
    return false;
  }
};

const probeCandidates = async (
  candidates: string[],
  options: {
    timeoutMs: number;
    concurrency: number;
    mode: 'greenhouse' | 'lever';
  },
): Promise<string[]> => {
  const valid: string[] = [];
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= candidates.length) {
        return;
      }

      const candidate = candidates[currentIndex];
      if (!candidate) {
        continue;
      }

      const isValid =
        options.mode === 'greenhouse'
          ? await probeGreenhouseToken(candidate, options.timeoutMs)
          : await probeLeverHandle(candidate, options.timeoutMs);

      if (isValid) {
        valid.push(candidate);
      }
    }
  };

  const workers = Array.from({ length: options.concurrency }, () => worker());
  await Promise.all(workers);

  return [...new Set(valid)].sort();
};

const main = async (): Promise<void> => {
  const maxPages = parsePositiveInt(process.env.BOARD_DISCOVERY_MAX_PAGES, 6);
  const maxCandidates = parsePositiveInt(process.env.BOARD_DISCOVERY_MAX_CANDIDATES, 600);
  const timeoutMs = parsePositiveInt(process.env.BOARD_DISCOVERY_TIMEOUT_MS, 6000);
  const concurrency = parsePositiveInt(process.env.BOARD_DISCOVERY_CONCURRENCY, 16);

  const envCompanySeeds = parseCsv(process.env.BOARD_DISCOVERY_COMPANIES);
  const arbeitnowCompanySeeds = await fetchArbeitnowCompanyNames({
    startUrl: process.env.BOARD_DISCOVERY_ARBEITNOW_URL ?? defaultArbeitnowApiUrl,
    maxPages,
    timeoutMs,
  });

  const seenCompanies = new Set<string>();
  const allCompanySeeds: string[] = [];

  for (const name of [...envCompanySeeds, ...arbeitnowCompanySeeds]) {
    const key = name.toLowerCase();
    if (seenCompanies.has(key)) {
      continue;
    }

    seenCompanies.add(key);
    allCompanySeeds.push(name);
  }

  const candidateSet = new Set<string>();
  for (const companyName of allCompanySeeds) {
    const candidates = deriveBoardHandleCandidatesFromCompanyName(companyName);
    for (const candidate of candidates) {
      if (candidateSet.size >= maxCandidates) {
        break;
      }
      candidateSet.add(candidate);
    }

    if (candidateSet.size >= maxCandidates) {
      break;
    }
  }

  const candidates = [...candidateSet];
  const [greenhouseTokens, leverHandles] = await Promise.all([
    probeCandidates(candidates, {
      mode: 'greenhouse',
      timeoutMs,
      concurrency,
    }),
    probeCandidates(candidates, {
      mode: 'lever',
      timeoutMs,
      concurrency,
    }),
  ]);

  const result = {
    discoveryConfig: {
      maxPages,
      maxCandidates,
      timeoutMs,
      concurrency,
    },
    companySeeds: {
      fromEnv: envCompanySeeds.length,
      fromArbeitnow: arbeitnowCompanySeeds.length,
      totalUnique: allCompanySeeds.length,
    },
    candidateCount: candidates.length,
    greenhouse: {
      count: greenhouseTokens.length,
      tokens: greenhouseTokens,
      env: `GREENHOUSE_BOARD_TOKENS=${greenhouseTokens.join(',')}`,
    },
    lever: {
      count: leverHandles.length,
      handles: leverHandles,
      env: `LEVER_COMPANY_HANDLES=${leverHandles.join(',')}`,
    },
  };

  console.log(JSON.stringify(result, null, 2));
};

void main();
