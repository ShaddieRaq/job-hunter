import assert from 'node:assert/strict';
import test from 'node:test';

import { createGreenhousePublicBoardConnectors } from '../../src/modules/connectors/greenhouse-board-connectors.js';

test('greenhouse board config defaults to single connector when board list env is unset', () => {
  const connectors = createGreenhousePublicBoardConnectors({
    boardTokenEnv: undefined,
    boardTokensEnv: undefined,
  });

  assert.equal(connectors.length, 1);
  assert.equal(connectors[0]?.sourceName, 'greenhouse_public_board');
  assert.equal(connectors[0]?.displayName, 'Greenhouse Public Board');
});

test('greenhouse board config expands to multiple connectors when board list env is set', () => {
  const connectors = createGreenhousePublicBoardConnectors({
    boardTokensEnv: 'stripe,vercel,shopify',
  });

  assert.equal(connectors.length, 3);

  const sourceNames = connectors.map((connector) => connector.sourceName);
  assert.deepEqual(sourceNames, [
    'greenhouse_public_board_stripe',
    'greenhouse_public_board_vercel',
    'greenhouse_public_board_shopify',
  ]);

  assert.equal(connectors[0]?.displayName, 'Greenhouse Public Board (stripe)');
  assert.equal(connectors[1]?.displayName, 'Greenhouse Public Board (vercel)');
});

test('greenhouse board config dedupes tokens and keeps generated source names unique', () => {
  const connectors = createGreenhousePublicBoardConnectors({
    boardTokensEnv: 'stripe,STRIPE,acme-inc,acme_inc,acme inc',
  });

  assert.equal(connectors.length, 4);

  const sourceNames = connectors.map((connector) => connector.sourceName);
  assert.equal(new Set(sourceNames).size, sourceNames.length);
  assert.ok(sourceNames.every((sourceName) => sourceName.startsWith('greenhouse_public_board_')));
});
