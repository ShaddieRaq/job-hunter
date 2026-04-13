-- Step 8 tracker and reminders (reminder task lifecycle slice)

create table if not exists user_reminder_tasks (
  reminder_id uuid primary key,
  user_id uuid not null,
  canonical_job_id uuid not null,
  task_type text not null,
  title text not null,
  note text null,
  due_at timestamptz not null,
  status text not null,
  linked_tracker_event_id uuid null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  completed_at timestamptz null,
  check (
    task_type in (
      'application_follow_up',
      'interview_prep',
      'custom'
    )
  ),
  check (
    status in (
      'pending',
      'completed'
    )
  )
);

create unique index if not exists idx_reminder_tasks_tracker_event
  on user_reminder_tasks (user_id, linked_tracker_event_id)
  where linked_tracker_event_id is not null;

create index if not exists idx_reminder_tasks_user_due
  on user_reminder_tasks (user_id, status, due_at asc);

create index if not exists idx_reminder_tasks_user_job
  on user_reminder_tasks (user_id, canonical_job_id, due_at asc);
