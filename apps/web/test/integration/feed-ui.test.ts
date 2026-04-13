import assert from 'node:assert/strict';
import { once } from 'node:events';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import { createWebServer } from '../../src/index.js';

const tokenValue = 'token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const userId = '2d738b4b-1a8b-441c-89df-5f8e4d7be92a';

const visibleCanonicalJobId = 'b4ee5452-117e-4b0f-8a05-ebb91e4e35f8';
const hiddenCanonicalJobId = 'e260f0cc-754d-491a-a273-081f2b28cce8';

const userProfile = {
  userId,
  currentTitle: 'Senior Backend Engineer',
  yearsExperience: 8,
  summary: 'Platform and data systems builder.',
  workAuthorization: 'citizen',
  sponsorshipRequired: false,
  transitionNotes: null,
  createdAt: '2026-04-12T10:00:00.000Z',
  updatedAt: '2026-04-12T10:00:00.000Z',
};

const userPreferences = {
  userId,
  preferredTitles: ['Senior Backend Engineer'],
  preferredIndustries: ['Software'],
  preferredSkills: ['TypeScript', 'Node.js'],
  preferredLocations: ['United States'],
  remotePreference: 'remote',
  targetSeniorityMin: 'mid',
  targetSeniorityMax: 'principal',
  salaryMin: 150000,
  salaryTarget: 190000,
  dealBreakers: [],
  hiddenCompanies: ['Hidden Corp'],
  hiddenTitles: ['Legacy Integrations Engineer'],
  stretchPreferenceLevel: 3,
  notificationPreferences: {
    dailyDigest: true,
    weeklyDigest: true,
    instantHighFit: true,
  },
  createdAt: '2026-04-12T10:00:00.000Z',
  updatedAt: '2026-04-12T10:00:00.000Z',
};

const scoredArtifact = {
  userId,
  canonicalJobId: visibleCanonicalJobId,
  artifactVersion: 1,
  scoringVersion: 'deterministic-v1',
  scoreBreakdown: {
    overallScore: 88,
    titleScore: 91,
    skillScore: 86,
    seniorityScore: 85,
    locationScore: 92,
    compensationScore: 90,
    domainScore: 79,
    requirementScore: 88,
    trajectoryScore: 82,
    penaltyScore: 4,
  },
  strengths: ['Strong TypeScript and API architecture alignment'],
  gaps: ['Domain depth in fintech is moderate'],
  dealBreakers: [],
  recommendation: 'apply',
  explanation: {
    summary: 'Strong fit with clear overlap in required backend systems work.',
    strengths: ['Experience aligns with role seniority and stack'],
    gaps: ['Domain context can be strengthened during interviews'],
    dealBreakers: [],
    recommendation: 'apply',
  },
  explanationMetadata: {
    schemaVersion: 'v1',
    extractorVersion: 'deterministic-v1',
    modelVersion: 'deterministic',
    generatedAt: '2026-04-12T11:00:00.000Z',
  },
  explanationErrorCode: null,
  scoredAt: '2026-04-12T11:00:00.000Z',
};

const visibleFeedItem = {
  job: {
    canonicalJobId: visibleCanonicalJobId,
    canonicalCompanyName: 'Visible Systems',
    canonicalTitle: 'Senior Platform Engineer',
    normalizedLocation: 'Remote - United States',
    remoteType: 'remote',
    employmentType: 'full_time',
    salaryMin: 170000,
    salaryMax: 215000,
    salaryCurrency: 'USD',
    salaryPeriod: 'year',
    sourceCount: 2,
    sourceNames: ['greenhouse_public_board'],
    jobStatus: 'open',
    topSkills: ['TypeScript', 'Node.js', 'PostgreSQL'],
    firstSeenAt: '2026-04-11T12:00:00.000Z',
    lastSeenAt: '2026-04-12T12:00:00.000Z',
    createdAt: '2026-04-12T12:00:00.000Z',
    updatedAt: '2026-04-12T12:00:00.000Z',
  },
  latestScoreArtifact: scoredArtifact,
};

const hiddenFeedItem = {
  job: {
    canonicalJobId: hiddenCanonicalJobId,
    canonicalCompanyName: 'Hidden Corp',
    canonicalTitle: 'Legacy Integrations Engineer',
    normalizedLocation: 'Hybrid - Seattle',
    remoteType: 'hybrid',
    employmentType: 'full_time',
    salaryMin: 140000,
    salaryMax: 175000,
    salaryCurrency: 'USD',
    salaryPeriod: 'year',
    sourceCount: 1,
    sourceNames: ['greenhouse_public_board'],
    jobStatus: 'open',
    topSkills: ['Java', 'Spring'],
    firstSeenAt: '2026-04-10T12:00:00.000Z',
    lastSeenAt: '2026-04-12T10:00:00.000Z',
    createdAt: '2026-04-12T10:00:00.000Z',
    updatedAt: '2026-04-12T10:00:00.000Z',
  },
  latestScoreArtifact: null,
};

const feedDetailResponse = {
  contractVersion: 'v1',
  canonical: {
    job: visibleFeedItem.job,
    sourceMappings: [
      {
        sourceName: 'greenhouse_public_board',
        sourceJobId: '1001',
        isPrimary: true,
        mappingConfidence: 0.93,
        mappingReasonCodes: ['exact_company_title', 'same_remote_type'],
      },
    ],
  },
  latestScoreArtifact: scoredArtifact,
  dedupeEvents: [
    {
      eventId: '4ef03bb9-39d2-4d94-82f7-caf9fdd2fcc0',
      canonicalJobId: visibleCanonicalJobId,
      sourceName: 'greenhouse_public_board',
      sourceJobId: '1001',
      eventType: 'linked_to_canonical',
      mappingConfidence: 0.93,
      mappingReasonCodes: ['exact_company_title', 'same_remote_type'],
      reversible: true,
      dedupeVersion: 'dedupe-v1',
      occurredAt: '2026-04-12T12:00:00.000Z',
    },
  ],
};

const applicationStatuses = new Set([
  'ready_to_apply',
  'applied',
  'interview',
  'offer',
  'rejected',
  'archived',
]);

const parseApplicationPath = (pathname: string): string | null => {
  const prefix = '/v1/applications/';
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const value = pathname.slice(prefix.length);
  if (!value || value.includes('/')) {
    return null;
  }

  return value;
};

const parseApplicationMaterialGuidancePath = (pathname: string): string | null => {
  const prefix = '/v1/applications/';
  const suffix = '/material-guidance';

  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) {
    return null;
  }

  const value = pathname.slice(prefix.length, -suffix.length);
  if (!value || value.includes('/')) {
    return null;
  }

  return value;
};

const normalizeNullableText = (value: unknown): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const readRequestBody = async (req: IncomingMessage): Promise<string> => {
  let body = '';

  return new Promise<string>((resolve, reject) => {
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      body += chunk;
    });
    req.on('end', () => {
      resolve(body);
    });
    req.on('error', (error) => {
      reject(error);
    });
  });
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

const requireAuth = (req: IncomingMessage): boolean =>
  req.headers.authorization === `Bearer ${tokenValue}`;

const createApiStubServer = (): Server => {
  const applications = new Map<
    string,
    {
      applicationId: string;
      userId: string;
      canonicalJobId: string;
      status: string;
      appliedAt: string | null;
      applicationUrl: string | null;
      resumeIdUsed: string | null;
      coverLetterDocUri: string | null;
      notes: string | null;
      createdAt: string;
      updatedAt: string;
    }
  >();

  let applicationCounter = 1;

  const nextApplicationId = (): string => {
    const suffix = applicationCounter.toString(16).padStart(12, '0');
    applicationCounter += 1;
    return `11111111-1111-4111-8111-${suffix}`;
  };

  return createServer(async (req, res) => {
    const method = req.method ?? 'GET';
    const requestUrl = new URL(req.url ?? '/', 'http://localhost');
    const pathname = requestUrl.pathname;

    if (method === 'POST' && pathname === '/v1/auth/register') {
      const body = await readRequestBody(req);
      const parsed = JSON.parse(body) as { email?: string };

      if (!parsed.email) {
        sendJson(res, 400, { error: 'invalid_request_body' });
        return;
      }

      sendJson(res, 200, {
        contractVersion: 'v1',
        session: {
          accessToken: tokenValue,
          user: {
            userId,
            email: parsed.email,
            createdAt: '2026-04-12T10:00:00.000Z',
            updatedAt: '2026-04-12T10:00:00.000Z',
          },
        },
      });
      return;
    }

    if (method === 'POST' && pathname === '/v1/auth/login') {
      const body = await readRequestBody(req);
      const parsed = JSON.parse(body) as { email?: string };

      if (!parsed.email) {
        sendJson(res, 400, { error: 'invalid_request_body' });
        return;
      }

      sendJson(res, 200, {
        contractVersion: 'v1',
        session: {
          accessToken: tokenValue,
          user: {
            userId,
            email: parsed.email,
            createdAt: '2026-04-12T10:00:00.000Z',
            updatedAt: '2026-04-12T10:00:00.000Z',
          },
        },
      });
      return;
    }

    if (!requireAuth(req)) {
      sendJson(res, 401, { error: 'invalid_access_token' });
      return;
    }

    if (method === 'GET' && pathname === '/v1/profile') {
      sendJson(res, 200, {
        contractVersion: 'v1',
        profile: userProfile,
      });
      return;
    }

    if (method === 'GET' && pathname === '/v1/preferences') {
      sendJson(res, 200, {
        contractVersion: 'v1',
        preferences: userPreferences,
      });
      return;
    }

    if (method === 'GET' && pathname === '/v1/feed') {
      sendJson(res, 200, {
        contractVersion: 'v1',
        items: [visibleFeedItem, hiddenFeedItem],
      });
      return;
    }

    if (method === 'GET' && pathname === '/v1/applications') {
      const statusFilter = requestUrl.searchParams.get('status');
      const canonicalJobIdFilter = requestUrl.searchParams.get('canonicalJobId');
      const limitRaw = requestUrl.searchParams.get('limit');

      const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 50;
      const effectiveLimit = Number.isNaN(limit) ? 50 : limit;

      const records = [...applications.values()]
        .filter((record) => {
          if (statusFilter && record.status !== statusFilter) {
            return false;
          }

          if (canonicalJobIdFilter && record.canonicalJobId !== canonicalJobIdFilter) {
            return false;
          }

          return true;
        })
        .slice(0, effectiveLimit);

      sendJson(res, 200, {
        contractVersion: 'v1',
        applications: records,
      });
      return;
    }

    if (method === 'GET') {
      const applicationId = parseApplicationMaterialGuidancePath(pathname);
      if (applicationId) {
        const record = applications.get(applicationId);
        if (!record) {
          sendJson(res, 404, { error: 'application_not_found' });
          return;
        }

        const job =
          record.canonicalJobId === visibleCanonicalJobId
            ? visibleFeedItem.job
            : record.canonicalJobId === hiddenCanonicalJobId
              ? hiddenFeedItem.job
              : null;

        if (!job) {
          sendJson(res, 404, { error: 'canonical_job_not_found' });
          return;
        }

        sendJson(res, 200, {
          contractVersion: 'v1',
          guidance: {
            application: record,
            canonicalJob: {
              canonicalJobId: job.canonicalJobId,
              canonicalTitle: job.canonicalTitle,
              canonicalCompanyName: job.canonicalCompanyName,
              remoteType: job.remoteType,
              employmentType: job.employmentType,
              topSkills: job.topSkills,
            },
            checklist: [
              'Mirror the role title in your resume headline.',
              'Anchor your first two bullets to top role skills.',
              'Capture the exact resume version used in your tracker notes.',
            ],
            keywordSuggestions: ['TypeScript', 'Node.js', 'PostgreSQL'],
            bulletSuggestions: [
              {
                focusArea: 'TypeScript',
                prompt:
                  'Write one quantified bullet showing impact from a TypeScript service improvement.',
              },
            ],
            coverLetterTalkingPoints: [
              'Open with direct role-to-background alignment.',
              'Highlight one measurable backend systems outcome.',
            ],
          },
        });
        return;
      }
    }

    if (method === 'POST' && pathname === '/v1/applications') {
      const body = await readRequestBody(req);
      const parsed = JSON.parse(body) as {
        canonicalJobId?: string;
        status?: string;
        applicationUrl?: string | null;
        resumeIdUsed?: string | null;
        coverLetterDocUri?: string | null;
        notes?: string | null;
      };

      const canonicalJobId = parsed.canonicalJobId;
      if (!canonicalJobId) {
        sendJson(res, 400, { error: 'invalid_request_body' });
        return;
      }

      if (canonicalJobId !== visibleCanonicalJobId && canonicalJobId !== hiddenCanonicalJobId) {
        sendJson(res, 404, { error: 'canonical_job_not_found' });
        return;
      }

      const existing = [...applications.values()].find(
        (record) => record.canonicalJobId === canonicalJobId,
      );

      if (existing) {
        sendJson(res, 409, { error: 'application_already_exists_for_job' });
        return;
      }

      const status = parsed.status ?? 'ready_to_apply';
      if (!applicationStatuses.has(status)) {
        sendJson(res, 400, { error: 'invalid_application_status_filter' });
        return;
      }

      const nowIso = '2026-04-12T12:30:00.000Z';
      const application = {
        applicationId: nextApplicationId(),
        userId,
        canonicalJobId,
        status,
        appliedAt: status === 'ready_to_apply' ? null : nowIso,
        applicationUrl: normalizeNullableText(parsed.applicationUrl) ?? null,
        resumeIdUsed: normalizeNullableText(parsed.resumeIdUsed) ?? null,
        coverLetterDocUri: normalizeNullableText(parsed.coverLetterDocUri) ?? null,
        notes: normalizeNullableText(parsed.notes) ?? null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      applications.set(application.applicationId, application);

      sendJson(res, 200, {
        contractVersion: 'v1',
        application,
      });
      return;
    }

    if (method === 'GET') {
      const applicationId = parseApplicationPath(pathname);
      if (applicationId) {
        const record = applications.get(applicationId);
        if (!record) {
          sendJson(res, 404, { error: 'application_not_found' });
          return;
        }

        sendJson(res, 200, {
          contractVersion: 'v1',
          application: record,
        });
        return;
      }
    }

    if (method === 'PUT') {
      const applicationId = parseApplicationPath(pathname);
      if (applicationId) {
        const existing = applications.get(applicationId);
        if (!existing) {
          sendJson(res, 404, { error: 'application_not_found' });
          return;
        }

        const body = await readRequestBody(req);
        const parsed = JSON.parse(body) as {
          status?: string;
          applicationUrl?: string | null;
          resumeIdUsed?: string | null;
          coverLetterDocUri?: string | null;
          notes?: string | null;
        };

        if (
          parsed.status === undefined &&
          parsed.applicationUrl === undefined &&
          parsed.resumeIdUsed === undefined &&
          parsed.coverLetterDocUri === undefined &&
          parsed.notes === undefined
        ) {
          sendJson(res, 400, { error: 'invalid_request_body' });
          return;
        }

        if (parsed.status !== undefined && !applicationStatuses.has(parsed.status)) {
          sendJson(res, 400, { error: 'invalid_application_status_filter' });
          return;
        }

        const nowIso = '2026-04-12T12:45:00.000Z';
        const nextStatus = parsed.status ?? existing.status;

        const updated = {
          ...existing,
          status: nextStatus,
          appliedAt:
            nextStatus === 'ready_to_apply'
              ? existing.appliedAt
              : existing.appliedAt ?? nowIso,
          applicationUrl:
            parsed.applicationUrl === undefined
              ? existing.applicationUrl
              : (normalizeNullableText(parsed.applicationUrl) ?? null),
          resumeIdUsed:
            parsed.resumeIdUsed === undefined
              ? existing.resumeIdUsed
              : (normalizeNullableText(parsed.resumeIdUsed) ?? null),
          coverLetterDocUri:
            parsed.coverLetterDocUri === undefined
              ? existing.coverLetterDocUri
              : (normalizeNullableText(parsed.coverLetterDocUri) ?? null),
          notes:
            parsed.notes === undefined
              ? existing.notes
              : (normalizeNullableText(parsed.notes) ?? null),
          updatedAt: nowIso,
        };

        applications.set(applicationId, updated);

        sendJson(res, 200, {
          contractVersion: 'v1',
          application: updated,
        });
        return;
      }
    }

    if (method === 'GET' && pathname === `/v1/feed/${visibleCanonicalJobId}`) {
      sendJson(res, 200, feedDetailResponse);
      return;
    }

    if (method === 'GET' && pathname.startsWith('/v1/feed/')) {
      sendJson(res, 404, { error: 'canonical_job_not_found' });
      return;
    }

    if (method === 'POST' && pathname === '/v1/connectors/greenhouse_public_board/sync') {
      sendJson(res, 200, {
        contractVersion: 'v1',
        sourceName: 'greenhouse_public_board',
        startedAt: '2026-04-12T12:00:00.000Z',
        completedAt: '2026-04-12T12:00:01.000Z',
        fetchedCount: 2,
        insertedCount: 1,
        updatedCount: 1,
        unchangedCount: 0,
        failedCount: 0,
        healthStatus: 'healthy',
        errors: [],
      });
      return;
    }

    if (method === 'POST' && pathname === '/v1/canonical-jobs/rebuild') {
      const body = await readRequestBody(req);
      const parsed = JSON.parse(body) as { maxSourceJobs?: number };

      if (
        typeof parsed.maxSourceJobs !== 'number' ||
        !Number.isInteger(parsed.maxSourceJobs) ||
        parsed.maxSourceJobs < 1 ||
        parsed.maxSourceJobs > 500
      ) {
        sendJson(res, 400, { error: 'invalid_source_job_limit' });
        return;
      }

      sendJson(res, 200, {
        contractVersion: 'v1',
        startedAt: '2026-04-12T12:00:00.000Z',
        completedAt: '2026-04-12T12:00:02.000Z',
        sourceJobsScanned: 2,
        canonicalJobsCreated: 1,
        canonicalJobsUpdated: 0,
        dedupedSourceJobs: 1,
      });
      return;
    }

    sendJson(res, 404, { error: 'not_found' });
  });
  };

const startServer = async (
  server: Server,
): Promise<{ baseUrl: string; close: () => Promise<void> }> => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed_to_start_server');
  }

  return {
    baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error?: Error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
};

const signInAndGetCookie = async (webBaseUrl: string): Promise<string> => {
  const response = await fetch(`${webBaseUrl}/session`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'email=step6%40test.dev&mode=register&returnTo=%2F',
    redirect: 'manual',
  });

  assert.equal(response.status, 303);
  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie);

  const cookie = setCookie.split(';')[0];
  assert.ok(cookie.startsWith('jh_access_token='));

  return cookie;
};

test('feed root renders sign-in when session is missing', async () => {
  const api = await startServer(createApiStubServer());
  const web = await startServer(createWebServer({ apiBaseUrl: api.baseUrl }));

  try {
    const response = await fetch(`${web.baseUrl}/`);
    assert.equal(response.status, 200);

    const html = await response.text();
    assert.match(html, /Sign in to your feed/);
    assert.match(html, /Create account/);
  } finally {
    await web.close();
    await api.close();
  }
});

test('session route defaults to register when mode is omitted', async () => {
  const api = await startServer(createApiStubServer());
  const web = await startServer(createWebServer({ apiBaseUrl: api.baseUrl }));

  try {
    const response = await fetch(`${web.baseUrl}/session`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'email=mode.default%40test.dev&returnTo=%2F',
      redirect: 'manual',
    });

    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/?notice=account_created');

    const setCookie = response.headers.get('set-cookie');
    assert.ok(setCookie);
    assert.match(setCookie, /jh_access_token=/);
  } finally {
    await web.close();
    await api.close();
  }
});

test('authenticated feed hides preference-hidden jobs by default', async () => {
  const api = await startServer(createApiStubServer());
  const web = await startServer(createWebServer({ apiBaseUrl: api.baseUrl }));

  try {
    const cookie = await signInAndGetCookie(web.baseUrl);

    const response = await fetch(`${web.baseUrl}/`, {
      headers: {
        cookie,
      },
    });

    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Visible Systems/);
    assert.doesNotMatch(html, /Hidden Corp/);
    assert.match(html, /Showing <strong>1<\/strong> of <strong>2<\/strong>/);

    const includeHiddenResponse = await fetch(
      `${web.baseUrl}/?includeHidden=1&remote=any`,
      {
      headers: {
        cookie,
      },
      },
    );

    const includeHiddenHtml = await includeHiddenResponse.text();
    assert.match(includeHiddenHtml, /Hidden Corp/);
  } finally {
    await web.close();
    await api.close();
  }
});

test('job detail renders score and dedupe context; sync and rebuild actions redirect with notices', async () => {
  const api = await startServer(createApiStubServer());
  const web = await startServer(createWebServer({ apiBaseUrl: api.baseUrl }));

  try {
    const cookie = await signInAndGetCookie(web.baseUrl);

    const detailResponse = await fetch(
      `${web.baseUrl}/jobs/${visibleCanonicalJobId}?returnTo=%2F`,
      {
        headers: {
          cookie,
        },
      },
    );

    assert.equal(detailResponse.status, 200);
    const detailHtml = await detailResponse.text();
    assert.match(detailHtml, /Score rationale/);
    assert.match(detailHtml, /Linked To Canonical/);

    const syncResponse = await fetch(`${web.baseUrl}/actions/sync`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie,
      },
      body: 'returnTo=%2F',
      redirect: 'manual',
    });

    assert.equal(syncResponse.status, 303);
    assert.equal(syncResponse.headers.get('location'), '/?notice=sync_complete');

    const rebuildResponse = await fetch(`${web.baseUrl}/actions/rebuild`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie,
      },
      body: 'returnTo=%2F',
      redirect: 'manual',
    });

    assert.equal(rebuildResponse.status, 303);
    assert.equal(rebuildResponse.headers.get('location'), '/?notice=rebuild_complete');
  } finally {
    await web.close();
    await api.close();
  }
});

test('application workflow routes create, list, detail, and update through web actions', async () => {
  const api = await startServer(createApiStubServer());
  const web = await startServer(createWebServer({ apiBaseUrl: api.baseUrl }));

  try {
    const cookie = await signInAndGetCookie(web.baseUrl);

    const createResponse = await fetch(`${web.baseUrl}/actions/applications/create`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie,
      },
      body: `canonicalJobId=${encodeURIComponent(visibleCanonicalJobId)}&status=ready_to_apply&returnTo=%2F`,
      redirect: 'manual',
    });

    assert.equal(createResponse.status, 303);
    const createLocation = createResponse.headers.get('location');
    assert.ok(createLocation);
    assert.match(createLocation, /^\/applications\/[0-9a-f-]{36}\?returnTo=%2F&notice=application_created$/);

    const applicationIdMatch = createLocation.match(/^\/applications\/([0-9a-f-]{36})\?/);
    assert.ok(applicationIdMatch);
    const applicationId = applicationIdMatch[1];

    const listResponse = await fetch(`${web.baseUrl}/applications?returnTo=%2F`, {
      headers: {
        cookie,
      },
    });

    assert.equal(listResponse.status, 200);
    const listHtml = await listResponse.text();
    assert.match(listHtml, /Application tracker/);
    assert.match(listHtml, /Senior Platform Engineer/);
    assert.match(listHtml, /Ready To Apply/);

    const detailResponse = await fetch(`${web.baseUrl}${createLocation}`, {
      headers: {
        cookie,
      },
    });

    assert.equal(detailResponse.status, 200);
    const detailHtml = await detailResponse.text();
    assert.match(detailHtml, /Application detail/);
    assert.match(detailHtml, /Material assistant/);
    assert.match(detailHtml, /Keyword suggestions/);

    const updateResponse = await fetch(`${web.baseUrl}/actions/applications/update`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie,
      },
      body: `applicationId=${encodeURIComponent(applicationId)}&status=interview&notes=${encodeURIComponent(
        'Panel loop scheduled',
      )}&returnTo=%2Fapplications`,
      redirect: 'manual',
    });

    assert.equal(updateResponse.status, 303);
    assert.equal(updateResponse.headers.get('location'), '/applications?notice=application_updated');

    const filteredResponse = await fetch(`${web.baseUrl}/applications?status=interview`, {
      headers: {
        cookie,
      },
    });

    assert.equal(filteredResponse.status, 200);
    const filteredHtml = await filteredResponse.text();
    assert.match(filteredHtml, /Interview/);
    assert.match(filteredHtml, /Senior Platform Engineer/);
  } finally {
    await web.close();
    await api.close();
  }
});
