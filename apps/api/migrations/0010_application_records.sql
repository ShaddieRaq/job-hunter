-- Step 9 resume/application support (application tracker baseline slice)

create table if not exists user_application_records (
  application_id uuid primary key,
  user_id uuid not null,
  canonical_job_id uuid not null,
  status text not null,
  applied_at timestamptz null,
  application_url text null,
  resume_id_used uuid null,
  cover_letter_doc_uri text null,
  notes text null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (
    status in (
      'ready_to_apply',
      'applied',
      'interview',
      'offer',
      'rejected',
      'archived'
    )
  )
);

create unique index if not exists idx_application_records_user_job
  on user_application_records (user_id, canonical_job_id);

create index if not exists idx_application_records_user_status_updated
  on user_application_records (user_id, status, updated_at desc);
