import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import type { CanonicalJobId, CanonicalJobDetail } from '@job-hunter/shared';

import { createTrackerService } from '../../src/modules/tracker/service.js';
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
      email: `tracker.integration.${uniqueId}@test.dev`,
    }),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as { session: { accessToken: string } };
  return body.session.accessToken;
};

test('tracker routes transition/list/detail/history for authenticated users', async () => {
  const canonicalJobId = '723f79f8-2640-4d5d-9a85-b8fceb3c0d13';
  const trackerService = createTrackerService({
    canonicalJobLookup: {
      async getCanonicalJob(id) {
        return id === canonicalJobId ? createCanonicalJob(canonicalJobId) : null;
      },
    },
    now: (() => {
      let current = Date.parse('2026-04-12T16:00:00.000Z');
      return () => {
        current += 1_000;
        return new Date(current);
      };
    })(),
  });

  const app = await startServer({
    trackerService,
  });

  try {
    const accessToken = await registerAndGetAccessToken(app.baseUrl);

    const discoveredResponse = await fetch(
      `${app.baseUrl}/v1/tracker/jobs/${canonicalJobId}/state`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          targetState: 'discovered',
          note: 'Initial discovery',
        }),
      },
    );

    assert.equal(discoveredResponse.status, 200);

    const shortlistedResponse = await fetch(
      `${app.baseUrl}/v1/tracker/jobs/${canonicalJobId}/state`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          targetState: 'shortlisted',
          note: 'Looks promising',
        }),
      },
    );

    assert.equal(shortlistedResponse.status, 200);
    const shortlistedBody = (await shortlistedResponse.json()) as {
      contractVersion: string;
      tracker: { state: string; canonicalJobId: string };
      event: { fromState: string; toState: string };
    };

    assert.equal(shortlistedBody.contractVersion, 'v1');
    assert.equal(shortlistedBody.tracker.canonicalJobId, canonicalJobId);
    assert.equal(shortlistedBody.tracker.state, 'shortlisted');
    assert.equal(shortlistedBody.event.fromState, 'discovered');
    assert.equal(shortlistedBody.event.toState, 'shortlisted');

    const listResponse = await fetch(`${app.baseUrl}/v1/tracker/jobs?limit=10`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(listResponse.status, 200);
    const listBody = (await listResponse.json()) as {
      trackers: Array<{ canonicalJobId: string; state: string }>;
    };

    assert.equal(listBody.trackers.length, 1);
    assert.equal(listBody.trackers[0]?.canonicalJobId, canonicalJobId);
    assert.equal(listBody.trackers[0]?.state, 'shortlisted');

    const detailResponse = await fetch(`${app.baseUrl}/v1/tracker/jobs/${canonicalJobId}`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(detailResponse.status, 200);
    const detailBody = (await detailResponse.json()) as {
      tracker: { state: string };
    };

    assert.equal(detailBody.tracker.state, 'shortlisted');

    const historyResponse = await fetch(
      `${app.baseUrl}/v1/tracker/jobs/${canonicalJobId}/history?limit=10`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(historyResponse.status, 200);
    const historyBody = (await historyResponse.json()) as {
      events: Array<{ toState: string }>;
    };

    assert.equal(historyBody.events.length, 2);
    assert.equal(historyBody.events[0]?.toState, 'shortlisted');
    assert.equal(historyBody.events[1]?.toState, 'discovered');
  } finally {
    await app.close();
  }
});

test('tracker routes enforce auth and transition validation', async () => {
  const canonicalJobId = '7736ad68-45cc-4ce6-aa8f-8b7e25795bcb';
  const trackerService = createTrackerService({
    canonicalJobLookup: {
      async getCanonicalJob(id) {
        return id === canonicalJobId ? createCanonicalJob(canonicalJobId) : null;
      },
    },
  });

  const app = await startServer({
    trackerService,
  });

  try {
    const unauthorizedResponse = await fetch(`${app.baseUrl}/v1/tracker/jobs`);
    assert.equal(unauthorizedResponse.status, 401);

    const accessToken = await registerAndGetAccessToken(app.baseUrl);

    const invalidIdResponse = await fetch(
      `${app.baseUrl}/v1/tracker/jobs/not-a-uuid/state`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          targetState: 'discovered',
        }),
      },
    );

    assert.equal(invalidIdResponse.status, 400);

    const unknownCanonicalResponse = await fetch(
      `${app.baseUrl}/v1/tracker/jobs/2e776e19-2f8f-4e2c-b6d6-d85bb6bc94f1/state`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          targetState: 'discovered',
        }),
      },
    );

    assert.equal(unknownCanonicalResponse.status, 404);

    const discoveredResponse = await fetch(
      `${app.baseUrl}/v1/tracker/jobs/${canonicalJobId}/state`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          targetState: 'discovered',
        }),
      },
    );

    assert.equal(discoveredResponse.status, 200);

    const invalidTransitionResponse = await fetch(
      `${app.baseUrl}/v1/tracker/jobs/${canonicalJobId}/state`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          targetState: 'offer',
        }),
      },
    );

    assert.equal(invalidTransitionResponse.status, 400);
  } finally {
    await app.close();
  }
});

test('tracker discovery action route maps save/shortlist/hide semantics', async () => {
  const canonicalJobId = '14839c97-e93f-4774-a6d0-d95f4d030885';
  const trackerService = createTrackerService({
    canonicalJobLookup: {
      async getCanonicalJob(id) {
        return id === canonicalJobId ? createCanonicalJob(canonicalJobId) : null;
      },
    },
  });

  const app = await startServer({
    trackerService,
  });

  try {
    const accessToken = await registerAndGetAccessToken(app.baseUrl);

    const saveResponse = await fetch(
      `${app.baseUrl}/v1/tracker/jobs/${canonicalJobId}/actions/save`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );

    assert.equal(saveResponse.status, 200);
    const saveBody = (await saveResponse.json()) as {
      action: string;
      tracker: { state: string };
      event: { toState: string } | null;
    };

    assert.equal(saveBody.action, 'save');
    assert.equal(saveBody.tracker.state, 'reviewing');
    assert.equal(saveBody.event?.toState, 'reviewing');

    const shortlistResponse = await fetch(
      `${app.baseUrl}/v1/tracker/jobs/${canonicalJobId}/actions/shortlist`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );

    assert.equal(shortlistResponse.status, 200);
    const shortlistBody = (await shortlistResponse.json()) as {
      action: string;
      tracker: { state: string };
    };
    assert.equal(shortlistBody.action, 'shortlist');
    assert.equal(shortlistBody.tracker.state, 'shortlisted');

    const hideResponse = await fetch(
      `${app.baseUrl}/v1/tracker/jobs/${canonicalJobId}/actions/hide`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ note: 'Hide this role from discovery feed' }),
      },
    );

    assert.equal(hideResponse.status, 200);
    const hideBody = (await hideResponse.json()) as {
      action: string;
      tracker: { state: string; lastTransitionNote: string | null };
      event: { toState: string } | null;
    };

    assert.equal(hideBody.action, 'hide');
    assert.equal(hideBody.tracker.state, 'archived');
    assert.equal(hideBody.tracker.lastTransitionNote, 'Hide this role from discovery feed');
    assert.equal(hideBody.event?.toState, 'archived');

    const invalidActionResponse = await fetch(
      `${app.baseUrl}/v1/tracker/jobs/${canonicalJobId}/actions/not-real`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );

    assert.equal(invalidActionResponse.status, 400);
  } finally {
    await app.close();
  }
});
