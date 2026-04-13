-- Step 8 tracker and reminders (notification workflow scaffolding slice)

create table if not exists user_notification_logs (
  notification_id uuid primary key,
  user_id uuid not null,
  reminder_id uuid not null,
  canonical_job_id uuid not null,
  notification_type text not null,
  delivery_channel text not null,
  status text not null,
  message text not null,
  scheduled_for timestamptz not null,
  sent_at timestamptz null,
  failed_at timestamptz null,
  error_code text null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (
    notification_type in (
      'reminder_due'
    )
  ),
  check (
    delivery_channel in (
      'in_app'
    )
  ),
  check (
    status in (
      'queued',
      'sent',
      'failed'
    )
  )
);

create unique index if not exists idx_notification_logs_user_reminder_type
  on user_notification_logs (user_id, reminder_id, notification_type);

create index if not exists idx_notification_logs_user_status_scheduled
  on user_notification_logs (user_id, status, scheduled_for asc);
