import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import { createApiServer, type CreateApiServerOptions } from '../../src/server.js';
import { createInMemoryAtsTargetVerificationEventRepository } from '../../src/modules/ats-target-registry/in-memory-repository.js';
import { createAtsTargetVerificationEventService } from '../../src/modules/ats-target-registry/verification-events-service.js';

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

const registerAndGetSession = async (
  baseUrl: string,
): Promise<{ accessToken: string; userId: string }> => {
  const uniqueId = Math.random().toString(36).slice(2, 10);

  const response = await fetch(`${baseUrl}/v1/auth/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: `ats.verification.events.${uniqueId}@test.dev`,
    }),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    session: {
      accessToken: string;
      user: {
        userId: string;
      };
    };
  };

  return {
    accessToken: body.session.accessToken,
    userId: body.session.user.userId,
  };
};

test('ats verification event route returns paginated target/vendor history deterministically', async () => {
  const targetVendorMap = new Map<string, 'greenhouse' | 'lever'>();
  const eventRepository = createInMemoryAtsTargetVerificationEventRepository({
    resolveVendorByTargetId: async (targetId) => targetVendorMap.get(targetId) ?? null,
  });

  const app = await startServer({
    atsTargetVerificationEventService: createAtsTargetVerificationEventService({
      repository: eventRepository,
    }),
  });

  try {
    const session = await registerAndGetSession(app.baseUrl);
    const slug = Math.random().toString(36).slice(2, 8);

    const greenhouseCreate = await fetch(`${app.baseUrl}/v1/ats-targets`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        company: {
          canonicalName: 'Acme Labs',
        },
        atsVendor: 'greenhouse',
        identifierType: 'board_token',
        identifierValue: `acme-${slug}`,
      }),
    });
    assert.equal(greenhouseCreate.status, 200);
    const greenhouseBody = (await greenhouseCreate.json()) as {
      atsTarget: { targetId: string };
    };
    targetVendorMap.set(greenhouseBody.atsTarget.targetId, 'greenhouse');

    const leverCreate = await fetch(`${app.baseUrl}/v1/ats-targets`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        company: {
          canonicalName: 'Globex',
        },
        atsVendor: 'lever',
        identifierType: 'handle',
        identifierValue: `globex-${slug}`,
      }),
    });
    assert.equal(leverCreate.status, 200);
    const leverBody = (await leverCreate.json()) as {
      atsTarget: { targetId: string };
    };
    targetVendorMap.set(leverBody.atsTarget.targetId, 'lever');

    await eventRepository.createVerificationEvent({
      eventId: 'd5355745-ca9e-44c0-b70e-87f8cb78440f',
      targetId: greenhouseBody.atsTarget.targetId,
      attemptedAt: '2026-04-14T12:00:00.000Z',
      outcomeStatus: 'verified',
      httpStatus: 200,
      errorCode: null,
      evidenceSummary: 'greenhouse_probe_status_200',
    });
    await eventRepository.createVerificationEvent({
      eventId: 'f16fa4f9-a444-4fa5-9a79-a5f9094ece6b',
      targetId: leverBody.atsTarget.targetId,
      attemptedAt: '2026-04-14T12:01:00.000Z',
      outcomeStatus: 'failed',
      httpStatus: 404,
      errorCode: 'lever_target_not_found',
      evidenceSummary: 'lever_probe_status_404',
    });
    await eventRepository.createVerificationEvent({
      eventId: '00ddb328-ed9a-4f70-b7ca-7f74b2d73497',
      targetId: greenhouseBody.atsTarget.targetId,
      attemptedAt: '2026-04-14T12:02:00.000Z',
      outcomeStatus: 'stale',
      httpStatus: null,
      errorCode: 'refresh_window_elapsed',
      evidenceSummary: 'scheduled_refresh_window_reached',
    });

    const greenhouseOnlyResponse = await fetch(
      `${app.baseUrl}/v1/ats-target-verification-events?atsVendor=greenhouse&limit=10`,
      {
        headers: {
          authorization: `Bearer ${session.accessToken}`,
        },
      },
    );
    assert.equal(greenhouseOnlyResponse.status, 200);
    const greenhouseOnlyBody = (await greenhouseOnlyResponse.json()) as {
      contractVersion: string;
      verificationEvents: Array<{ targetId: string; eventId: string }>;
    };
    assert.equal(greenhouseOnlyBody.contractVersion, 'v1');
    assert.equal(greenhouseOnlyBody.verificationEvents.length, 2);
    assert.ok(
      greenhouseOnlyBody.verificationEvents.every(
        (event) => event.targetId === greenhouseBody.atsTarget.targetId,
      ),
    );

    const targetFilteredResponse = await fetch(
      `${app.baseUrl}/v1/ats-target-verification-events?targetId=${leverBody.atsTarget.targetId}&limit=10`,
      {
        headers: {
          authorization: `Bearer ${session.accessToken}`,
        },
      },
    );
    assert.equal(targetFilteredResponse.status, 200);
    const targetFilteredBody = (await targetFilteredResponse.json()) as {
      verificationEvents: Array<{ eventId: string }>;
    };
    assert.equal(targetFilteredBody.verificationEvents.length, 1);
    assert.equal(
      targetFilteredBody.verificationEvents[0]?.eventId,
      'f16fa4f9-a444-4fa5-9a79-a5f9094ece6b',
    );

    const paginatedResponse = await fetch(
      `${app.baseUrl}/v1/ats-target-verification-events?limit=1&offset=1`,
      {
        headers: {
          authorization: `Bearer ${session.accessToken}`,
        },
      },
    );
    assert.equal(paginatedResponse.status, 200);
    const paginatedBody = (await paginatedResponse.json()) as {
      verificationEvents: Array<{ eventId: string }>;
    };
    assert.equal(paginatedBody.verificationEvents.length, 1);
    assert.equal(
      paginatedBody.verificationEvents[0]?.eventId,
      'f16fa4f9-a444-4fa5-9a79-a5f9094ece6b',
    );
  } finally {
    await app.close();
  }
});

test('ats verification event route enforces auth and query validation', async () => {
  const app = await startServer();

  try {
    const unauthorizedResponse = await fetch(
      `${app.baseUrl}/v1/ats-target-verification-events`,
    );
    assert.equal(unauthorizedResponse.status, 401);

    const session = await registerAndGetSession(app.baseUrl);

    const invalidLimitResponse = await fetch(
      `${app.baseUrl}/v1/ats-target-verification-events?limit=oops`,
      {
        headers: {
          authorization: `Bearer ${session.accessToken}`,
        },
      },
    );
    assert.equal(invalidLimitResponse.status, 400);

    const invalidTargetIdResponse = await fetch(
      `${app.baseUrl}/v1/ats-target-verification-events?targetId=not-a-uuid`,
      {
        headers: {
          authorization: `Bearer ${session.accessToken}`,
        },
      },
    );
    assert.equal(invalidTargetIdResponse.status, 400);

    const invalidVendorResponse = await fetch(
      `${app.baseUrl}/v1/ats-target-verification-events?atsVendor=invalid_vendor`,
      {
        headers: {
          authorization: `Bearer ${session.accessToken}`,
        },
      },
    );
    assert.equal(invalidVendorResponse.status, 400);
  } finally {
    await app.close();
  }
});