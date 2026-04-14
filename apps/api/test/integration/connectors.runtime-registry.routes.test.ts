import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import { createInMemoryAtsTargetRegistryRepository } from '../../src/modules/ats-target-registry/in-memory-repository.js';
import { createAtsTargetRegistryService } from '../../src/modules/ats-target-registry/service.js';
import { createInMemoryConnectorRepository } from '../../src/modules/connectors/in-memory-repository.js';
import { createRuntimeAwareConnectorService } from '../../src/modules/connectors/runtime-materialization.js';
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

const registerAndGetAccessToken = async (baseUrl: string): Promise<string> => {
  const uniqueId = Math.random().toString(36).slice(2, 10);

  const response = await fetch(`${baseUrl}/v1/auth/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: `connectors.registry.runtime.${uniqueId}@test.dev`,
    }),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as { session: { accessToken: string } };
  return body.session.accessToken;
};

test('connector list materializes only verified ATS targets in registry runtime mode', async () => {
  const atsTargetRepository = createInMemoryAtsTargetRegistryRepository();
  const atsTargetRegistryService = createAtsTargetRegistryService({
    repository: atsTargetRepository,
    now: () => new Date('2026-04-14T22:00:00.000Z'),
  });

  const connectorService = createRuntimeAwareConnectorService({
    repository: createInMemoryConnectorRepository(),
    atsTargetRegistryService,
    runtimeModeEnv: 'verified_registry',
    now: () => new Date('2026-04-14T22:00:00.000Z'),
  });

  const app = await startServer({
    atsTargetRegistryService,
    connectorService,
  });

  try {
    const accessToken = await registerAndGetAccessToken(app.baseUrl);
    const uniqueSlug = Math.random().toString(36).slice(2, 8);

    const pendingGreenhouseResponse = await fetch(`${app.baseUrl}/v1/ats-targets`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        company: {
          canonicalName: 'Acme Labs',
        },
        atsVendor: 'greenhouse',
        identifierType: 'board_token',
        identifierValue: `acme-${uniqueSlug}`,
        verificationStatus: 'pending',
      }),
    });
    assert.equal(pendingGreenhouseResponse.status, 200);
    const pendingGreenhouseBody = (await pendingGreenhouseResponse.json()) as {
      atsTarget: {
        targetId: string;
      };
    };

    const verifiedLeverResponse = await fetch(`${app.baseUrl}/v1/ats-targets`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        company: {
          canonicalName: 'Globex',
        },
        atsVendor: 'lever',
        identifierType: 'handle',
        identifierValue: `globex-${uniqueSlug}`,
        verificationStatus: 'verified',
      }),
    });
    assert.equal(verifiedLeverResponse.status, 200);
    const verifiedLeverBody = (await verifiedLeverResponse.json()) as {
      atsTarget: {
        targetId: string;
      };
    };

    const initialConnectorsResponse = await fetch(`${app.baseUrl}/v1/connectors`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(initialConnectorsResponse.status, 200);
    const initialConnectorsBody = (await initialConnectorsResponse.json()) as {
      connectors: Array<{ sourceName: string }>;
    };

    const initialSourceNames = initialConnectorsBody.connectors.map(
      (connector) => connector.sourceName,
    );
    assert.ok(initialSourceNames.includes('arbeitnow_job_board'));
    assert.ok(initialSourceNames.some((name) => name.startsWith('lever_public_board_verified_')));
    assert.equal(
      initialSourceNames.some((name) => name.startsWith('greenhouse_public_board_verified_')),
      false,
    );

    const verifyGreenhouseResponse = await fetch(
      `${app.baseUrl}/v1/ats-targets/${pendingGreenhouseBody.atsTarget.targetId}`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          verificationStatus: 'verified',
          verificationConfidence: 0.98,
          verificationReason: 'greenhouse_public_board_verified',
          lastVerifiedAt: '2026-04-14T22:10:00.000Z',
        }),
      },
    );

    assert.equal(verifyGreenhouseResponse.status, 200);

    const staleLeverResponse = await fetch(
      `${app.baseUrl}/v1/ats-targets/${verifiedLeverBody.atsTarget.targetId}`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          verificationStatus: 'stale',
          verificationReason: 'scheduled_refresh_window_reached',
        }),
      },
    );

    assert.equal(staleLeverResponse.status, 200);

    const afterUpdateConnectorsResponse = await fetch(`${app.baseUrl}/v1/connectors`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(afterUpdateConnectorsResponse.status, 200);
    const afterUpdateConnectorsBody = (await afterUpdateConnectorsResponse.json()) as {
      connectors: Array<{ sourceName: string }>;
    };

    const afterUpdateSourceNames = afterUpdateConnectorsBody.connectors.map(
      (connector) => connector.sourceName,
    );
    assert.ok(afterUpdateSourceNames.includes('arbeitnow_job_board'));
    assert.ok(
      afterUpdateSourceNames.some((name) =>
        name.startsWith('greenhouse_public_board_verified_'),
      ),
    );
    assert.equal(
      afterUpdateSourceNames.some((name) => name.startsWith('lever_public_board_verified_')),
      false,
    );
  } finally {
    await app.close();
  }
});