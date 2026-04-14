-- ATS target expansion PR2: append-only verification event log

create table if not exists ats_target_verification_events (
  event_id uuid primary key,
  target_id uuid not null references ats_target_registry(target_id) on delete cascade,
  attempted_at timestamptz not null,
  outcome_status text not null,
  http_status integer null,
  error_code text null,
  evidence_summary text not null,
  check (
    outcome_status in (
      'verified',
      'failed',
      'pending',
      'stale'
    )
  ),
  check (
    http_status is null or
    (http_status >= 100 and http_status <= 599)
  ),
  check (error_code is null or length(trim(error_code)) > 0),
  check (length(trim(evidence_summary)) > 0)
);

create index if not exists idx_ats_target_verification_events_target_attempted
  on ats_target_verification_events (target_id, attempted_at desc);

create index if not exists idx_ats_target_verification_events_attempted
  on ats_target_verification_events (attempted_at desc);