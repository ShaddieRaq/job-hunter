import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import type { CanonicalJobDetail, CanonicalJobId } from '@job-hunter/shared';

import { createReminderService } from '../../src/modules/reminders/service.js';
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
      email: `reminders.integration.${uniqueId}@test.dev`,
    }),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as { session: { accessToken: string } };
  return body.session.accessToken;
};

test('reminder routes create/list/detail/complete for authenticated users', async () => {
  const canonicalJobId = 'd643dc22-1477-4ee2-be97-6fb1ddd84a61';
  const reminderService = createReminderService({
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
    reminderService,
  });

  try {
    const accessToken = await registerAndGetAccessToken(app.baseUrl);

    const createResponse = await fetch(`${app.baseUrl}/v1/reminders`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        canonicalJobId,
        taskType: 'custom',
        title: ' Prepare follow-up email ',
        note: ' include portfolio ',
        dueAt: '2026-04-18T16:00:00.000Z',
      }),
    });

    assert.equal(createResponse.status, 200);
    const createBody = (await createResponse.json()) as {
      contractVersion: string;
      reminder: { reminderId: string; status: string; title: string; note: string | null };
    };

    assert.equal(createBody.contractVersion, 'v1');
    assert.equal(createBody.reminder.status, 'pending');
    assert.equal(createBody.reminder.title, 'Prepare follow-up email');
    assert.equal(createBody.reminder.note, 'include portfolio');

    const listPendingResponse = await fetch(
      `${app.baseUrl}/v1/reminders?status=pending&canonicalJobId=${canonicalJobId}&limit=10`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(listPendingResponse.status, 200);
    const listPendingBody = (await listPendingResponse.json()) as {
      reminders: Array<{ reminderId: string; status: string }>;
    };

    assert.equal(listPendingBody.reminders.length, 1);
    assert.equal(listPendingBody.reminders[0]?.reminderId, createBody.reminder.reminderId);

    const detailResponse = await fetch(
      `${app.baseUrl}/v1/reminders/${createBody.reminder.reminderId}`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(detailResponse.status, 200);

    const completeResponse = await fetch(
      `${app.baseUrl}/v1/reminders/${createBody.reminder.reminderId}/complete`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );

    assert.equal(completeResponse.status, 200);
    const completeBody = (await completeResponse.json()) as {
      reminder: { status: string; completedAt: string | null };
    };

    assert.equal(completeBody.reminder.status, 'completed');
    assert.ok(completeBody.reminder.completedAt);

    const listCompletedResponse = await fetch(
      `${app.baseUrl}/v1/reminders?status=completed&limit=10`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(listCompletedResponse.status, 200);
    const listCompletedBody = (await listCompletedResponse.json()) as {
      reminders: Array<{ status: string }>;
    };

    assert.equal(listCompletedBody.reminders.length, 1);
    assert.equal(listCompletedBody.reminders[0]?.status, 'completed');
  } finally {
    await app.close();
  }
});

test('reminder routes enforce auth and validation errors', async () => {
  const canonicalJobId = '8524dc6c-8b0b-4f0f-83fa-cd3fe28ce78b';
  const reminderService = createReminderService({
    canonicalJobLookup: {
      async getCanonicalJob(id) {
        return id === canonicalJobId ? createCanonicalJob(canonicalJobId) : null;
      },
    },
  });

  const app = await startServer({
    reminderService,
  });

  try {
    const unauthorizedResponse = await fetch(`${app.baseUrl}/v1/reminders`);
    assert.equal(unauthorizedResponse.status, 401);

    const accessToken = await registerAndGetAccessToken(app.baseUrl);

    const invalidLimitResponse = await fetch(`${app.baseUrl}/v1/reminders?limit=bad`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(invalidLimitResponse.status, 400);

    const invalidStatusResponse = await fetch(`${app.baseUrl}/v1/reminders?status=later`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(invalidStatusResponse.status, 400);

    const invalidJobIdFilterResponse = await fetch(
      `${app.baseUrl}/v1/reminders?canonicalJobId=not-a-uuid`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );
    assert.equal(invalidJobIdFilterResponse.status, 400);

    const invalidBodyResponse = await fetch(`${app.baseUrl}/v1/reminders`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        canonicalJobId,
        taskType: 'custom',
        title: '',
        dueAt: '2026-04-18T16:00:00.000Z',
      }),
    });

    assert.equal(invalidBodyResponse.status, 400);

    const unknownCanonicalResponse = await fetch(`${app.baseUrl}/v1/reminders`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        canonicalJobId: '5ebfa02e-b2bc-4d22-bb74-477de49fcb56',
        taskType: 'custom',
        title: 'Follow up',
        dueAt: '2026-04-18T16:00:00.000Z',
      }),
    });

    assert.equal(unknownCanonicalResponse.status, 404);

    const invalidReminderIdResponse = await fetch(`${app.baseUrl}/v1/reminders/not-a-uuid`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(invalidReminderIdResponse.status, 400);

    const unknownReminderResponse = await fetch(
      `${app.baseUrl}/v1/reminders/7ddf02a2-7cc8-4320-b0e4-edc1ee47d154`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(unknownReminderResponse.status, 404);
  } finally {
    await app.close();
  }
});

test('tracker transitions auto-create reminder tasks for applied and interview states', async () => {
  const canonicalJobId = '8f70e74f-bf18-4f3b-8fef-0d32c0bd3be0';
  const reminderService = createReminderService({
    canonicalJobLookup: {
      async getCanonicalJob(id) {
        return id === canonicalJobId ? createCanonicalJob(canonicalJobId) : null;
      },
    },
    now: () => new Date('2026-04-12T16:30:00.000Z'),
  });

  let trackerNow = Date.parse('2026-04-12T16:00:00.000Z');
  const trackerService = createTrackerService({
    canonicalJobLookup: {
      async getCanonicalJob(id) {
        return id === canonicalJobId ? createCanonicalJob(canonicalJobId) : null;
      },
    },
    transitionObservers: [reminderService],
    now: () => {
      trackerNow += 1_000;
      return new Date(trackerNow);
    },
  });

  const app = await startServer({
    reminderService,
    trackerService,
  });

  try {
    const accessToken = await registerAndGetAccessToken(app.baseUrl);

    for (const targetState of ['discovered', 'shortlisted', 'ready_to_apply', 'applied', 'interview'] as const) {
      const transitionResponse = await fetch(
        `${app.baseUrl}/v1/tracker/jobs/${canonicalJobId}/state`,
        {
          method: 'PUT',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            targetState,
          }),
        },
      );

      assert.equal(transitionResponse.status, 200);
    }

    const remindersResponse = await fetch(`${app.baseUrl}/v1/reminders?limit=10`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(remindersResponse.status, 200);
    const remindersBody = (await remindersResponse.json()) as {
      reminders: Array<{ taskType: string; status: string; linkedTrackerEventId: string | null }>;
    };

    assert.equal(remindersBody.reminders.length, 2);
    assert.deepEqual(
      remindersBody.reminders.map((reminder) => reminder.taskType).sort(),
      ['application_follow_up', 'interview_prep'],
    );
    assert.ok(remindersBody.reminders.every((reminder) => reminder.status === 'pending'));
    assert.ok(
      remindersBody.reminders.every(
        (reminder) => typeof reminder.linkedTrackerEventId === 'string',
      ),
    );
  } finally {
    await app.close();
  }
});
