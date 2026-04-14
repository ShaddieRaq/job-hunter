import assert from 'node:assert/strict';
import test from 'node:test';

import { generateAtsTargetCandidatesFromCompanySeeds } from '../../src/modules/ats-target-registry/candidate-generation.js';

test('candidate generation is deterministic for the same seed set regardless of input order', () => {
  const seeds = [
    {
      companyName: 'OpenAI, Inc.',
      websiteDomain: 'openai.com',
      sourceProvenance: 'seed_batch_a',
    },
    {
      companyName: 'Acme Labs GmbH',
      websiteDomain: 'acme-labs.io',
      sourceProvenance: 'seed_batch_a',
    },
  ];

  const forward = generateAtsTargetCandidatesFromCompanySeeds({
    companySeeds: seeds,
  });

  const reversed = generateAtsTargetCandidatesFromCompanySeeds({
    companySeeds: [...seeds].reverse(),
  });

  assert.ok(forward.length > 0);
  assert.deepEqual(forward, reversed);
});

test('candidate generation normalizes edge-case names and website domains', () => {
  const candidates = generateAtsTargetCandidatesFromCompanySeeds({
    companySeeds: [
      {
        companyName: 'München & Söhne GmbH',
        websiteDomain: 'https://careers.muenchen-soehne.de',
      },
      {
        companyName: 'N26 Bank AG',
        websiteDomain: 'n26.com',
      },
    ],
  });

  const greenhouseValues = candidates
    .filter((candidate) => candidate.atsVendor === 'greenhouse')
    .map((candidate) => candidate.identifierValue);

  const leverValues = candidates
    .filter((candidate) => candidate.atsVendor === 'lever')
    .map((candidate) => candidate.identifierValue);

  assert.ok(greenhouseValues.includes('munchenandsohne'));
  assert.ok(greenhouseValues.includes('munchen-and-sohne'));
  assert.ok(greenhouseValues.includes('n26'));

  assert.ok(leverValues.includes('munchenandsohne'));
  assert.ok(leverValues.includes('n26'));
});

test('candidate generation supports vendor filter and per-vendor limit', () => {
  const candidates = generateAtsTargetCandidatesFromCompanySeeds({
    companySeeds: [
      {
        companyName: 'Acme Labs GmbH',
        websiteDomain: 'acme-labs.io',
      },
    ],
    includeVendors: ['greenhouse'],
    maxCandidatesPerVendor: 2,
  });

  assert.equal(candidates.length, 2);
  assert.ok(candidates.every((candidate) => candidate.atsVendor === 'greenhouse'));
  assert.ok(
    candidates.every((candidate) => candidate.identifierType === 'board_token'),
  );
});
