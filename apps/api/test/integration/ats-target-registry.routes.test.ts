import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import { createApiServer, type CreateApiServerOptions } from '../../src/server.js';

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
      email: `ats.target.routes.${uniqueId}@test.dev`,
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

test('ats target routes create/list/update for authenticated users', async () => {
  const app = await startServer();

  try {
    const session = await registerAndGetSession(app.baseUrl);
    const uniqueSlug = Math.random().toString(36).slice(2, 8);

    const createResponse = await fetch(`${app.baseUrl}/v1/ats-targets`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        company: {
          canonicalName: 'Acme Labs',
          websiteDomain: 'https://www.acme.example/careers',
          sourceProvenance: 'manual entry',
        },
        atsVendor: 'greenhouse',
        identifierType: 'board_token',
        identifierValue: `acme-${uniqueSlug}`,
        verificationStatus: 'pending',
        nextVerificationAt: '2026-04-15T00:00:00.000Z',
      }),
    });

    assert.equal(createResponse.status, 200);
    const createBody = (await createResponse.json()) as {
      contractVersion: string;
      atsTarget: {
        targetId: string;
        identifierValue: string;
        verificationStatus: string;
        company: {
          websiteDomain: string | null;
        };
        sourceProvenance: string;
      };
    };

    assert.equal(createBody.contractVersion, 'v1');
    assert.equal(createBody.atsTarget.identifierValue, `acme-${uniqueSlug}`);
    assert.equal(createBody.atsTarget.verificationStatus, 'pending');
    assert.equal(createBody.atsTarget.company.websiteDomain, 'acme.example');

    const createProvenance = JSON.parse(createBody.atsTarget.sourceProvenance) as {
      audit: {
        actorUserId: string;
        writeAction: string;
      };
    };

    assert.equal(createProvenance.audit.actorUserId, session.userId);
    assert.equal(createProvenance.audit.writeAction, 'create_target');

    const listPendingResponse = await fetch(
      `${app.baseUrl}/v1/ats-targets?atsVendor=greenhouse&verificationStatus=pending&limit=10`,
      {
        headers: {
          authorization: `Bearer ${session.accessToken}`,
        },
      },
    );

    assert.equal(listPendingResponse.status, 200);
    const listPendingBody = (await listPendingResponse.json()) as {
      atsTargets: Array<{ targetId: string; verificationStatus: string }>;
    };

    assert.ok(
      listPendingBody.atsTargets.some(
        (target) => target.targetId === createBody.atsTarget.targetId,
      ),
    );

    const updateResponse = await fetch(
      `${app.baseUrl}/v1/ats-targets/${createBody.atsTarget.targetId}`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${session.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          verificationStatus: 'verified',
          verificationConfidence: 0.96,
          verificationReason: 'greenhouse_public_board_verified',
          lastVerifiedAt: '2026-04-14T20:00:00.000Z',
        }),
      },
    );

    assert.equal(updateResponse.status, 200);
    const updateBody = (await updateResponse.json()) as {
      atsTarget: {
        verificationStatus: string;
        verificationConfidence: number | null;
        verificationReason: string | null;
        sourceProvenance: string;
      };
    };

    assert.equal(updateBody.atsTarget.verificationStatus, 'verified');
    assert.equal(updateBody.atsTarget.verificationConfidence, 0.96);
    assert.equal(
      updateBody.atsTarget.verificationReason,
      'greenhouse_public_board_verified',
    );

    const updateProvenance = JSON.parse(updateBody.atsTarget.sourceProvenance) as {
      audit: {
        actorUserId: string;
        writeAction: string;
      };
    };

    assert.equal(updateProvenance.audit.actorUserId, session.userId);
    assert.equal(updateProvenance.audit.writeAction, 'update_target');

    const listVerifiedResponse = await fetch(
      `${app.baseUrl}/v1/ats-targets?atsVendor=greenhouse&verificationStatus=verified&limit=10`,
      {
        headers: {
          authorization: `Bearer ${session.accessToken}`,
        },
      },
    );

    assert.equal(listVerifiedResponse.status, 200);
    const listVerifiedBody = (await listVerifiedResponse.json()) as {
      atsTargets: Array<{ targetId: string; verificationStatus: string }>;
    };

    const updatedTarget = listVerifiedBody.atsTargets.find(
      (target) => target.targetId === createBody.atsTarget.targetId,
    );
    assert.equal(updatedTarget?.verificationStatus, 'verified');
  } finally {
    await app.close();
  }
});

test('ats target routes enforce auth and validation constraints', async () => {
  const app = await startServer();

  try {
    const unauthorizedResponse = await fetch(`${app.baseUrl}/v1/ats-targets`);
    assert.equal(unauthorizedResponse.status, 401);

    const session = await registerAndGetSession(app.baseUrl);
    const uniqueSlug = Math.random().toString(36).slice(2, 8);

    const invalidBodyResponse = await fetch(`${app.baseUrl}/v1/ats-targets`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        company: {
          canonicalName: '',
        },
        atsVendor: 'greenhouse',
        identifierType: 'board_token',
        identifierValue: '',
      }),
    });

    assert.equal(invalidBodyResponse.status, 400);

    const invalidVendorResponse = await fetch(
      `${app.baseUrl}/v1/ats-targets?atsVendor=invalid_vendor`,
      {
        headers: {
          authorization: `Bearer ${session.accessToken}`,
        },
      },
    );

    assert.equal(invalidVendorResponse.status, 400);

    const createdResponse = await fetch(`${app.baseUrl}/v1/ats-targets`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        company: {
          canonicalName: 'Globex Corporation',
        },
        atsVendor: 'lever',
        identifierType: 'handle',
        identifierValue: `globex-${uniqueSlug}`,
      }),
    });

    assert.equal(createdResponse.status, 200);

    const duplicateResponse = await fetch(`${app.baseUrl}/v1/ats-targets`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        company: {
          canonicalName: 'Globex Corporation',
        },
        atsVendor: 'lever',
        identifierType: 'handle',
        identifierValue: ` GLOBEX-${uniqueSlug} `,
      }),
    });

    assert.equal(duplicateResponse.status, 409);

    const invalidIdResponse = await fetch(`${app.baseUrl}/v1/ats-targets/not-a-uuid`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        verificationStatus: 'verified',
      }),
    });

    assert.equal(invalidIdResponse.status, 400);

    const unknownTargetResponse = await fetch(
      `${app.baseUrl}/v1/ats-targets/96d72ccd-5954-4f34-83c5-d574f82fdeb3`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${session.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          verificationStatus: 'verified',
        }),
      },
    );

    assert.equal(unknownTargetResponse.status, 404);

    const validCreateResponse = await fetch(`${app.baseUrl}/v1/ats-targets`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        company: {
          canonicalName: 'Initech',
        },
        atsVendor: 'greenhouse',
        identifierType: 'board_token',
        identifierValue: `initech-${Math.random().toString(36).slice(2, 8)}`,
      }),
    });

    assert.equal(validCreateResponse.status, 200);
    const validCreateBody = (await validCreateResponse.json()) as {
      atsTarget: {
        targetId: string;
      };
    };

    const emptyUpdateResponse = await fetch(
      `${app.baseUrl}/v1/ats-targets/${validCreateBody.atsTarget.targetId}`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${session.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );

    assert.equal(emptyUpdateResponse.status, 400);
  } finally {
    await app.close();
  }
});