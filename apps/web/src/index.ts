import { Buffer } from 'node:buffer';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { pathToFileURL } from 'node:url';

import {
  authSessionSchema,
  canonicalJobIdSchema,
  canonicalRebuildResponseSchema,
  connectorSyncResponseSchema,
  feedDetailResponseSchema,
  feedResponseSchema,
  userPreferencesSchema,
  userProfileSchema,
  type FeedDetailResponse,
  type FeedJobCard,
  type MatchScoreArtifact,
  type RemotePreference,
  type UserPreferences,
  type UserProfile,
} from '@job-hunter/shared';

const defaultWebPort = Number(process.env.WEB_PORT ?? 3000);

const accessTokenCookieName = 'jh_access_token';
const sessionCookieMaxAgeSeconds = 60 * 60 * 24 * 30;
const formBodyLimitBytes = 32_000;
const upstreamTimeoutMs = 10_000;

type RemoteFilter = 'aligned' | 'any' | 'remote' | 'hybrid' | 'onsite';
type RecommendationFilter = 'all' | 'apply' | 'review' | 'skip' | 'unscored';
type FeedSort = 'fit' | 'recent' | 'salary';

interface FeedQueryState {
  q: string;
  recommendation: RecommendationFilter;
  remote: RemoteFilter;
  sort: FeedSort;
  includeHidden: boolean;
}

interface CreateWebServerOptions {
  apiBaseUrl?: string;
}

interface ApiRequestError {
  status: number;
  code: string;
  message: string;
}

type ApiResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: ApiRequestError;
    };

interface SafeParseSchema<T> {
  safeParse: (value: unknown) =>
    | { success: true; data: T }
    | {
        success: false;
        error: {
          issues: Array<{
            path: (string | number)[];
            message: string;
          }>;
        };
      };
}

interface AuthSessionEnvelope {
  accessToken: string;
  userEmail: string;
}

const defaultFeedQueryState: FeedQueryState = {
  q: '',
  recommendation: 'all',
  remote: 'aligned',
  sort: 'fit',
  includeHidden: false,
};

const recommendationOrder: Record<'apply' | 'review' | 'skip' | 'unscored', number> = {
  apply: 3,
  review: 2,
  skip: 1,
  unscored: 0,
};

const recommendationLabel: Record<'apply' | 'review' | 'skip' | 'unscored', string> = {
  apply: 'apply',
  review: 'review',
  skip: 'skip',
  unscored: 'unscored',
};

const noticeMessages: Record<string, string> = {
  signed_in: 'Signed in successfully.',
  account_created: 'Account created. You are now signed in.',
  sync_complete: 'Source sync completed.',
  sync_partial: 'Source sync completed with one or more source errors.',
  rebuild_complete: 'Canonical catalog rebuild completed.',
};

const authErrorMessages: Record<string, string> = {
  missing_access_token: 'Sign in to continue.',
  invalid_access_token: 'Session expired. Sign in again.',
  invalid_authorization_header: 'Session expired. Sign in again.',
  user_not_found: 'No account found for this email. Create one first.',
  email_already_registered:
    'Email already exists. Choose Sign in if you already have an account.',
  invalid_request_body: 'Email is required and must be valid.',
  upstream_timeout: 'The API timed out. Try again.',
  upstream_unreachable: 'API is unreachable. Confirm the API server is running.',
  invalid_api_contract: 'API response schema mismatch. Check API and shared contracts.',
};

const feedErrorMessages: Record<string, string> = {
  missing_access_token: 'Sign in to continue.',
  invalid_access_token: 'Session expired. Sign in again.',
  invalid_authorization_header: 'Session expired. Sign in again.',
  invalid_canonical_job_id: 'The selected job id is invalid.',
  canonical_job_not_found: 'This job was not found.',
  upstream_timeout: 'The API timed out while loading data.',
  upstream_unreachable: 'API is unreachable. Confirm the API server is running.',
  invalid_api_contract: 'API response schema mismatch. Check API and shared contracts.',
};

const baseStyles = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;600&display=swap');

:root {
  --bg-start: #f5efe6;
  --bg-end: #e7f2f1;
  --card: rgba(255, 255, 255, 0.84);
  --card-strong: rgba(255, 255, 255, 0.95);
  --ink: #1a2a2a;
  --muted: #4b6563;
  --teal: #0f766e;
  --teal-soft: #cce7e5;
  --amber: #b45309;
  --amber-soft: #fde9d0;
  --rose: #b4232f;
  --rose-soft: #fbd5d9;
  --shadow: 0 16px 40px rgba(20, 46, 45, 0.12);
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
}

body {
  min-height: 100vh;
  color: var(--ink);
  background:
    radial-gradient(70rem 70rem at 0% -15%, rgba(15, 118, 110, 0.18), transparent 70%),
    radial-gradient(60rem 60rem at 100% -10%, rgba(180, 83, 9, 0.14), transparent 70%),
    linear-gradient(150deg, var(--bg-start), var(--bg-end));
  font-family: 'Space Grotesk', system-ui, sans-serif;
}

.shell {
  width: min(1120px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 1.25rem 0 2rem;
}

.masthead {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.2rem;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(17, 94, 89, 0.95), rgba(12, 70, 67, 0.95));
  color: #f3fcfb;
  box-shadow: var(--shadow);
  animation: rise 420ms ease;
}

.brand {
  display: grid;
  gap: 0.2rem;
}

.brand h1,
.brand p {
  margin: 0;
}

.brand h1 {
  letter-spacing: 0.03em;
  font-size: clamp(1.1rem, 2.2vw, 1.5rem);
}

.brand p {
  color: rgba(220, 252, 250, 0.86);
  font-size: 0.92rem;
}

.mono {
  font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}

.actions {
  display: flex;
  gap: 0.55rem;
  align-items: center;
  flex-wrap: wrap;
}

.actions form {
  margin: 0;
}

main {
  margin-top: 1rem;
  display: grid;
  gap: 1rem;
}

.panel {
  background: var(--card);
  border: 1px solid rgba(20, 68, 65, 0.12);
  border-radius: 16px;
  box-shadow: var(--shadow);
  padding: 1rem;
  animation: rise 440ms ease;
}

.panel h2,
.panel h3,
.panel p {
  margin-top: 0;
}

.grid {
  display: grid;
  gap: 0.8rem;
}

.controls {
  grid-template-columns: repeat(6, minmax(0, 1fr));
  align-items: end;
}

.controls .full {
  grid-column: span 2;
}

.controls .wide {
  grid-column: span 3;
}

label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.86rem;
  color: var(--muted);
}

input,
select,
button,
.link-button {
  font: inherit;
}

input,
select {
  border: 1px solid rgba(25, 77, 74, 0.2);
  background: var(--card-strong);
  color: var(--ink);
  border-radius: 10px;
  padding: 0.58rem 0.62rem;
}

input:focus,
select:focus,
button:focus,
.link-button:focus {
  outline: 2px solid rgba(15, 118, 110, 0.4);
  outline-offset: 2px;
}

button,
.link-button {
  border: none;
  border-radius: 10px;
  cursor: pointer;
  padding: 0.6rem 0.8rem;
  font-weight: 600;
  background: linear-gradient(135deg, #0f766e, #125b56);
  color: #f4fbfb;
  text-decoration: none;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  transition: transform 120ms ease, opacity 120ms ease;
}

button.secondary,
.link-button.secondary {
  background: linear-gradient(135deg, #9a4e13, #7f3f0f);
}

button.ghost {
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.28);
}

button:hover,
.link-button:hover {
  transform: translateY(-1px);
}

button[disabled] {
  cursor: progress;
  opacity: 0.78;
}

.flash {
  border-radius: 12px;
  padding: 0.7rem 0.85rem;
  font-size: 0.94rem;
  border: 1px solid transparent;
}

.flash.notice {
  background: var(--teal-soft);
  border-color: rgba(15, 118, 110, 0.28);
}

.flash.error {
  background: var(--rose-soft);
  border-color: rgba(180, 35, 47, 0.24);
}

.summary-strip {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.6rem;
  align-items: center;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 0.9rem;
}

.job-card {
  border-radius: 16px;
  border: 1px solid rgba(13, 78, 73, 0.13);
  background: var(--card-strong);
  padding: 0.9rem;
  display: grid;
  gap: 0.65rem;
  animation: rise 470ms ease both;
}

.job-card:nth-child(2n) {
  animation-delay: 60ms;
}

.job-card:nth-child(3n) {
  animation-delay: 110ms;
}

.job-card h3,
.job-card p {
  margin: 0;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.chip {
  border-radius: 999px;
  font-size: 0.75rem;
  padding: 0.22rem 0.5rem;
  background: rgba(15, 118, 110, 0.14);
  color: #0f5751;
}

.chip.warn {
  background: var(--amber-soft);
  color: #7f3f0f;
}

.score-box {
  border-radius: 12px;
  padding: 0.62rem;
  background: rgba(240, 252, 251, 0.8);
  border: 1px solid rgba(15, 118, 110, 0.14);
}

.score-value {
  font-size: 1.38rem;
  line-height: 1;
  margin-right: 0.5rem;
}

.recommendation {
  font-size: 0.76rem;
  padding: 0.2rem 0.45rem;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.recommendation.apply {
  background: rgba(15, 118, 110, 0.17);
  color: #0e625b;
}

.recommendation.review {
  background: rgba(180, 83, 9, 0.18);
  color: #8a430e;
}

.recommendation.skip {
  background: rgba(180, 35, 47, 0.16);
  color: #902232;
}

.recommendation.unscored {
  background: rgba(75, 101, 99, 0.2);
  color: #2e4a48;
}

.muted {
  color: var(--muted);
}

.skill-list,
.stack-list,
.event-list,
.mapping-list {
  margin: 0;
  padding-left: 1rem;
}

.detail-layout {
  display: grid;
  gap: 1rem;
  grid-template-columns: 1.1fr 0.9fr;
}

.meter-row {
  display: grid;
  gap: 0.35rem;
  margin-bottom: 0.45rem;
}

.meter-track {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: rgba(15, 118, 110, 0.15);
  overflow: hidden;
}

.meter-fill {
  height: 100%;
  background: linear-gradient(90deg, #0f766e, #18998d);
}

.empty {
  border-style: dashed;
  border-color: rgba(20, 68, 65, 0.26);
  text-align: center;
  padding: 1.3rem;
  border-radius: 14px;
}

.sticky-tools {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.footnote {
  margin-top: 1rem;
  font-size: 0.82rem;
  color: var(--muted);
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 980px) {
  .controls {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .controls .full,
  .controls .wide {
    grid-column: span 2;
  }

  .detail-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 620px) {
  .shell {
    width: calc(100% - 1rem);
  }

  .masthead {
    padding: 0.85rem;
  }

  .actions {
    width: 100%;
  }

  .actions form,
  .actions button {
    width: 100%;
  }

  .cards {
    grid-template-columns: 1fr;
  }
}
`;

const enhancementScript = `
(() => {
  const forms = document.querySelectorAll('form[data-pending-label]');
  for (const form of forms) {
    form.addEventListener('submit', (event) => {
      const submitter = event.submitter;
      if (!(submitter instanceof HTMLButtonElement)) {
        return;
      }

      const pendingLabel = submitter.dataset.pendingLabel || 'Working...';
      submitter.dataset.originalLabel = submitter.textContent || '';
      submitter.textContent = pendingLabel;
      submitter.disabled = true;
      document.body.style.cursor = 'progress';
    });
  }
})();
`;

const resolveApiBaseUrl = (options: CreateWebServerOptions): string => {
  if (options.apiBaseUrl) {
    return options.apiBaseUrl;
  }

  if (process.env.API_BASE_URL) {
    return process.env.API_BASE_URL;
  }

  const apiPort = process.env.API_PORT ?? '3001';
  return `http://localhost:${apiPort}`;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const humanizeToken = (value: string): string =>
  value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());

const formatDateTime = (iso: string): string => {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) {
    return iso;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(timestamp));
};

const formatCurrency = (
  amount: number | null,
  currency: string | null,
): string | null => {
  if (amount === null) {
    return null;
  }

  const normalizedCurrency = currency ?? 'USD';

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalizedCurrency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${normalizedCurrency} ${amount.toLocaleString('en-US')}`;
  }
};

const formatSalaryBand = (job: FeedJobCard['job']): string => {
  const min = formatCurrency(job.salaryMin, job.salaryCurrency);
  const max = formatCurrency(job.salaryMax, job.salaryCurrency);
  const period = job.salaryPeriod ? ` / ${job.salaryPeriod}` : '';

  if (!min && !max) {
    return 'not listed';
  }

  if (min && max) {
    return `${min} - ${max}${period}`;
  }

  return `${min ?? max}${period}`;
};

const readFormBody = async (req: IncomingMessage): Promise<URLSearchParams> => {
  let body = '';
  let settled = false;

  return new Promise<URLSearchParams>((resolve, reject) => {
    req.setEncoding('utf8');

    req.on('data', (chunk: string) => {
      if (settled) {
        return;
      }

      body += chunk;

      if (Buffer.byteLength(body, 'utf8') > formBodyLimitBytes) {
        settled = true;
        reject(new Error('form_body_too_large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(new URLSearchParams(body));
    });

    req.on('error', (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    });
  });
};

const parseCookies = (req: IncomingMessage): Record<string, string> => {
  const header = req.headers.cookie;
  if (!header) {
    return {};
  }

  const entries = header
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex < 0) {
        return [part, ''] as const;
      }

      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      return [key, decodeURIComponent(value)] as const;
    });

  return Object.fromEntries(entries);
};

const serializeCookie = (name: string, value: string, maxAgeSeconds: number): string => {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (process.env.NODE_ENV === 'production') {
    attributes.push('Secure');
  }

  return attributes.join('; ');
};

const clearAccessTokenCookie = (): string =>
  serializeCookie(accessTokenCookieName, '', 0);

const sendHtml = (res: ServerResponse, statusCode: number, html: string): void => {
  res.writeHead(statusCode, {
    'content-type': 'text/html; charset=utf-8',
  });
  res.end(html);
};

const sendJson = (
  res: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
): void => {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(payload));
};

const redirect = (
  res: ServerResponse,
  location: string,
  cookies: string[] = [],
): void => {
  const headers: Record<string, string | string[]> = {
    location,
  };

  if (cookies.length > 0) {
    headers['set-cookie'] = cookies;
  }

  res.writeHead(303, headers);
  res.end();
};

const normalizeReturnPath = (raw: string | null): string => {
  if (!raw) {
    return '/';
  }

  if (!raw.startsWith('/')) {
    return '/';
  }

  if (raw.startsWith('//')) {
    return '/';
  }

  return raw;
};

const withQueryParam = (path: string, key: string, value: string): string => {
  const url = new URL(path, 'http://localhost');
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
};

const parseFeedQuery = (requestUrl: URL): FeedQueryState => {
  const recommendation = requestUrl.searchParams.get('recommendation');
  const remote = requestUrl.searchParams.get('remote');
  const sort = requestUrl.searchParams.get('sort');

  return {
    q: (requestUrl.searchParams.get('q') ?? '').trim().slice(0, 120),
    recommendation:
      recommendation === 'apply' ||
      recommendation === 'review' ||
      recommendation === 'skip' ||
      recommendation === 'unscored'
        ? recommendation
        : defaultFeedQueryState.recommendation,
    remote:
      remote === 'aligned' ||
      remote === 'any' ||
      remote === 'remote' ||
      remote === 'hybrid' ||
      remote === 'onsite'
        ? remote
        : defaultFeedQueryState.remote,
    sort:
      sort === 'recent' || sort === 'salary' ? sort : defaultFeedQueryState.sort,
    includeHidden: requestUrl.searchParams.get('includeHidden') === '1',
  };
};

const buildFeedReturnPath = (query: FeedQueryState): string => {
  const params = new URLSearchParams();

  if (query.q.length > 0) {
    params.set('q', query.q);
  }

  if (query.recommendation !== defaultFeedQueryState.recommendation) {
    params.set('recommendation', query.recommendation);
  }

  if (query.remote !== defaultFeedQueryState.remote) {
    params.set('remote', query.remote);
  }

  if (query.sort !== defaultFeedQueryState.sort) {
    params.set('sort', query.sort);
  }

  if (query.includeHidden) {
    params.set('includeHidden', '1');
  }

  const queryString = params.toString();
  return queryString.length > 0 ? `/?${queryString}` : '/';
};

const getApiErrorCode = (payload: unknown, statusCode: number): string => {
  const record = asRecord(payload);
  if (!record) {
    return `http_${statusCode}`;
  }

  const maybeErrorCode = record.error;
  if (typeof maybeErrorCode === 'string' && maybeErrorCode.length > 0) {
    return maybeErrorCode;
  }

  return `http_${statusCode}`;
};

const requestApi = async <T>(
  apiBaseUrl: string,
  pathname: string,
  init: RequestInit,
  schema: SafeParseSchema<T> | null,
  accessToken?: string,
): Promise<ApiResult<T>> => {
  const url = new URL(pathname, apiBaseUrl);
  const headers = new Headers(init.headers ?? {});

  if (!headers.has('accept')) {
    headers.set('accept', 'application/json');
  }

  if (accessToken) {
    headers.set('authorization', `Bearer ${accessToken}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, upstreamTimeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') ?? '';
    let payload: unknown = null;

    if (contentType.includes('application/json')) {
      payload = await response.json();
    } else {
      const textBody = await response.text();
      payload = textBody.length > 0 ? { message: textBody } : null;
    }

    if (!response.ok) {
      const code = getApiErrorCode(payload, response.status);
      return {
        ok: false,
        error: {
          status: response.status,
          code,
          message: humanizeToken(code),
        },
      };
    }

    if (!schema) {
      return {
        ok: true,
        data: payload as T,
      };
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          status: 502,
          code: 'invalid_api_contract',
          message: 'API response validation failed.',
        },
      };
    }

    return {
      ok: true,
      data: parsed.data,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        ok: false,
        error: {
          status: 504,
          code: 'upstream_timeout',
          message: 'API request timed out.',
        },
      };
    }

    return {
      ok: false,
      error: {
        status: 502,
        code: 'upstream_unreachable',
        message: 'API request failed.',
      },
    };
  } finally {
    clearTimeout(timeout);
  }
};

const parseAuthSessionEnvelope = (payload: unknown): AuthSessionEnvelope | null => {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  const parsed = authSessionSchema.safeParse(record.session);
  if (!parsed.success) {
    return null;
  }

  return {
    accessToken: parsed.data.accessToken,
    userEmail: parsed.data.user.email,
  };
};

const parseProfileEnvelope = (payload: unknown): UserProfile | null => {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  const parsed = userProfileSchema.safeParse(record.profile);
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
};

const parsePreferencesEnvelope = (payload: unknown): UserPreferences | null => {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  const parsed = userPreferencesSchema.safeParse(record.preferences);
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
};

const buildFallbackPreferences = (profile: UserProfile): UserPreferences => ({
  userId: profile.userId,
  preferredTitles: [],
  preferredIndustries: [],
  preferredSkills: [],
  preferredLocations: [],
  remotePreference: 'flexible',
  targetSeniorityMin: null,
  targetSeniorityMax: null,
  salaryMin: null,
  salaryTarget: null,
  dealBreakers: [],
  hiddenCompanies: [],
  hiddenTitles: [],
  stretchPreferenceLevel: 3,
  notificationPreferences: {
    dailyDigest: false,
    weeklyDigest: false,
    instantHighFit: false,
  },
  createdAt: profile.createdAt,
  updatedAt: profile.updatedAt,
});

const fetchProfile = async (
  apiBaseUrl: string,
  accessToken: string,
): Promise<ApiResult<UserProfile>> => {
  const response = await requestApi<unknown>(
    apiBaseUrl,
    '/v1/profile',
    {
      method: 'GET',
    },
    null,
    accessToken,
  );

  if (!response.ok) {
    return response;
  }

  const profile = parseProfileEnvelope(response.data);
  if (!profile) {
    return {
      ok: false,
      error: {
        status: 502,
        code: 'invalid_api_contract',
        message: 'Profile response schema mismatch.',
      },
    };
  }

  return {
    ok: true,
    data: profile,
  };
};

const fetchPreferences = async (
  apiBaseUrl: string,
  accessToken: string,
): Promise<ApiResult<UserPreferences>> => {
  const response = await requestApi<unknown>(
    apiBaseUrl,
    '/v1/preferences',
    {
      method: 'GET',
    },
    null,
    accessToken,
  );

  if (!response.ok) {
    return response;
  }

  const preferences = parsePreferencesEnvelope(response.data);
  if (!preferences) {
    return {
      ok: false,
      error: {
        status: 502,
        code: 'invalid_api_contract',
        message: 'Preferences response schema mismatch.',
      },
    };
  }

  return {
    ok: true,
    data: preferences,
  };
};

const matchesRemotePreference = (
  remoteType: string,
  preference: RemotePreference,
): boolean => {
  if (preference === 'flexible') {
    return remoteType === 'remote' || remoteType === 'hybrid' || remoteType === 'onsite';
  }

  return remoteType === preference;
};

const matchesRemoteFilter = (
  remoteType: FeedJobCard['job']['remoteType'],
  filter: RemoteFilter,
  preferences: UserPreferences,
): boolean => {
  if (filter === 'any') {
    return true;
  }

  if (filter === 'aligned') {
    return matchesRemotePreference(remoteType, preferences.remotePreference);
  }

  return remoteType === filter;
};

const isHiddenByPreferences = (
  item: FeedJobCard,
  preferences: UserPreferences,
): boolean => {
  const company = item.job.canonicalCompanyName.toLowerCase();
  const title = item.job.canonicalTitle.toLowerCase();

  const hiddenCompanyHit = preferences.hiddenCompanies.some((value) =>
    company.includes(value.toLowerCase()),
  );
  if (hiddenCompanyHit) {
    return true;
  }

  return preferences.hiddenTitles.some((value) => title.includes(value.toLowerCase()));
};

const getRecommendation = (
  artifact: MatchScoreArtifact | null,
): 'apply' | 'review' | 'skip' | 'unscored' => {
  if (!artifact) {
    return 'unscored';
  }

  return artifact.recommendation;
};

const matchesRecommendation = (
  item: FeedJobCard,
  filter: RecommendationFilter,
): boolean => {
  if (filter === 'all') {
    return true;
  }

  return getRecommendation(item.latestScoreArtifact) === filter;
};

const matchesSearch = (item: FeedJobCard, query: string): boolean => {
  if (query.length === 0) {
    return true;
  }

  const haystack = [
    item.job.canonicalTitle,
    item.job.canonicalCompanyName,
    item.job.normalizedLocation ?? '',
    ...item.job.topSkills,
  ]
    .join(' ')
    .toLowerCase();

  const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 0);
  return terms.every((term) => haystack.includes(term));
};

const compareIsoDatesDesc = (leftIso: string, rightIso: string): number => {
  const left = Date.parse(leftIso);
  const right = Date.parse(rightIso);
  return right - left;
};

const compareFeedByFit = (left: FeedJobCard, right: FeedJobCard): number => {
  const leftRec = getRecommendation(left.latestScoreArtifact);
  const rightRec = getRecommendation(right.latestScoreArtifact);

  const recommendationDelta = recommendationOrder[rightRec] - recommendationOrder[leftRec];
  if (recommendationDelta !== 0) {
    return recommendationDelta;
  }

  const leftScore = left.latestScoreArtifact?.scoreBreakdown.overallScore ?? -1;
  const rightScore = right.latestScoreArtifact?.scoreBreakdown.overallScore ?? -1;
  if (rightScore !== leftScore) {
    return rightScore - leftScore;
  }

  return compareIsoDatesDesc(left.job.lastSeenAt, right.job.lastSeenAt);
};

const compareFeedByRecent = (left: FeedJobCard, right: FeedJobCard): number =>
  compareIsoDatesDesc(left.job.lastSeenAt, right.job.lastSeenAt);

const compareFeedBySalary = (left: FeedJobCard, right: FeedJobCard): number => {
  const leftSalary = left.job.salaryMax ?? left.job.salaryMin ?? -1;
  const rightSalary = right.job.salaryMax ?? right.job.salaryMin ?? -1;

  if (rightSalary !== leftSalary) {
    return rightSalary - leftSalary;
  }

  return compareFeedByFit(left, right);
};

const applyFeedFilters = (
  items: FeedJobCard[],
  query: FeedQueryState,
  preferences: UserPreferences,
): FeedJobCard[] => {
  const filtered = items.filter((item) => {
    if (!query.includeHidden && isHiddenByPreferences(item, preferences)) {
      return false;
    }

    if (!matchesRecommendation(item, query.recommendation)) {
      return false;
    }

    if (!matchesRemoteFilter(item.job.remoteType, query.remote, preferences)) {
      return false;
    }

    return matchesSearch(item, query.q);
  });

  if (query.sort === 'recent') {
    return filtered.sort(compareFeedByRecent);
  }

  if (query.sort === 'salary') {
    return filtered.sort(compareFeedBySalary);
  }

  return filtered.sort(compareFeedByFit);
};

const countHiddenItems = (items: FeedJobCard[], preferences: UserPreferences): number =>
  items.filter((item) => isHiddenByPreferences(item, preferences)).length;

const renderFlash = (
  message: string,
  type: 'notice' | 'error',
): string => `<p class="flash ${type}">${escapeHtml(message)}</p>`;

const renderPage = (title: string, body: string): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>${baseStyles}</style>
  </head>
  <body>
    <div class="shell">${body}</div>
    <script>${enhancementScript}</script>
  </body>
</html>`;

const renderAuthPage = (authError: string | null, email: string, returnTo: string): string => {
  const errorMessage = authError ? authErrorMessages[authError] ?? humanizeToken(authError) : null;

  const flash = errorMessage ? renderFlash(errorMessage, 'error') : '';

  const body = `
    <header class="masthead">
      <div class="brand">
        <h1>Job Hunter Feed Console</h1>
        <p>Step 6 discovery UI: authenticated feed and explainable detail views.</p>
      </div>
    </header>
    <main>
      ${flash}
      <section class="panel">
        <h2>Sign in to your feed</h2>
        <p class="muted">Use the same email from the API auth routes. The UI will fetch your preferences, canonical feed, and score context.</p>
        <form method="POST" action="/session" class="grid" data-pending-label>
          <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}" />
          <label>
            Email
            <input
              name="email"
              type="email"
              required
              autocomplete="email"
              value="${escapeHtml(email)}"
              placeholder="you@example.com"
            />
          </label>
          <div class="sticky-tools">
            <button type="submit" name="mode" value="login" data-pending-label="Signing in...">Sign in</button>
            <button
              type="submit"
              name="mode"
              value="register"
              class="secondary"
              data-pending-label="Creating account..."
            >
              Create account
            </button>
          </div>
        </form>
        <p class="footnote mono">Expected API base: ${escapeHtml(resolveApiBaseUrl({}))}</p>
      </section>
    </main>
  `;

  return renderPage('Job Hunter | Sign in', body);
};

const renderJobCard = (item: FeedJobCard, returnTo: string): string => {
  const recommendation = getRecommendation(item.latestScoreArtifact);
  const recommendationClass = recommendationLabel[recommendation];
  const overallScore = item.latestScoreArtifact?.scoreBreakdown.overallScore;

  const scoreBox = item.latestScoreArtifact
    ? `<div class="score-box">
        <p>
          <span class="score-value mono">${overallScore?.toFixed(1)}</span>
          <span class="recommendation ${recommendationClass}">${recommendationClass}</span>
        </p>
        <p class="muted">${escapeHtml(
          item.latestScoreArtifact.strengths.slice(0, 2).join(' | ') || 'No strength highlights yet.',
        )}</p>
      </div>`
    : `<div class="score-box"><p class="muted">No score artifact yet. Use API score routes to enrich recommendation context.</p></div>`;

  const topSkills = item.job.topSkills.slice(0, 6);

  const detailsHref = `/jobs/${item.job.canonicalJobId}?returnTo=${encodeURIComponent(returnTo)}`;

  return `
    <article class="job-card">
      <header>
        <h3>${escapeHtml(item.job.canonicalTitle)}</h3>
        <p class="muted">${escapeHtml(item.job.canonicalCompanyName)}</p>
      </header>
      <div class="chip-row">
        <span class="chip">${escapeHtml(humanizeToken(item.job.remoteType))}</span>
        <span class="chip">${escapeHtml(humanizeToken(item.job.employmentType))}</span>
        <span class="chip warn">Salary: ${escapeHtml(formatSalaryBand(item.job))}</span>
      </div>
      ${scoreBox}
      <ul class="skill-list">
        ${topSkills.map((skill) => `<li>${escapeHtml(skill)}</li>`).join('')}
      </ul>
      <a class="link-button" href="${escapeHtml(detailsHref)}">Open detail</a>
    </article>
  `;
};

const renderFeedPage = (
  profile: UserProfile,
  preferences: UserPreferences,
  allItems: FeedJobCard[],
  filteredItems: FeedJobCard[],
  query: FeedQueryState,
  noticeCode: string | null,
  errorCode: string | null,
  returnTo: string,
): string => {
  const notice = noticeCode ? noticeMessages[noticeCode] ?? humanizeToken(noticeCode) : null;
  const error = errorCode ? feedErrorMessages[errorCode] ?? humanizeToken(errorCode) : null;
  const hiddenCount = countHiddenItems(allItems, preferences);

  const flash = [
    notice ? renderFlash(notice, 'notice') : '',
    error ? renderFlash(error, 'error') : '',
  ].join('');

  const cards =
    filteredItems.length > 0
      ? filteredItems.map((item) => renderJobCard(item, returnTo)).join('')
      : `<div class="empty panel">
           <h3>No jobs match this filter set</h3>
           <p class="muted">Try recommendation=all, remote=any, or clear search terms.</p>
         </div>`;

  const body = `
    <header class="masthead">
      <div class="brand">
        <h1>Job Hunter Feed Console</h1>
        <p>Signed in as <span class="mono">${escapeHtml(profile.userId.slice(0, 8))}</span> | Remote preference: ${escapeHtml(humanizeToken(preferences.remotePreference))}</p>
      </div>
      <div class="actions">
        <form method="POST" action="/actions/sync" data-pending-label>
          <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}" />
          <button type="submit" data-pending-label="Syncing source...">Sync source</button>
        </form>
        <form method="POST" action="/actions/rebuild" data-pending-label>
          <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}" />
          <button type="submit" class="secondary" data-pending-label="Rebuilding catalog...">Rebuild catalog</button>
        </form>
        <form method="POST" action="/signout" data-pending-label>
          <button type="submit" class="ghost" data-pending-label="Signing out...">Sign out</button>
        </form>
      </div>
    </header>
    <main>
      ${flash}
      <section class="panel">
        <form method="GET" action="/" class="grid controls" data-pending-label>
          <label class="wide">
            Search
            <input name="q" value="${escapeHtml(query.q)}" placeholder="title, company, skill" />
          </label>
          <label>
            Recommendation
            <select name="recommendation">
              <option value="all"${query.recommendation === 'all' ? ' selected' : ''}>all</option>
              <option value="apply"${query.recommendation === 'apply' ? ' selected' : ''}>apply</option>
              <option value="review"${query.recommendation === 'review' ? ' selected' : ''}>review</option>
              <option value="skip"${query.recommendation === 'skip' ? ' selected' : ''}>skip</option>
              <option value="unscored"${query.recommendation === 'unscored' ? ' selected' : ''}>unscored</option>
            </select>
          </label>
          <label>
            Remote filter
            <select name="remote">
              <option value="aligned"${query.remote === 'aligned' ? ' selected' : ''}>aligned to preference</option>
              <option value="any"${query.remote === 'any' ? ' selected' : ''}>any</option>
              <option value="remote"${query.remote === 'remote' ? ' selected' : ''}>remote</option>
              <option value="hybrid"${query.remote === 'hybrid' ? ' selected' : ''}>hybrid</option>
              <option value="onsite"${query.remote === 'onsite' ? ' selected' : ''}>onsite</option>
            </select>
          </label>
          <label>
            Sort
            <select name="sort">
              <option value="fit"${query.sort === 'fit' ? ' selected' : ''}>fit</option>
              <option value="recent"${query.sort === 'recent' ? ' selected' : ''}>recent</option>
              <option value="salary"${query.sort === 'salary' ? ' selected' : ''}>salary</option>
            </select>
          </label>
          <label class="full">
            <span>
              <input type="checkbox" name="includeHidden" value="1"${query.includeHidden ? ' checked' : ''} />
              Include hidden companies and titles
            </span>
          </label>
          <button type="submit" class="full" data-pending-label="Refreshing feed...">Refresh feed</button>
        </form>
      </section>
      <section class="panel summary-strip">
        <p>
          Showing <strong>${filteredItems.length}</strong> of <strong>${allItems.length}</strong> feed jobs
          ${query.includeHidden ? '' : ` | Hidden by preferences: ${hiddenCount}`}
        </p>
        <p class="muted">Last refresh: ${escapeHtml(formatDateTime(new Date().toISOString()))}</p>
      </section>
      <section class="cards">
        ${cards}
      </section>
    </main>
  `;

  return renderPage('Job Hunter | Feed', body);
};

const renderScoreDetails = (artifact: MatchScoreArtifact | null): string => {
  if (!artifact) {
    return `<p class="muted">No score artifact exists yet for this job/user pair.</p>`;
  }

  const breakdownEntries: Array<{ label: string; value: number }> = [
    { label: 'Overall', value: artifact.scoreBreakdown.overallScore },
    { label: 'Title', value: artifact.scoreBreakdown.titleScore },
    { label: 'Skill', value: artifact.scoreBreakdown.skillScore },
    { label: 'Seniority', value: artifact.scoreBreakdown.seniorityScore },
    { label: 'Location', value: artifact.scoreBreakdown.locationScore },
    { label: 'Compensation', value: artifact.scoreBreakdown.compensationScore },
    { label: 'Domain', value: artifact.scoreBreakdown.domainScore },
    { label: 'Requirements', value: artifact.scoreBreakdown.requirementScore },
    { label: 'Trajectory', value: artifact.scoreBreakdown.trajectoryScore },
    { label: 'Penalty', value: artifact.scoreBreakdown.penaltyScore },
  ];

  const rows = breakdownEntries
    .map(
      (entry) => `<div class="meter-row">
        <p>${escapeHtml(entry.label)} <span class="mono">${entry.value.toFixed(1)}</span></p>
        <div class="meter-track"><div class="meter-fill" style="width: ${Math.max(
          0,
          Math.min(100, entry.value),
        )}%;"></div></div>
      </div>`,
    )
    .join('');

  return `
    <p>
      Recommendation: <span class="recommendation ${escapeHtml(
        recommendationLabel[artifact.recommendation],
      )}">${escapeHtml(recommendationLabel[artifact.recommendation])}</span>
    </p>
    ${rows}
    <h4>Strengths</h4>
    <ul class="stack-list">${artifact.strengths
      .map((value) => `<li>${escapeHtml(value)}</li>`)
      .join('')}</ul>
    <h4>Gaps</h4>
    <ul class="stack-list">${artifact.gaps.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul>
    <h4>Deal breakers</h4>
    <ul class="stack-list">${artifact.dealBreakers
      .map((value) => `<li>${escapeHtml(value)}</li>`)
      .join('')}</ul>
  `;
};

const renderDetailPage = (
  profile: UserProfile,
  detail: FeedDetailResponse | null,
  returnTo: string,
  errorCode: string | null,
): string => {
  const error = errorCode ? feedErrorMessages[errorCode] ?? humanizeToken(errorCode) : null;
  const flash = error ? renderFlash(error, 'error') : '';

  const detailBody = detail
    ? `
      <section class="panel">
        <h2>${escapeHtml(detail.canonical.job.canonicalTitle)}</h2>
        <p class="muted">${escapeHtml(detail.canonical.job.canonicalCompanyName)}</p>
        <div class="chip-row">
          <span class="chip">${escapeHtml(humanizeToken(detail.canonical.job.remoteType))}</span>
          <span class="chip">${escapeHtml(humanizeToken(detail.canonical.job.employmentType))}</span>
          <span class="chip warn">Salary: ${escapeHtml(formatSalaryBand(detail.canonical.job))}</span>
        </div>
        <p class="muted">Last seen: ${escapeHtml(formatDateTime(detail.canonical.job.lastSeenAt))}</p>
      </section>
      <section class="detail-layout">
        <article class="panel">
          <h3>Score rationale</h3>
          ${renderScoreDetails(detail.latestScoreArtifact)}
        </article>
        <article class="panel">
          <h3>Source mappings</h3>
          <ul class="mapping-list">
            ${detail.canonical.sourceMappings
              .map(
                (mapping) => `<li>
                  <span class="mono">${escapeHtml(mapping.sourceName)}:${escapeHtml(
                    mapping.sourceJobId,
                  )}</span>
                  <br />
                  confidence ${mapping.mappingConfidence.toFixed(2)} |
                  reasons: ${escapeHtml(mapping.mappingReasonCodes.join(', '))}
                </li>`,
              )
              .join('')}
          </ul>
          <h3>Dedupe trace events</h3>
          <ul class="event-list">
            ${detail.dedupeEvents
              .map(
                (event) => `<li>
                  <strong>${escapeHtml(humanizeToken(event.eventType))}</strong>
                  ${escapeHtml(event.sourceName)}:${escapeHtml(event.sourceJobId)}
                  at ${escapeHtml(formatDateTime(event.occurredAt))}
                </li>`,
              )
              .join('')}
          </ul>
        </article>
      </section>
    `
    : `<section class="panel"><h2>Job detail unavailable</h2><p class="muted">This job could not be loaded at the moment.</p></section>`;

  const body = `
    <header class="masthead">
      <div class="brand">
        <h1>Job detail</h1>
        <p>User <span class="mono">${escapeHtml(profile.userId.slice(0, 8))}</span></p>
      </div>
      <div class="actions">
        <a class="link-button" href="${escapeHtml(returnTo)}">Back to feed</a>
        <form method="POST" action="/signout" data-pending-label>
          <button type="submit" class="ghost" data-pending-label="Signing out...">Sign out</button>
        </form>
      </div>
    </header>
    <main>
      ${flash}
      ${detailBody}
    </main>
  `;

  return renderPage('Job Hunter | Job detail', body);
};

const parsePathJobId = (pathname: string): string | null => {
  const prefix = '/jobs/';
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const pathValue = pathname.slice(prefix.length);
  if (!pathValue || pathValue.includes('/')) {
    return null;
  }

  return pathValue;
};

const signInWithMode = async (
  apiBaseUrl: string,
  email: string,
  mode: 'login' | 'register',
): Promise<ApiResult<AuthSessionEnvelope>> => {
  const path = mode === 'register' ? '/v1/auth/register' : '/v1/auth/login';

  const response = await requestApi<unknown>(
    apiBaseUrl,
    path,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email }),
    },
    null,
  );

  if (!response.ok) {
    return response;
  }

  const session = parseAuthSessionEnvelope(response.data);
  if (!session) {
    return {
      ok: false,
      error: {
        status: 502,
        code: 'invalid_api_contract',
        message: 'Session response schema mismatch.',
      },
    };
  }

  return {
    ok: true,
    data: session,
  };
};

const handleSessionRoute = async (
  req: IncomingMessage,
  res: ServerResponse,
  apiBaseUrl: string,
): Promise<void> => {
  const form = await readFormBody(req);
  const email = (form.get('email') ?? '').toString().trim().toLowerCase();
  const requestedMode = form.get('mode') === 'register' ? 'register' : 'login';
  const returnTo = normalizeReturnPath(form.get('returnTo')?.toString() ?? '/');

  if (email.length === 0) {
    redirect(res, withQueryParam('/', 'auth_error', 'invalid_request_body'));
    return;
  }

  let sessionResult = await signInWithMode(apiBaseUrl, email, requestedMode);
  let noticeCode = requestedMode === 'register' ? 'account_created' : 'signed_in';

  if (!sessionResult.ok && requestedMode === 'register' && sessionResult.error.code === 'email_already_registered') {
    sessionResult = await signInWithMode(apiBaseUrl, email, 'login');
    noticeCode = 'signed_in';
  }

  if (!sessionResult.ok) {
    const redirectPath = withQueryParam('/', 'auth_error', sessionResult.error.code);
    redirect(res, withQueryParam(redirectPath, 'email', email));
    return;
  }

  const location = withQueryParam(returnTo, 'notice', noticeCode);

  redirect(res, location, [
    serializeCookie(
      accessTokenCookieName,
      sessionResult.data.accessToken,
      sessionCookieMaxAgeSeconds,
    ),
  ]);
};

const handleSignOutRoute = (res: ServerResponse): void => {
  redirect(res, '/', [clearAccessTokenCookie()]);
};

const handleSyncRoute = async (
  req: IncomingMessage,
  res: ServerResponse,
  apiBaseUrl: string,
): Promise<void> => {
  const cookies = parseCookies(req);
  const accessToken = cookies[accessTokenCookieName];
  const form = await readFormBody(req);
  const returnTo = normalizeReturnPath(form.get('returnTo')?.toString() ?? '/');

  if (!accessToken) {
    redirect(res, withQueryParam('/', 'auth_error', 'missing_access_token'));
    return;
  }

  const result = await requestApi(
    apiBaseUrl,
    '/v1/connectors/greenhouse_public_board/sync',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ maxRecords: 200 }),
    },
    connectorSyncResponseSchema,
    accessToken,
  );

  if (!result.ok) {
    if (result.error.code === 'invalid_access_token') {
      redirect(res, withQueryParam('/', 'auth_error', 'invalid_access_token'), [
        clearAccessTokenCookie(),
      ]);
      return;
    }

    redirect(res, withQueryParam(returnTo, 'error', result.error.code));
    return;
  }

  const noticeCode = result.data.failedCount > 0 ? 'sync_partial' : 'sync_complete';
  redirect(res, withQueryParam(returnTo, 'notice', noticeCode));
};

const handleRebuildRoute = async (
  req: IncomingMessage,
  res: ServerResponse,
  apiBaseUrl: string,
): Promise<void> => {
  const cookies = parseCookies(req);
  const accessToken = cookies[accessTokenCookieName];
  const form = await readFormBody(req);
  const returnTo = normalizeReturnPath(form.get('returnTo')?.toString() ?? '/');

  if (!accessToken) {
    redirect(res, withQueryParam('/', 'auth_error', 'missing_access_token'));
    return;
  }

  const result = await requestApi(
    apiBaseUrl,
    '/v1/canonical-jobs/rebuild',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ maxSourceJobs: 1_000 }),
    },
    canonicalRebuildResponseSchema,
    accessToken,
  );

  if (!result.ok) {
    if (result.error.code === 'invalid_access_token') {
      redirect(res, withQueryParam('/', 'auth_error', 'invalid_access_token'), [
        clearAccessTokenCookie(),
      ]);
      return;
    }

    redirect(res, withQueryParam(returnTo, 'error', result.error.code));
    return;
  }

  redirect(res, withQueryParam(returnTo, 'notice', 'rebuild_complete'));
};

const handleFeedRoute = async (
  req: IncomingMessage,
  res: ServerResponse,
  apiBaseUrl: string,
): Promise<void> => {
  const requestUrl = new URL(req.url ?? '/', 'http://localhost');
  const cookies = parseCookies(req);
  const accessToken = cookies[accessTokenCookieName];

  const authError = requestUrl.searchParams.get('auth_error');
  const emailHint = (requestUrl.searchParams.get('email') ?? '').trim().slice(0, 320);
  const requestedReturnTo = normalizeReturnPath(
    requestUrl.searchParams.get('returnTo') ?? '/',
  );

  if (!accessToken) {
    sendHtml(res, 200, renderAuthPage(authError, emailHint, requestedReturnTo));
    return;
  }

  const [profileResult, preferencesResult, feedResult] = await Promise.all([
    fetchProfile(apiBaseUrl, accessToken),
    fetchPreferences(apiBaseUrl, accessToken),
    requestApi(apiBaseUrl, '/v1/feed?limit=250', { method: 'GET' }, feedResponseSchema, accessToken),
  ]);

  if (!profileResult.ok) {
    if (profileResult.error.code === 'invalid_access_token') {
      redirect(res, withQueryParam('/', 'auth_error', 'invalid_access_token'), [
        clearAccessTokenCookie(),
      ]);
      return;
    }

    sendHtml(
      res,
      502,
      renderAuthPage(profileResult.error.code, emailHint, requestedReturnTo),
    );
    return;
  }

  const preferences = preferencesResult.ok
    ? preferencesResult.data
    : buildFallbackPreferences(profileResult.data);

  const query = parseFeedQuery(requestUrl);
  const returnTo = buildFeedReturnPath(query);

  const allItems = feedResult.ok ? feedResult.data.items : [];
  const filteredItems = applyFeedFilters(allItems, query, preferences);

  const noticeCode = requestUrl.searchParams.get('notice');
  const routeErrorCode = requestUrl.searchParams.get('error');
  const computedErrorCode = !feedResult.ok
    ? feedResult.error.code
    : !preferencesResult.ok
      ? preferencesResult.error.code
      : routeErrorCode;

  sendHtml(
    res,
    200,
    renderFeedPage(
      profileResult.data,
      preferences,
      allItems,
      filteredItems,
      query,
      noticeCode,
      computedErrorCode,
      returnTo,
    ),
  );
};

const handleJobDetailRoute = async (
  req: IncomingMessage,
  res: ServerResponse,
  apiBaseUrl: string,
): Promise<void> => {
  const requestUrl = new URL(req.url ?? '/', 'http://localhost');
  const jobId = parsePathJobId(requestUrl.pathname);
  if (!jobId) {
    sendHtml(res, 404, renderPage('Not found', '<main><section class="panel"><h2>Not found</h2></section></main>'));
    return;
  }

  const parsedJobId = canonicalJobIdSchema.safeParse(jobId);
  if (!parsedJobId.success) {
    sendHtml(
      res,
      400,
      renderPage(
        'Invalid job id',
        '<main><section class="panel"><h2>Invalid job id</h2></section></main>',
      ),
    );
    return;
  }

  const cookies = parseCookies(req);
  const accessToken = cookies[accessTokenCookieName];
  const returnTo = normalizeReturnPath(requestUrl.searchParams.get('returnTo') ?? '/');

  if (!accessToken) {
    const authRedirect = withQueryParam('/', 'auth_error', 'missing_access_token');
    redirect(
      res,
      withQueryParam(authRedirect, 'returnTo', `${requestUrl.pathname}${requestUrl.search}`),
    );
    return;
  }

  const profileResult = await fetchProfile(apiBaseUrl, accessToken);
  if (!profileResult.ok) {
    redirect(res, withQueryParam('/', 'auth_error', profileResult.error.code), [
      clearAccessTokenCookie(),
    ]);
    return;
  }

  const detailResult = await requestApi(
    apiBaseUrl,
    `/v1/feed/${parsedJobId.data}`,
    {
      method: 'GET',
    },
    feedDetailResponseSchema,
    accessToken,
  );

  if (!detailResult.ok) {
    sendHtml(
      res,
      detailResult.error.status === 404 ? 404 : 200,
      renderDetailPage(profileResult.data, null, returnTo, detailResult.error.code),
    );
    return;
  }

  sendHtml(
    res,
    200,
    renderDetailPage(profileResult.data, detailResult.data, returnTo, null),
  );
};

const handleRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  apiBaseUrl: string,
): Promise<void> => {
  const method = req.method ?? 'GET';
  const requestUrl = new URL(req.url ?? '/', 'http://localhost');
  const pathname = requestUrl.pathname;

  if (method === 'GET' && pathname === '/health') {
    sendJson(res, 200, { status: 'ok', service: 'web' });
    return;
  }

  if (method === 'GET' && pathname === '/') {
    await handleFeedRoute(req, res, apiBaseUrl);
    return;
  }

  if (method === 'GET' && pathname.startsWith('/jobs/')) {
    await handleJobDetailRoute(req, res, apiBaseUrl);
    return;
  }

  if (method === 'POST' && pathname === '/session') {
    await handleSessionRoute(req, res, apiBaseUrl);
    return;
  }

  if (method === 'POST' && pathname === '/signout') {
    handleSignOutRoute(res);
    return;
  }

  if (method === 'POST' && pathname === '/actions/sync') {
    await handleSyncRoute(req, res, apiBaseUrl);
    return;
  }

  if (method === 'POST' && pathname === '/actions/rebuild') {
    await handleRebuildRoute(req, res, apiBaseUrl);
    return;
  }

  sendHtml(
    res,
    404,
    renderPage(
      'Not found',
      '<main><section class="panel"><h2>Not found</h2><p class="muted">The requested page does not exist.</p></section></main>',
    ),
  );
};

export const createWebServer = (options: CreateWebServerOptions = {}): Server => {
  const apiBaseUrl = resolveApiBaseUrl(options);

  return createServer((req, res) => {
    void handleRequest(req, res, apiBaseUrl).catch((error: unknown) => {
      console.error('web_unhandled_error', error);

      sendHtml(
        res,
        500,
        renderPage(
          'Web error',
          '<main><section class="panel"><h2>Unexpected web error</h2><p class="muted">Check web server logs for details.</p></section></main>',
        ),
      );
    });
  });
};

export const startWebServer = (
  port: number,
  options: CreateWebServerOptions = {},
): Server => {
  const server = createWebServer(options);

  server.listen(port, () => {
    console.log(`Web listening on http://localhost:${port}`);
  });

  return server;
};

const isMainModule = (): boolean => {
  const entryPath = process.argv[1];
  if (!entryPath) {
    return false;
  }

  return import.meta.url === pathToFileURL(entryPath).href;
};

if (isMainModule()) {
  startWebServer(defaultWebPort);
}
