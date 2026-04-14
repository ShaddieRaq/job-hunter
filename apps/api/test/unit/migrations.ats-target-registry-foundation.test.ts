import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migrationSql = readFileSync(
  new URL('../../migrations/0012_ats_target_registry_foundation.sql', import.meta.url),
  'utf8',
);

const compactSql = migrationSql.replace(/\s+/g, ' ').toLowerCase();

test('migration creates company registry table and uniqueness indexes', () => {
  assert.ok(compactSql.includes('create table if not exists company_registry'));
  assert.ok(
    compactSql.includes(
      'create unique index if not exists idx_company_registry_normalized_name on company_registry (lower(normalized_name));',
    ),
  );
  assert.ok(
    compactSql.includes(
      'create unique index if not exists idx_company_registry_website_domain on company_registry (lower(website_domain)) where website_domain is not null;',
    ),
  );
});

test('migration creates ats target registry with expected foreign key and lookup indexes', () => {
  assert.ok(compactSql.includes('create table if not exists ats_target_registry'));
  assert.ok(
    compactSql.includes(
      'company_id uuid not null references company_registry(company_id) on delete cascade',
    ),
  );
  assert.ok(
    compactSql.includes(
      'create unique index if not exists idx_ats_target_registry_vendor_identifier on ats_target_registry (ats_vendor, identifier_type, lower(identifier_value));',
    ),
  );
  assert.ok(
    compactSql.includes(
      'create index if not exists idx_ats_target_registry_status_next_verification on ats_target_registry (verification_status, next_verification_at);',
    ),
  );
});

test('migration constrains vendor, identifier type, status, and confidence range', () => {
  for (const vendor of [
    'greenhouse',
    'lever',
    'workable',
    'ashby',
    'smartrecruiters',
    'recruitee',
  ]) {
    assert.ok(compactSql.includes(`'${vendor}'`));
  }

  for (const identifierType of ['board_token', 'handle', 'subdomain', 'slug']) {
    assert.ok(compactSql.includes(`'${identifierType}'`));
  }

  for (const status of ['verified', 'failed', 'pending', 'stale']) {
    assert.ok(compactSql.includes(`'${status}'`));
  }

  assert.ok(
    compactSql.includes(
      'verification_confidence is null or (verification_confidence >= 0 and verification_confidence <= 1)',
    ),
  );
});
