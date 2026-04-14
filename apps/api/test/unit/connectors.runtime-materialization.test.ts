import assert from 'node:assert/strict';
import test from 'node:test';

import type { AtsTargetRecord } from '@job-hunter/shared';

import { createInMemoryAtsTargetRegistryRepository } from '../../src/modules/ats-target-registry/in-memory-repository.js';
import { createAtsTargetRegistryService } from '../../src/modules/ats-target-registry/service.js';
import { createInMemoryConnectorRepository } from '../../src/modules/connectors/in-memory-repository.js';
import {
  createRuntimeAwareConnectorService,
  resolveRuntimeConnectorDefinitions,
} from '../../src/modules/connectors/runtime-materialization.js';

const buildTarget = (
  overrides: Partial<Omit<AtsTargetRecord, 'company'>> & {
    company?: Partial<AtsTargetRecord['company']>;
  },
): AtsTargetRecord => ({
  targetId: overrides.targetId ?? '65f56058-54d8-46fc-82f5-5eb4c3264f32',
  companyId: overrides.companyId ?? '4f73131a-1ee1-4e1b-a695-643fd42fd91a',
  atsVendor: overrides.atsVendor ?? 'greenhouse',
  identifierType: overrides.identifierType ?? 'board_token',
  identifierValue: overrides.identifierValue ?? 'acme-board',
  verificationStatus: overrides.verificationStatus ?? 'verified',
  verificationConfidence: overrides.verificationConfidence ?? 0.9,
  verificationReason: overrides.verificationReason ?? 'verified',
  lastVerifiedAt: overrides.lastVerifiedAt ?? '2026-04-14T20:00:00.000Z',
  nextVerificationAt: overrides.nextVerificationAt ?? '2026-04-21T20:00:00.000Z',
  sourceProvenance: overrides.sourceProvenance ?? 'seed',
  createdAt: overrides.createdAt ?? '2026-04-14T19:00:00.000Z',
  updatedAt: overrides.updatedAt ?? '2026-04-14T19:00:00.000Z',
  company: {
    companyId: overrides.company?.companyId ?? '4f73131a-1ee1-4e1b-a695-643fd42fd91a',
    canonicalName: overrides.company?.canonicalName ?? 'Acme Labs',
    normalizedName: overrides.company?.normalizedName ?? 'acme labs',
    websiteDomain: overrides.company?.websiteDomain ?? 'acme.example',
    sourceProvenance: overrides.company?.sourceProvenance ?? 'seed',
    createdAt: overrides.company?.createdAt ?? '2026-04-14T19:00:00.000Z',
    updatedAt: overrides.company?.updatedAt ?? '2026-04-14T19:00:00.000Z',
  },
});

test('resolveRuntimeConnectorDefinitions keeps legacy env connectors when mode is legacy', async () => {
  let listCalls = 0;
  const connectors = await resolveRuntimeConnectorDefinitions({
    runtimeModeEnv: 'legacy',
    atsTargetRegistryService: {
      async createAtsTarget() {
        throw new Error('not_implemented');
      },
      async listAtsTargets() {
        listCalls += 1;
        return [];
      },
      async updateAtsTarget() {
        throw new Error('not_implemented');
      },
    },
    greenhouseBoardTokensEnv: 'stripe,vercel',
    leverCompanyHandlesEnv: 'openai,figma',
  });

  const sourceNames = connectors.map((connector) => connector.sourceName).sort();
  assert.deepEqual(sourceNames, [
    'arbeitnow_job_board',
    'greenhouse_public_board_stripe',
    'greenhouse_public_board_vercel',
    'lever_public_board_figma',
    'lever_public_board_openai',
  ]);
  assert.equal(listCalls, 0);
});

test('resolveRuntimeConnectorDefinitions uses verified registry targets only in verified_registry mode', async () => {
  const targets = [
    buildTarget({
      targetId: '495f11cc-7fdf-43f2-aa43-41fdfee20f13',
      atsVendor: 'greenhouse',
      identifierType: 'board_token',
      identifierValue: 'acme-gh',
      verificationStatus: 'verified',
      company: {
        canonicalName: 'Acme Labs',
      },
    }),
    buildTarget({
      targetId: '00579a7e-958e-4792-84ec-8b326d3ff9a9',
      atsVendor: 'greenhouse',
      identifierType: 'board_token',
      identifierValue: 'pending-gh',
      verificationStatus: 'pending',
    }),
    buildTarget({
      targetId: 'e2478df8-1ddb-4c6f-95aa-8b5e9fcb34b4',
      atsVendor: 'lever',
      identifierType: 'handle',
      identifierValue: 'acme-lever',
      verificationStatus: 'verified',
      company: {
        canonicalName: 'Acme Labs',
      },
    }),
    buildTarget({
      targetId: 'a38f81a4-df92-4f45-8d95-ca54c45ce3bd',
      atsVendor: 'lever',
      identifierType: 'slug',
      identifierValue: 'unsupported-lever-slug',
      verificationStatus: 'verified',
    }),
  ];

  const connectors = await resolveRuntimeConnectorDefinitions({
    runtimeModeEnv: 'verified_registry',
    atsTargetRegistryService: {
      async createAtsTarget() {
        throw new Error('not_implemented');
      },
      async listAtsTargets({ verificationStatus }) {
        return targets.filter((target) =>
          verificationStatus ? target.verificationStatus === verificationStatus : true,
        );
      },
      async updateAtsTarget() {
        throw new Error('not_implemented');
      },
    },
    greenhouseBoardTokensEnv: 'legacy-should-not-appear',
    leverCompanyHandlesEnv: 'legacy-should-not-appear',
  });

  const sourceNames = connectors.map((connector) => connector.sourceName);
  assert.ok(sourceNames.includes('arbeitnow_job_board'));
  assert.ok(sourceNames.some((name) => name.startsWith('greenhouse_public_board_verified_')));
  assert.ok(sourceNames.some((name) => name.startsWith('lever_public_board_verified_')));
  assert.equal(sourceNames.some((name) => name.includes('legacy_should_not_appear')), false);
  assert.equal(
    sourceNames.some((name) => name.includes('pending_gh') || name.includes('unsupported')),
    false,
  );
});

test('createRuntimeAwareConnectorService reflects verified-status transitions without restart', async () => {
  const targetRepository = createInMemoryAtsTargetRegistryRepository();
  const registryService = createAtsTargetRegistryService({
    repository: targetRepository,
    now: () => new Date('2026-04-14T21:00:00.000Z'),
  });

  const connectorService = createRuntimeAwareConnectorService({
    repository: createInMemoryConnectorRepository(),
    atsTargetRegistryService: registryService,
    runtimeModeEnv: 'verified_registry',
    now: () => new Date('2026-04-14T21:00:00.000Z'),
  });

  const before = await connectorService.listConnectors();
  assert.deepEqual(
    before.map((connector) => connector.sourceName),
    ['arbeitnow_job_board'],
  );

  const created = await registryService.createAtsTarget(
    '24b6321c-5f6b-4bc9-bf1d-f9a2b1f2ba2b',
    {
      company: {
        canonicalName: 'Initech',
      },
      atsVendor: 'greenhouse',
      identifierType: 'board_token',
      identifierValue: 'initech-board',
      verificationStatus: 'pending',
    },
  );

  const pending = await connectorService.listConnectors();
  assert.deepEqual(
    pending.map((connector) => connector.sourceName),
    ['arbeitnow_job_board'],
  );

  await registryService.updateAtsTarget('24b6321c-5f6b-4bc9-bf1d-f9a2b1f2ba2b', created.targetId, {
    verificationStatus: 'verified',
    verificationReason: 'greenhouse_public_board_verified',
    verificationConfidence: 0.99,
    lastVerifiedAt: '2026-04-14T21:10:00.000Z',
  });

  const after = await connectorService.listConnectors();
  assert.equal(after.some((connector) => connector.sourceName === 'arbeitnow_job_board'), true);
  assert.equal(
    after.some((connector) => connector.sourceName.startsWith('greenhouse_public_board_verified_')),
    true,
  );
  assert.equal(
    after.some((connector) => connector.sourceName === 'greenhouse_public_board'),
    false,
  );
});