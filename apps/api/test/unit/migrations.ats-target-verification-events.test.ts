import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migrationSql = readFileSync(
  new URL('../../migrations/0013_ats_target_verification_events.sql', import.meta.url),
  'utf8',
);

const compactSql = migrationSql.replace(/\s+/g, ' ').toLowerCase();

test('migration creates append-only verification events table with target foreign key', () => {
  assert.ok(
    compactSql.includes('create table if not exists ats_target_verification_events'),
  );
  assert.ok(
    compactSql.includes(
      'target_id uuid not null references ats_target_registry(target_id) on delete cascade',
    ),
  );
});

test('migration constrains outcome status, http status range, and evidence fields', () => {
  for (const status of ['verified', 'failed', 'pending', 'stale']) {
    assert.ok(compactSql.includes(`'${status}'`));
  }

  assert.ok(
    compactSql.includes('http_status is null or (http_status >= 100 and http_status <= 599)'),
  );
  assert.ok(compactSql.includes('error_code is null or length(trim(error_code)) > 0'));
  assert.ok(compactSql.includes('length(trim(evidence_summary)) > 0'));
});

test('migration adds target and chronology lookup indexes', () => {
  assert.ok(
    compactSql.includes(
      'create index if not exists idx_ats_target_verification_events_target_attempted on ats_target_verification_events (target_id, attempted_at desc);',
    ),
  );
  assert.ok(
    compactSql.includes(
      'create index if not exists idx_ats_target_verification_events_attempted on ats_target_verification_events (attempted_at desc);',
    ),
  );
});