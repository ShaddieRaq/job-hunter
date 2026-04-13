import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import type { CanonicalJobDetail, CanonicalJobId } from '@job-hunter/shared';

import { HttpError } from '../../src/http/http-errors.js';
import { createApplicationService } from '../../src/modules/applications/service.js';
import { createApiServer, type CreateApiServerOptions } from '../../src/server.js';

const createCanonicalJob = (canonicalJobId: CanonicalJobId): CanonicalJobDetail => {
  const nowIso = '2026-04-12T16:00:00.000Z';

  return {
    job: {
      canonicalJobId,
      canonicalCompanyName: 'Acme Labs',
      canonicalTitle: 'Senior Backend Engineer',
      normalizedLocation: 'Remote - United States',
      remoteType: 'remote',
      employmentType: 'full_time',
      salaryMin: 170000,
      salaryMax: 210000,
      salaryCurrency: 'USD',
      salaryPeriod: 'year',
      sourceCount: 1,
      sourceNames: ['greenhouse_public_board'],
      jobStatus: 'open',
      topSkills: ['TypeScript', 'Node.js'],
      firstSeenAt: nowIso,
      lastSeenAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    sourceMappings: [
      {
        sourceName: 'greenhouse_public_board',
        sourceJobId: '1001',
        isPrimary: true,
        mappingConfidence: 1,
        mappingReasonCodes: ['exact_company_title'],
      },
    ],
  };
};

const startServer = async (
  options?: CreateApiServerOptions,
): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> => {
  const server = createApiServer(options);

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed_to_start_test_server');
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

const registerAndGetAccessToken = async (baseUrl: string): Promise<string> => {
  const uniqueId = Math.random().toString(36).slice(2, 10);

  const response = await fetch(`${baseUrl}/v1/auth/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: `applications.integration.${uniqueId}@test.dev`,
    }),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as { session: { accessToken: string } };
  return body.session.accessToken;
};

test('application routes create/list/detail/update for authenticated users', async () => {
  const canonicalJobId = '0176660e-c89e-47ca-a8fc-c4ea580cf72f';
  const knownResumeId = '29885b07-87d4-4bfd-9e78-28ea11ec74ec';

  let nowCursor = Date.parse('2026-04-12T16:00:00.000Z');
  const applicationService = createApplicationService({
    canonicalJobLookup: {
      async getCanonicalJob(id) {
        return id === canonicalJobId ? createCanonicalJob(canonicalJobId) : null;
      },
    },
    resumeLookup: {
      async getResume(_userId, resumeId) {
        if (resumeId === knownResumeId) {
          return { resumeId };
        }

        throw new HttpError(404, 'resume_not_found', {
          resumeId,
        });
      },
    },
    now: () => {
      nowCursor += 1_000;
      return new Date(nowCursor);
    },
  });

  const app = await startServer({
    applicationService,
  });

  try {
    const accessToken = await registerAndGetAccessToken(app.baseUrl);

    const createResponse = await fetch(`${app.baseUrl}/v1/applications`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        canonicalJobId,
        notes: '  Initial notes for this application  ',
      }),
    });

    assert.equal(createResponse.status, 200);
    const createBody = (await createResponse.json()) as {
      contractVersion: string;
      application: { applicationId: string; status: string; notes: string | null };
    };

    assert.equal(createBody.contractVersion, 'v1');
    assert.equal(createBody.application.status, 'ready_to_apply');
    assert.equal(createBody.application.notes, 'Initial notes for this application');

    const listResponse = await fetch(
      `${app.baseUrl}/v1/applications?status=ready_to_apply&canonicalJobId=${canonicalJobId}&limit=10`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(listResponse.status, 200);
    const listBody = (await listResponse.json()) as {
      applications: Array<{ applicationId: string; status: string }>;
    };

    assert.equal(listBody.applications.length, 1);
    assert.equal(listBody.applications[0]?.applicationId, createBody.application.applicationId);

    const detailResponse = await fetch(
      `${app.baseUrl}/v1/applications/${createBody.application.applicationId}`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(detailResponse.status, 200);

    const updateResponse = await fetch(
      `${app.baseUrl}/v1/applications/${createBody.application.applicationId}`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          status: 'applied',
          resumeIdUsed: knownResumeId,
          applicationUrl: 'https://jobs.example.com/apply/1234',
        }),
      },
    );

    assert.equal(updateResponse.status, 200);
    const updateBody = (await updateResponse.json()) as {
      application: {
        status: string;
        appliedAt: string | null;
        resumeIdUsed: string | null;
        applicationUrl: string | null;
      };
    };

    assert.equal(updateBody.application.status, 'applied');
    assert.ok(updateBody.application.appliedAt);
    assert.equal(updateBody.application.resumeIdUsed, knownResumeId);
    assert.equal(updateBody.application.applicationUrl, 'https://jobs.example.com/apply/1234');

    const appliedListResponse = await fetch(
      `${app.baseUrl}/v1/applications?status=applied&limit=10`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(appliedListResponse.status, 200);
    const appliedListBody = (await appliedListResponse.json()) as {
      applications: Array<{ status: string }>;
    };

    assert.equal(appliedListBody.applications.length, 1);
    assert.equal(appliedListBody.applications[0]?.status, 'applied');
  } finally {
    await app.close();
  }
});

test('application routes enforce auth and validation errors', async () => {
  const canonicalJobId = 'a5f5ff4f-3dcf-4313-bfaa-34450970f1da';

  const applicationService = createApplicationService({
    canonicalJobLookup: {
      async getCanonicalJob(id) {
        return id === canonicalJobId ? createCanonicalJob(canonicalJobId) : null;
      },
    },
    resumeLookup: {
      async getResume(_userId, resumeId) {
        throw new HttpError(404, 'resume_not_found', {
          resumeId,
        });
      },
    },
  });

  const app = await startServer({
    applicationService,
  });

  try {
    const unauthorizedResponse = await fetch(`${app.baseUrl}/v1/applications`);
    assert.equal(unauthorizedResponse.status, 401);

    const accessToken = await registerAndGetAccessToken(app.baseUrl);

    const invalidLimitResponse = await fetch(`${app.baseUrl}/v1/applications?limit=bad`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(invalidLimitResponse.status, 400);

    const invalidStatusResponse = await fetch(`${app.baseUrl}/v1/applications?status=later`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(invalidStatusResponse.status, 400);

    const invalidCanonicalFilterResponse = await fetch(
      `${app.baseUrl}/v1/applications?canonicalJobId=not-a-uuid`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );
    assert.equal(invalidCanonicalFilterResponse.status, 400);

    const invalidBodyResponse = await fetch(`${app.baseUrl}/v1/applications`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    assert.equal(invalidBodyResponse.status, 400);

    const unknownCanonicalResponse = await fetch(`${app.baseUrl}/v1/applications`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        canonicalJobId: '7c79a7da-dd24-4f46-83ff-ce4915eaa9d3',
      }),
    });

    assert.equal(unknownCanonicalResponse.status, 404);

    const createResponse = await fetch(`${app.baseUrl}/v1/applications`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        canonicalJobId,
      }),
    });
    assert.equal(createResponse.status, 200);

    const duplicateResponse = await fetch(`${app.baseUrl}/v1/applications`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        canonicalJobId,
      }),
    });
    assert.equal(duplicateResponse.status, 409);

    const invalidApplicationIdResponse = await fetch(
      `${app.baseUrl}/v1/applications/not-a-uuid`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );
    assert.equal(invalidApplicationIdResponse.status, 400);

    const unknownApplicationResponse = await fetch(
      `${app.baseUrl}/v1/applications/2bcde7fc-2b8a-4fe8-a27d-e8984d96117f`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );
    assert.equal(unknownApplicationResponse.status, 404);

    const invalidUpdateBodyResponse = await fetch(
      `${app.baseUrl}/v1/applications/2bcde7fc-2b8a-4fe8-a27d-e8984d96117f`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );

    assert.equal(invalidUpdateBodyResponse.status, 400);
  } finally {
    await app.close();
  }
});
