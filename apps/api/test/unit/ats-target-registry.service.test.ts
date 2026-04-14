import assert from 'node:assert/strict';
import test from 'node:test';

import { HttpError } from '../../src/http/http-errors.js';
import { createAtsTargetRegistryService } from '../../src/modules/ats-target-registry/service.js';

test('createAtsTarget persists audit metadata in source provenance and normalizes identifiers', async () => {
  let nowCursor = Date.parse('2026-04-14T19:00:00.000Z');

  const service = createAtsTargetRegistryService({
    now: () => {
      nowCursor += 1_000;
      return new Date(nowCursor);
    },
  });

  const userId = '7f30e28f-c19a-4ddf-89b2-5eb9f50eccab';
  const created = await service.createAtsTarget(userId, {
    company: {
      canonicalName: 'Acme Labs',
      websiteDomain: 'https://www.acme.example/careers',
      sourceProvenance: 'manual entry',
    },
    atsVendor: 'greenhouse',
    identifierType: 'board_token',
    identifierValue: ' Acme-Labs ',
    verificationStatus: 'pending',
  });

  assert.equal(created.identifierValue, 'acme-labs');
  assert.equal(created.company.websiteDomain, 'acme.example');

  const targetProvenance = JSON.parse(created.sourceProvenance) as {
    origin: string;
    audit: {
      actorUserId: string;
      writeAction: string;
    };
  };

  assert.equal(targetProvenance.origin, 'manual_entry');
  assert.equal(targetProvenance.audit.actorUserId, userId);
  assert.equal(targetProvenance.audit.writeAction, 'create_target');
});

test('createAtsTarget rejects duplicate vendor/identifier pairs', async () => {
  const service = createAtsTargetRegistryService();
  const userId = 'f22f63c8-5ed0-4a0d-ad38-b4f83cef5d89';

  await service.createAtsTarget(userId, {
    company: {
      canonicalName: 'Acme Labs',
    },
    atsVendor: 'lever',
    identifierType: 'handle',
    identifierValue: 'acme',
  });

  await assert.rejects(
    async () =>
      service.createAtsTarget(userId, {
        company: {
          canonicalName: 'Acme Labs',
        },
        atsVendor: 'lever',
        identifierType: 'handle',
        identifierValue: ' ACME ',
      }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 409 &&
      error.code === 'ats_target_identifier_exists',
  );
});

test('updateAtsTarget persists update audit metadata and updates verification fields', async () => {
  let nowCursor = Date.parse('2026-04-14T19:30:00.000Z');

  const service = createAtsTargetRegistryService({
    now: () => {
      nowCursor += 1_000;
      return new Date(nowCursor);
    },
  });

  const userId = 'dd66b152-f4b7-4f22-af23-5b6f6188f1ea';

  const created = await service.createAtsTarget(userId, {
    company: {
      canonicalName: 'Globex Corporation',
    },
    atsVendor: 'greenhouse',
    identifierType: 'board_token',
    identifierValue: 'globex',
    verificationStatus: 'pending',
  });

  const updated = await service.updateAtsTarget(userId, created.targetId, {
    verificationStatus: 'verified',
    verificationConfidence: 0.97,
    verificationReason: 'greenhouse_public_board_verified',
    lastVerifiedAt: '2026-04-14T20:00:00.000Z',
  });

  assert.equal(updated.verificationStatus, 'verified');
  assert.equal(updated.verificationConfidence, 0.97);
  assert.equal(updated.verificationReason, 'greenhouse_public_board_verified');
  assert.equal(updated.lastVerifiedAt, '2026-04-14T20:00:00.000Z');

  const provenance = JSON.parse(updated.sourceProvenance) as {
    audit: {
      actorUserId: string;
      writeAction: string;
    };
  };

  assert.equal(provenance.audit.actorUserId, userId);
  assert.equal(provenance.audit.writeAction, 'update_target');
});

test('updateAtsTarget rejects empty update payload', async () => {
  const service = createAtsTargetRegistryService();
  const userId = '284aebf6-f43f-4af2-a736-66595ebac161';

  const created = await service.createAtsTarget(userId, {
    company: {
      canonicalName: 'Initech',
    },
    atsVendor: 'lever',
    identifierType: 'handle',
    identifierValue: 'initech',
  });

  await assert.rejects(
    async () => service.updateAtsTarget(userId, created.targetId, {}),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 400 &&
      error.code === 'invalid_ats_target_update_payload',
  );
});