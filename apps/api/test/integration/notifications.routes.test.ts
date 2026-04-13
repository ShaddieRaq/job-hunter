import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import type {
  CanonicalJobDetail,
  CanonicalJobId,
  MatchScoreArtifact,
} from '@job-hunter/shared';

import { createNotificationService } from '../../src/modules/notifications/service.js';
import { createReminderService } from '../../src/modules/reminders/service.js';
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

const createMatchScoreArtifact = (
  canonicalJobId: CanonicalJobId,
  overrides?: Partial<MatchScoreArtifact>,
): MatchScoreArtifact => ({
  userId: '8b027aa6-dfd3-4fb5-9276-b6e9a257f543',
  canonicalJobId,
  artifactVersion: 1,
  scoringVersion: 'deterministic-v1',
  scoreBreakdown: {
    overallScore: 84,
    titleScore: 85,
    skillScore: 83,
    seniorityScore: 82,
    locationScore: 88,
    compensationScore: 80,
    domainScore: 79,
    requirementScore: 84,
    trajectoryScore: 81,
    penaltyScore: 5,
  },
  strengths: ['Strong backend alignment'],
  gaps: ['Limited domain depth'],
  dealBreakers: [],
  recommendation: 'apply',
  explanation: null,
  explanationMetadata: null,
  explanationErrorCode: null,
  scoredAt: '2026-04-12T16:00:00.000Z',
  ...overrides,
});

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
      email: `notifications.integration.${uniqueId}@test.dev`,
    }),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as { session: { accessToken: string } };
  return body.session.accessToken;
};

test('notification routes dispatch due reminder notifications and list sent logs', async () => {
  const canonicalJobId = '0fe83d4c-8e17-43ac-9f3c-ef2478406226';
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

  const notificationService = createNotificationService({
    reminderReader: reminderService,
    now: (() => {
      let current = Date.parse('2026-04-12T16:30:00.000Z');
      return () => {
        current += 1_000;
        return new Date(current);
      };
    })(),
  });

  const app = await startServer({
    reminderService,
    notificationService,
  });

  try {
    const accessToken = await registerAndGetAccessToken(app.baseUrl);

    const dueReminderResponse = await fetch(`${app.baseUrl}/v1/reminders`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        canonicalJobId,
        taskType: 'custom',
        title: 'Follow up now',
        dueAt: '2026-04-12T15:00:00.000Z',
      }),
    });

    assert.equal(dueReminderResponse.status, 200);
    const dueReminderBody = (await dueReminderResponse.json()) as {
      reminder: { reminderId: string };
    };

    const futureReminderResponse = await fetch(`${app.baseUrl}/v1/reminders`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        canonicalJobId,
        taskType: 'custom',
        title: 'Follow up later',
        dueAt: '2026-04-14T15:00:00.000Z',
      }),
    });

    assert.equal(futureReminderResponse.status, 200);

    const dispatchResponse = await fetch(
      `${app.baseUrl}/v1/notifications/reminders/dispatch`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );

    assert.equal(dispatchResponse.status, 200);
    const dispatchBody = (await dispatchResponse.json()) as {
      contractVersion: string;
      queuedCount: number;
      sentCount: number;
      skippedCount: number;
    };

    assert.equal(dispatchBody.contractVersion, 'v1');
    assert.equal(dispatchBody.queuedCount, 1);
    assert.equal(dispatchBody.sentCount, 1);
    assert.equal(dispatchBody.skippedCount, 0);

    const sentNotificationsResponse = await fetch(
      `${app.baseUrl}/v1/notifications?status=sent&limit=10`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(sentNotificationsResponse.status, 200);
    const sentNotificationsBody = (await sentNotificationsResponse.json()) as {
      notifications: Array<{
        reminderId: string;
        status: string;
        notificationType: string;
      }>;
    };

    assert.equal(sentNotificationsBody.notifications.length, 1);
    assert.equal(
      sentNotificationsBody.notifications[0]?.reminderId,
      dueReminderBody.reminder.reminderId,
    );
    assert.equal(sentNotificationsBody.notifications[0]?.status, 'sent');
    assert.equal(sentNotificationsBody.notifications[0]?.notificationType, 'reminder_due');

    const secondDispatchResponse = await fetch(
      `${app.baseUrl}/v1/notifications/reminders/dispatch`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );

    assert.equal(secondDispatchResponse.status, 200);
    const secondDispatchBody = (await secondDispatchResponse.json()) as {
      queuedCount: number;
      sentCount: number;
      skippedCount: number;
    };

    assert.equal(secondDispatchBody.queuedCount, 0);
    assert.equal(secondDispatchBody.sentCount, 0);
    assert.equal(secondDispatchBody.skippedCount, 1);
  } finally {
    await app.close();
  }
});

test('notification routes enforce auth and request validation', async () => {
  const canonicalJobId = '1af24feb-0d87-4f73-89ee-5edfca58b6f8';
  const reminderService = createReminderService({
    canonicalJobLookup: {
      async getCanonicalJob(id) {
        return id === canonicalJobId ? createCanonicalJob(canonicalJobId) : null;
      },
    },
  });

  const notificationService = createNotificationService({
    reminderReader: reminderService,
  });

  const app = await startServer({
    reminderService,
    notificationService,
  });

  try {
    const unauthorizedResponse = await fetch(`${app.baseUrl}/v1/notifications`);
    assert.equal(unauthorizedResponse.status, 401);

    const accessToken = await registerAndGetAccessToken(app.baseUrl);

    const invalidLimitResponse = await fetch(
      `${app.baseUrl}/v1/notifications?limit=bad`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );
    assert.equal(invalidLimitResponse.status, 400);

    const invalidStatusResponse = await fetch(
      `${app.baseUrl}/v1/notifications?status=later`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );
    assert.equal(invalidStatusResponse.status, 400);

    const invalidDispatchBodyResponse = await fetch(
      `${app.baseUrl}/v1/notifications/reminders/dispatch`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          referenceTime: 'not-a-date',
        }),
      },
    );

    assert.equal(invalidDispatchBodyResponse.status, 400);

    const unauthorizedHighFitDispatch = await fetch(
      `${app.baseUrl}/v1/notifications/high-fit/dispatch`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );

    assert.equal(unauthorizedHighFitDispatch.status, 401);

    const invalidHighFitDispatchBody = await fetch(
      `${app.baseUrl}/v1/notifications/high-fit/dispatch`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          referenceTime: 'not-a-date',
        }),
      },
    );

    assert.equal(invalidHighFitDispatchBody.status, 400);
  } finally {
    await app.close();
  }
});

test('notification routes dispatch high-fit alerts and list sent logs', async () => {
  const eligibleCanonicalJobId =
    'f4b91168-9d31-4a52-84ad-e16d15731e24' as CanonicalJobId;

  const notificationService = createNotificationService({
    reminderReader: {
      async listReminders() {
        return [];
      },
    },
    highFitCandidateReader: {
      async listCandidates() {
        return [
          {
            canonicalJobId: eligibleCanonicalJobId,
            canonicalCompanyName: 'Acme Labs',
            canonicalTitle: 'Staff Platform Engineer',
            latestScoreArtifact: createMatchScoreArtifact(eligibleCanonicalJobId, {
              artifactVersion: 5,
            }),
            trackerState: 'reviewing',
          },
          {
            canonicalJobId: 'ba580870-9e5c-4f2c-9884-dbf37ddf21df',
            canonicalCompanyName: 'Later Corp',
            canonicalTitle: 'Backend Engineer',
            latestScoreArtifact: createMatchScoreArtifact(
              'ba580870-9e5c-4f2c-9884-dbf37ddf21df',
              {
                artifactVersion: 6,
                scoreBreakdown: {
                  overallScore: 74,
                  titleScore: 85,
                  skillScore: 83,
                  seniorityScore: 82,
                  locationScore: 88,
                  compensationScore: 80,
                  domainScore: 79,
                  requirementScore: 84,
                  trajectoryScore: 81,
                  penaltyScore: 5,
                },
              },
            ),
            trackerState: 'reviewing',
          },
        ];
      },
    },
    now: (() => {
      let current = Date.parse('2026-04-12T16:30:00.000Z');
      return () => {
        current += 1_000;
        return new Date(current);
      };
    })(),
  });

  const app = await startServer({
    notificationService,
  });

  try {
    const accessToken = await registerAndGetAccessToken(app.baseUrl);

    const dispatchResponse = await fetch(
      `${app.baseUrl}/v1/notifications/high-fit/dispatch`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );

    assert.equal(dispatchResponse.status, 200);
    const dispatchBody = (await dispatchResponse.json()) as {
      queuedCount: number;
      sentCount: number;
      skippedCount: number;
    };

    assert.equal(dispatchBody.queuedCount, 1);
    assert.equal(dispatchBody.sentCount, 1);
    assert.equal(dispatchBody.skippedCount, 0);

    const notificationsResponse = await fetch(
      `${app.baseUrl}/v1/notifications?status=sent&limit=10`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    assert.equal(notificationsResponse.status, 200);
    const notificationsBody = (await notificationsResponse.json()) as {
      notifications: Array<{
        notificationType: string;
        canonicalJobId: string;
        reminderId: string | null;
        matchArtifactVersion: number | null;
      }>;
    };

    assert.equal(notificationsBody.notifications.length, 1);
    assert.equal(
      notificationsBody.notifications[0]?.notificationType,
      'high_fit_alert',
    );
    assert.equal(
      notificationsBody.notifications[0]?.canonicalJobId,
      eligibleCanonicalJobId,
    );
    assert.equal(notificationsBody.notifications[0]?.reminderId, null);
    assert.equal(notificationsBody.notifications[0]?.matchArtifactVersion, 5);

    const secondDispatchResponse = await fetch(
      `${app.baseUrl}/v1/notifications/high-fit/dispatch`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );

    assert.equal(secondDispatchResponse.status, 200);
    const secondDispatchBody = (await secondDispatchResponse.json()) as {
      queuedCount: number;
      sentCount: number;
      skippedCount: number;
    };

    assert.equal(secondDispatchBody.queuedCount, 0);
    assert.equal(secondDispatchBody.sentCount, 0);
    assert.equal(secondDispatchBody.skippedCount, 1);
  } finally {
    await app.close();
  }
});
