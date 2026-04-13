-- Step 8 tracker and reminders (tracker state + transition audit slice)

create table if not exists user_job_tracker_states (
  user_id uuid not null,
  canonical_job_id uuid not null,
  state text not null,
  last_transition_note text null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, canonical_job_id),
  check (
    state in (
      'discovered',
      'shortlisted',
      'reviewing',
      'ready_to_apply',
      'applied',
      'interview',
      'offer',
      'rejected',
      'archived'
    )
  )
);

create table if not exists user_job_tracker_transition_events (
  event_id uuid primary key,
  user_id uuid not null,
  canonical_job_id uuid not null,
  from_state text null,
  to_state text not null,
  note text null,
  transitioned_at timestamptz not null,
  check (
    from_state is null or
    from_state in (
      'discovered',
      'shortlisted',
      'reviewing',
      'ready_to_apply',
      'applied',
      'interview',
      'offer',
      'rejected',
      'archived'
    )
  ),
  check (
    to_state in (
      'discovered',
      'shortlisted',
      'reviewing',
      'ready_to_apply',
      'applied',
      'interview',
      'offer',
      'rejected',
      'archived'
    )
  )
);

create index if not exists idx_tracker_states_user_updated
  on user_job_tracker_states (user_id, updated_at desc);

create index if not exists idx_tracker_events_user_job_transitioned
  on user_job_tracker_transition_events (user_id, canonical_job_id, transitioned_at desc);
