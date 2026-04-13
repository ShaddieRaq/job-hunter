import assert from 'node:assert/strict';
import test from 'node:test';

import type { SourceJobSummary, SourceName } from '@job-hunter/shared';

import { createCanonicalJobsService } from '../../src/modules/canonical-jobs/service.js';

const baseIso = '2026-04-12T00:00:00.000Z';

const createSourceJob = (
  sourceName: SourceName,
  sourceJobId: string,
  overrides?: Partial<SourceJobSummary>,
): SourceJobSummary => ({
  sourceName,
  sourceJobId,
  sourceCompanyId: sourceName,
  sourceStatus: 'open',
  title: 'Senior Backend Engineer',
  companyName: 'Acme Labs',
  fetchUrl: `https://example.test/jobs/${sourceJobId}`,
  applicationUrl: `https://example.test/jobs/${sourceJobId}/apply`,
  locationText: 'Remote - United States',
  remoteType: 'remote',
  employmentType: 'full_time',
  postedAt: baseIso,
  firstSeenAt: baseIso,
  lastSeenAt: baseIso,
  fetchedAt: baseIso,
  checksumSha256: 'a'.repeat(64),
  normalizedSkills: ['TypeScript', 'Node.js'],
  requiredSkills: ['TypeScript'],
  preferredSkills: ['Node.js'],
  salaryMin: 170000,
  salaryMax: 210000,
  salaryCurrency: 'USD',
  salaryPeriod: 'year',
  ...overrides,
});

test('rebuildCatalog dedupes strict same-company title overlap and preserves source mappings', async () => {
  const sourceJobs: SourceJobSummary[] = [
    createSourceJob('greenhouse_public_board', '1001'),
    createSourceJob('greenhouse_public_board', '1002', {
      title: 'Sr Backend Engineer',
      locationText: 'United States (Remote)',
      checksumSha256: 'b'.repeat(64),
    }),
    createSourceJob('greenhouse_public_board', '1003', {
      companyName: 'Other Labs',
      checksumSha256: 'c'.repeat(64),
    }),
  ];

  const service = createCanonicalJobsService({
    sourceJobReader: {
      async listSourceJobs() {
        return sourceJobs;
      },
    },
    now: () => new Date('2026-04-12T10:00:00.000Z'),
  });

  const rebuild = await service.rebuildCatalog({
    maxSourceJobs: 500,
  });

  assert.equal(rebuild.sourceJobsScanned, 3);
  assert.equal(rebuild.canonicalJobsCreated, 2);
  assert.equal(rebuild.canonicalJobsUpdated, 0);
  assert.equal(rebuild.dedupedSourceJobs, 1);

  const jobs = await service.listCanonicalJobs(20);
  assert.equal(jobs.length, 2);

  const merged = jobs.find((job) => job.sourceCount === 2);
  assert.ok(merged);

  const detail = await service.getCanonicalJob(merged!.canonicalJobId);
  assert.ok(detail);
  assert.equal(detail?.sourceMappings.length, 2);
  assert.ok(detail?.sourceMappings.some((mapping) => mapping.isPrimary));
  assert.ok(
    detail?.sourceMappings.some((mapping) =>
      mapping.mappingReasonCodes.includes('strong_title_overlap'),
    ) ||
      detail?.sourceMappings.some((mapping) =>
        mapping.mappingReasonCodes.includes('exact_company_title'),
      ),
  );

  const dedupeEvents = await service.listDedupeTraceEvents(
    merged!.canonicalJobId,
    20,
  );
  assert.equal(dedupeEvents.length, 2);
  assert.ok(
    dedupeEvents.every((event) => event.eventType === 'linked_to_canonical'),
  );
  assert.ok(dedupeEvents.every((event) => event.reversible === true));
});

test('rebuildCatalog is idempotent for unchanged source jobs', async () => {
  const sourceJobs: SourceJobSummary[] = [
    createSourceJob('greenhouse_public_board', '2001', {
      checksumSha256: 'd'.repeat(64),
    }),
    createSourceJob('greenhouse_public_board', '2002', {
      title: 'Senior Backend Engineer',
      checksumSha256: 'e'.repeat(64),
    }),
  ];

  const service = createCanonicalJobsService({
    sourceJobReader: {
      async listSourceJobs() {
        return sourceJobs;
      },
    },
    now: () => new Date('2026-04-12T11:00:00.000Z'),
  });

  const first = await service.rebuildCatalog({});
  assert.equal(first.canonicalJobsCreated, 1);
  assert.equal(first.canonicalJobsUpdated, 0);

  const initialJob = (await service.listCanonicalJobs(10))[0];
  assert.ok(initialJob);

  const eventsAfterFirst = await service.listDedupeTraceEvents(
    initialJob!.canonicalJobId,
    20,
  );
  assert.equal(eventsAfterFirst.length, 2);

  const second = await service.rebuildCatalog({});
  assert.equal(second.canonicalJobsCreated, 0);
  assert.equal(second.canonicalJobsUpdated, 0);

  const eventsAfterSecond = await service.listDedupeTraceEvents(
    initialJob!.canonicalJobId,
    20,
  );
  assert.equal(eventsAfterSecond.length, 2);
});

test('rebuildCatalog marks canonical jobs as updated when source aggregate changes', async () => {
  let salaryMax = 180000;

  const service = createCanonicalJobsService({
    sourceJobReader: {
      async listSourceJobs() {
        return [
          createSourceJob('greenhouse_public_board', '3001', {
            salaryMax,
            checksumSha256: salaryMax === 180000 ? 'f'.repeat(64) : '1'.repeat(64),
          }),
        ];
      },
    },
    now: () => new Date('2026-04-12T12:00:00.000Z'),
  });

  const first = await service.rebuildCatalog({});
  assert.equal(first.canonicalJobsCreated, 1);
  assert.equal(first.canonicalJobsUpdated, 0);

  salaryMax = 220000;

  const second = await service.rebuildCatalog({});
  assert.equal(second.canonicalJobsCreated, 0);
  assert.equal(second.canonicalJobsUpdated, 1);
});

test('rebuildCatalog records unlinked events when mappings are removed', async () => {
  let activeJobs: SourceJobSummary[] = [
    createSourceJob('greenhouse_public_board', '4001', {
      checksumSha256: '2'.repeat(64),
    }),
    createSourceJob('greenhouse_public_board', '4002', {
      title: 'Sr Backend Engineer',
      checksumSha256: '3'.repeat(64),
    }),
  ];

  const service = createCanonicalJobsService({
    sourceJobReader: {
      async listSourceJobs() {
        return activeJobs;
      },
    },
    now: () => new Date('2026-04-12T13:00:00.000Z'),
  });

  const first = await service.rebuildCatalog({});
  assert.equal(first.canonicalJobsCreated, 1);

  const job = (await service.listCanonicalJobs(10))[0];
  assert.ok(job);

  activeJobs = [
    createSourceJob('greenhouse_public_board', '4001', {
      checksumSha256: '2'.repeat(64),
    }),
  ];

  const second = await service.rebuildCatalog({});
  assert.equal(second.canonicalJobsUpdated, 1);

  const events = await service.listDedupeTraceEvents(job!.canonicalJobId, 20);
  assert.ok(events.some((event) => event.eventType === 'unlinked_from_canonical'));
});
