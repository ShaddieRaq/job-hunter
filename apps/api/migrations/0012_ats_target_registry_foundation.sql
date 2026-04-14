-- ATS target expansion PR1: company + target registry foundation

create table if not exists company_registry (
  company_id uuid primary key,
  canonical_name text not null,
  normalized_name text not null,
  website_domain text null,
  source_provenance text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (length(trim(canonical_name)) > 0),
  check (length(trim(normalized_name)) > 0),
  check (website_domain is null or length(trim(website_domain)) > 0),
  check (length(trim(source_provenance)) > 0)
);

create unique index if not exists idx_company_registry_normalized_name
  on company_registry (lower(normalized_name));

create unique index if not exists idx_company_registry_website_domain
  on company_registry (lower(website_domain))
  where website_domain is not null;

create index if not exists idx_company_registry_updated_at
  on company_registry (updated_at desc);

create table if not exists ats_target_registry (
  target_id uuid primary key,
  company_id uuid not null references company_registry(company_id) on delete cascade,
  ats_vendor text not null,
  identifier_type text not null,
  identifier_value text not null,
  verification_status text not null,
  verification_confidence double precision null,
  verification_reason text null,
  last_verified_at timestamptz null,
  next_verification_at timestamptz null,
  source_provenance text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (
    ats_vendor in (
      'greenhouse',
      'lever',
      'workable',
      'ashby',
      'smartrecruiters',
      'recruitee'
    )
  ),
  check (
    identifier_type in (
      'board_token',
      'handle',
      'subdomain',
      'slug'
    )
  ),
  check (
    verification_status in (
      'verified',
      'failed',
      'pending',
      'stale'
    )
  ),
  check (
    verification_confidence is null or
    (verification_confidence >= 0 and verification_confidence <= 1)
  ),
  check (length(trim(identifier_value)) > 0),
  check (
    verification_reason is null or
    length(trim(verification_reason)) > 0
  ),
  check (length(trim(source_provenance)) > 0)
);

create unique index if not exists idx_ats_target_registry_vendor_identifier
  on ats_target_registry (ats_vendor, identifier_type, lower(identifier_value));

create index if not exists idx_ats_target_registry_company_vendor
  on ats_target_registry (company_id, ats_vendor);

create index if not exists idx_ats_target_registry_status_next_verification
  on ats_target_registry (verification_status, next_verification_at);

create index if not exists idx_ats_target_registry_updated_at
  on ats_target_registry (updated_at desc);
