import assert from 'node:assert/strict';
import test from 'node:test';

import { createLeverPublicBoardConnectors } from '../../src/modules/connectors/lever-board-connectors.js';

test('lever board config defaults to single connector when handle list env is unset', () => {
  const connectors = createLeverPublicBoardConnectors({
    companyHandleEnv: undefined,
    companyHandlesEnv: undefined,
  });

  assert.equal(connectors.length, 1);
  assert.equal(connectors[0]?.sourceName, 'lever_public_board');
  assert.equal(connectors[0]?.displayName, 'Lever Public Board');
});

test('lever board config expands to multiple connectors when handle list env is set', () => {
  const connectors = createLeverPublicBoardConnectors({
    companyHandlesEnv: 'netflix,openai,figma',
  });

  assert.equal(connectors.length, 3);
  assert.deepEqual(
    connectors.map((connector) => connector.sourceName),
    ['lever_public_board_netflix', 'lever_public_board_openai', 'lever_public_board_figma'],
  );

  assert.equal(connectors[0]?.displayName, 'Lever Public Board (netflix)');
});

test('lever board config dedupes handles and keeps generated source names unique', () => {
  const connectors = createLeverPublicBoardConnectors({
    companyHandlesEnv: 'openai,OPENAI,acme-inc,acme_inc,acme inc',
  });

  assert.equal(connectors.length, 4);

  const sourceNames = connectors.map((connector) => connector.sourceName);
  assert.equal(new Set(sourceNames).size, sourceNames.length);
  assert.ok(sourceNames.every((sourceName) => sourceName.startsWith('lever_public_board_')));
});
