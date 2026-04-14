import assert from 'node:assert/strict';
import test from 'node:test';

import type { AtsTargetVerificationEventRepository } from '../../src/modules/ats-target-registry/repository.js';
import { createAtsTargetVerificationEventService } from '../../src/modules/ats-target-registry/verification-events-service.js';

test('listVerificationEvents applies default and bounded pagination values', async () => {
  const calls: Array<{
    targetId?: string;
    atsVendor?: string;
    limit: number;
    offset: number;
  }> = [];

  const repository: AtsTargetVerificationEventRepository = {
    async createVerificationEvent(event) {
      return event;
    },
    async listVerificationEvents(options) {
      calls.push({
        targetId: options.targetId,
        atsVendor: options.atsVendor,
        limit: options.limit,
        offset: options.offset,
      });

      return [];
    },
  };

  const service = createAtsTargetVerificationEventService({ repository });

  await service.listVerificationEvents({
    limit: 0,
    offset: -10,
  });

  await service.listVerificationEvents({
    limit: 9999,
    offset: 2,
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.limit, 1);
  assert.equal(calls[0]?.offset, 0);
  assert.equal(calls[1]?.limit, 500);
  assert.equal(calls[1]?.offset, 2);
});

test('listVerificationEvents passes target and vendor filters through to repository', async () => {
  let observedTargetId: string | undefined;
  let observedVendor: string | undefined;

  const repository: AtsTargetVerificationEventRepository = {
    async createVerificationEvent(event) {
      return event;
    },
    async listVerificationEvents(options) {
      observedTargetId = options.targetId;
      observedVendor = options.atsVendor;

      return [];
    },
  };

  const service = createAtsTargetVerificationEventService({ repository });

  await service.listVerificationEvents({
    targetId: '4334d4a8-3575-479d-b639-2b6012fdd126',
    atsVendor: 'greenhouse',
    limit: 25,
    offset: 5,
  });

  assert.equal(observedTargetId, '4334d4a8-3575-479d-b639-2b6012fdd126');
  assert.equal(observedVendor, 'greenhouse');
});