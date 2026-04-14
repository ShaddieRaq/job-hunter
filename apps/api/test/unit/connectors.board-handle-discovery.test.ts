import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveBoardHandleCandidatesFromCompanyName,
  extractCompanyNamesFromArbeitnowPayload,
} from '../../src/modules/connectors/board-handle-discovery.js';

test('deriveBoardHandleCandidatesFromCompanyName creates multiple normalized slug variants', () => {
  const candidates = deriveBoardHandleCandidatesFromCompanyName('Acme Labs GmbH');

  assert.ok(candidates.includes('acmelabs'));
  assert.ok(candidates.includes('acme-labs'));
  assert.ok(candidates.includes('acme_labs'));
  assert.equal(new Set(candidates).size, candidates.length);
});

test('deriveBoardHandleCandidatesFromCompanyName keeps uniqueness and strips punctuation', () => {
  const candidates = deriveBoardHandleCandidatesFromCompanyName('OpenAI, Inc.');

  assert.ok(candidates.includes('openai'));
  assert.ok(candidates.includes('openai-inc'));
  assert.equal(new Set(candidates).size, candidates.length);
});

test('extractCompanyNamesFromArbeitnowPayload returns unique non-empty names', () => {
  const names = extractCompanyNamesFromArbeitnowPayload({
    data: [
      { company_name: 'Acme Labs' },
      { company_name: '  Acme Labs  ' },
      { company_name: 'Example Corp' },
      { company_name: '' },
      {},
    ],
  });

  assert.deepEqual(names, ['Acme Labs', 'Example Corp']);
});
