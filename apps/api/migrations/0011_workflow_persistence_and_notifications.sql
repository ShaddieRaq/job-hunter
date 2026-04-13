-- Step 10+ workflow durability: saved searches + notification schema expansion for high-fit alerts

create table if not exists user_saved_searches (
  saved_search_id uuid primary key,
  user_id uuid not null references users(user_id) on delete cascade,
  name text not null,
  query_text text not null,
  recommendation_filter text not null,
  remote_filter text not null,
  source_filter text not null,
  sort_mode text not null,
  include_hidden boolean not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  last_used_at timestamptz null,
  check (
    recommendation_filter in (
      'high_fit',
      'all',
      'apply',
      'review',
      'skip',
      'unscored'
    )
  ),
  check (
    remote_filter in (
      'aligned',
      'any',
      'remote',
      'hybrid',
      'onsite'
    )
  ),
  check (
    source_filter = 'any' or source_filter ~ '^[a-z0-9][a-z0-9_-]*$'
  ),
  check (
    sort_mode in ('fit', 'recent', 'salary')
  )
);

create unique index if not exists idx_saved_searches_user_name
  on user_saved_searches (user_id, lower(name));

create index if not exists idx_saved_searches_user_updated
  on user_saved_searches (user_id, updated_at desc);

alter table user_notification_logs
  alter column reminder_id drop not null;

alter table user_notification_logs
  add column if not exists match_artifact_version integer null;

alter table user_notification_logs
  drop constraint if exists user_notification_logs_notification_type_check;

alter table user_notification_logs
  add constraint user_notification_logs_notification_type_check
  check (
    notification_type in (
      'reminder_due',
      'high_fit_alert'
    )
  );

alter table user_notification_logs
  drop constraint if exists user_notification_logs_notification_payload_check;

alter table user_notification_logs
  add constraint user_notification_logs_notification_payload_check
  check (
    (
      notification_type = 'reminder_due' and
      reminder_id is not null and
      match_artifact_version is null
    ) or (
      notification_type = 'high_fit_alert' and
      reminder_id is null and
      match_artifact_version is not null and
      match_artifact_version >= 1
    )
  );

drop index if exists idx_notification_logs_user_reminder_type;

create unique index if not exists idx_notification_logs_user_reminder_type
  on user_notification_logs (user_id, reminder_id, notification_type)
  where reminder_id is not null;

create unique index if not exists idx_notification_logs_user_high_fit_artifact
  on user_notification_logs (
    user_id,
    canonical_job_id,
    match_artifact_version,
    notification_type
  )
  where notification_type = 'high_fit_alert' and match_artifact_version is not null;
