import assert from 'node:assert/strict';
import test from 'node:test';

import { createInMemoryAtsTargetVerificationEventRepository } from '../../src/modules/ats-target-registry/in-memory-repository.js';
import type { AtsTargetVerificationEvent } from '../../src/modules/ats-target-registry/repository.js';

const buildVerificationEvent = (
  overrides: Partial<AtsTargetVerificationEvent>,
): AtsTargetVerificationEvent => ({
  eventId: overrides.eventId ?? '10000000-0000-4000-8000-000000000001',
  targetId: overrides.targetId ?? '20000000-0000-4000-8000-000000000001',
  attemptedAt: overrides.attemptedAt ?? '2026-04-14T16:00:00.000Z',
  outcomeStatus: overrides.outcomeStatus ?? 'verified',
  httpStatus: overrides.httpStatus ?? 200,
  errorCode: overrides.errorCode ?? null,
  evidenceSummary: overrides.evidenceSummary ?? 'deterministic_probe_success',
});

test('createVerificationEvent appends events and lists newest first', async () => {
  const repository = createInMemoryAtsTargetVerificationEventRepository();

  const first = await repository.createVerificationEvent(
    buildVerificationEvent({
      eventId: '10000000-0000-4000-8000-000000000010',
      attemptedAt: '2026-04-14T16:00:00.000Z',
    }),
  );

  const second = await repository.createVerificationEvent(
    buildVerificationEvent({
      eventId: '10000000-0000-4000-8000-000000000011',
      attemptedAt: '2026-04-14T16:01:00.000Z',
      outcomeStatus: 'failed',
      httpStatus: 404,
      errorCode: 'target_not_found',
      evidenceSummary: 'deterministic_probe_missing_target',
    }),
  );

  const listed = await repository.listVerificationEvents({
    limit: 10,
    offset: 0,
  });

  assert.equal(first.outcomeStatus, 'verified');
  assert.equal(second.outcomeStatus, 'failed');
  assert.equal(listed.length, 2);
  assert.equal(listed[0]?.eventId, second.eventId);
  assert.equal(listed[1]?.eventId, first.eventId);
});

test('createVerificationEvent rejects duplicate event ids to keep append-only semantics', async () => {
  const repository = createInMemoryAtsTargetVerificationEventRepository();
  const event = buildVerificationEvent({
    eventId: '10000000-0000-4000-8000-000000000012',
  });

  await repository.createVerificationEvent(event);

  await assert.rejects(
    async () => repository.createVerificationEvent(event),
    (error: unknown) =>
      error instanceof Error &&
      error.message === 'verification_event_insert_failed_duplicate_event_id',
  );
});

test('listVerificationEvents supports target and vendor filtering with pagination', async () => {
  const targetVendor = new Map<string, string>([
    ['20000000-0000-4000-8000-000000000020', 'greenhouse'],
    ['20000000-0000-4000-8000-000000000021', 'lever'],
  ]);

  const repository = createInMemoryAtsTargetVerificationEventRepository({
    resolveVendorByTargetId: (targetId) =>
      (targetVendor.get(targetId) as 'greenhouse' | 'lever' | null) ?? null,
  });

  await repository.createVerificationEvent(
    buildVerificationEvent({
      eventId: '10000000-0000-4000-8000-000000000020',
      targetId: '20000000-0000-4000-8000-000000000020',
      attemptedAt: '2026-04-14T17:00:00.000Z',
    }),
  );
  await repository.createVerificationEvent(
    buildVerificationEvent({
      eventId: '10000000-0000-4000-8000-000000000021',
      targetId: '20000000-0000-4000-8000-000000000021',
      attemptedAt: '2026-04-14T17:01:00.000Z',
    }),
  );
  await repository.createVerificationEvent(
    buildVerificationEvent({
      eventId: '10000000-0000-4000-8000-000000000022',
      targetId: '20000000-0000-4000-8000-000000000020',
      attemptedAt: '2026-04-14T17:02:00.000Z',
      outcomeStatus: 'stale',
      httpStatus: null,
      evidenceSummary: 'scheduled_refresh_window_reached',
    }),
  );

  const greenhouseOnly = await repository.listVerificationEvents({
    atsVendor: 'greenhouse',
    limit: 10,
    offset: 0,
  });
  assert.equal(greenhouseOnly.length, 2);
  assert.ok(greenhouseOnly.every((event) => event.targetId.endsWith('020')));

  const targetFiltered = await repository.listVerificationEvents({
    targetId: '20000000-0000-4000-8000-000000000021',
    limit: 10,
    offset: 0,
  });
  assert.equal(targetFiltered.length, 1);
  assert.equal(targetFiltered[0]?.eventId, '10000000-0000-4000-8000-000000000021');

  const paginated = await repository.listVerificationEvents({
    limit: 1,
    offset: 1,
  });
  assert.equal(paginated.length, 1);
  assert.equal(paginated[0]?.eventId, '10000000-0000-4000-8000-000000000021');
});