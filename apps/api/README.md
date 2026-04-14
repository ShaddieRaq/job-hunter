# API App

Structured Node.js API for the Job Hunter modular monolith.

## Current scope
- Health endpoint at `GET /health`
- Auth/profile/preferences v1 endpoints:
	- `POST /v1/auth/register`
	- `POST /v1/auth/login`
	- `GET /v1/profile`
	- `PUT /v1/profile`
	- `GET /v1/preferences`
	- `PUT /v1/preferences`
- Resume upload/parsing v1 endpoints:
	- `POST /v1/resumes`
	- `GET /v1/resumes`
	- `GET /v1/resumes/:resumeId`
- Connector ingestion v1 endpoints:
	- `GET /v1/connectors`
	- `POST /v1/connectors/:sourceName/sync`
	- `GET /v1/source-jobs`
	- `GET /v1/source-jobs/:sourceName/:sourceJobId`
- Canonical catalog v1 endpoints:
	- `POST /v1/canonical-jobs/rebuild`
	- `GET /v1/canonical-jobs`
	- `GET /v1/canonical-jobs/:canonicalJobId`
	- `GET /v1/canonical-jobs/:canonicalJobId/dedupe-events`
	- `GET /v1/feed`
	  - supports server-side query filters: `q`, `recommendation`, `remote`, `source`, `sort`, `includeHidden`, `limit`
	  - when `limit` is omitted, feed results are not route-capped by a fixed hard maximum
	  - includes deterministic `nextAction` cues derived from tracker/application/reminder + score context
	- `GET /v1/feed/:canonicalJobId`
	  - includes canonical mappings, dedupe trace, latest score artifact, and source listing summaries for detail UX
	  - includes deterministic `nextAction` cue for the selected role
- AI extraction/explanation v1 endpoints:
	- `POST /v1/ai/extract/resume`
	- `POST /v1/ai/extract/job`
	- `POST /v1/ai/explain-match`
	- `POST /v1/ai/score-match`
	- `GET /v1/ai/score-match/:canonicalJobId`
	- `GET /v1/ai/score-match/:canonicalJobId/versions`
- Tracker v1 endpoints:
	- `GET /v1/tracker/jobs`
	- `GET /v1/tracker/jobs/:canonicalJobId`
	- `PUT /v1/tracker/jobs/:canonicalJobId/state`
	- `POST /v1/tracker/jobs/:canonicalJobId/actions/:action` (`save`, `shortlist`, `hide`)
	- `GET /v1/tracker/jobs/:canonicalJobId/history`
- Reminder v1 endpoints:
	- `GET /v1/reminders`
	- `POST /v1/reminders`
	- `GET /v1/reminders/:reminderId`
	- `PUT /v1/reminders/:reminderId/complete`
	- tracker transitions to `applied` and `interview` auto-create follow-up reminder tasks
- Notification v1 endpoints:
	- `GET /v1/notifications`
	- `POST /v1/notifications/reminders/dispatch`
	- `POST /v1/notifications/high-fit/dispatch`
	- `POST /v1/notifications/high-fit/dispatch-all`
	- dispatch endpoints queue + mark sent due reminder and high-fit notifications for authenticated users, with dispatch-all aggregate reporting for worker cadence orchestration
- Application v1 endpoints:
	- `GET /v1/applications`
	- `POST /v1/applications`
	- `GET /v1/applications/:applicationId`
	- `PUT /v1/applications/:applicationId`
	- `GET /v1/applications/:applicationId/material-guidance`
	- baseline flow stores one active application record per user/canonical job in MVP scope
	- material-guidance endpoint returns deterministic resume-tailoring checklist items, keyword suggestions, bullet prompts, and cover-letter talking points based on profile/preferences + canonical role context
- AI provider orchestration:
	- OpenAI structured JSON-schema adapter (when provider env is configured)
	- deterministic fallback provider for resilient local/dev behavior
	- explicit provider error codes surfaced at HTTP boundaries (`invalid_json_schema`, `provider_timeout`, `provider_refusal`, `provider_http_error`)
	- deterministic score-breakdown generation persisted as per-user, per-job versioned artifacts
- Domain service validation for preference constraints (salary and seniority ranges)
- Resume parsing service with deterministic text extraction heuristics
- Object-storage abstraction with in-memory and filesystem adapters for uploaded resume files
- In-memory repository adapters for local development and PostgreSQL adapters for durable workflow runtime
- PostgreSQL migrations:
	- `migrations/0001_auth_profile_preferences.sql`
	- `migrations/0002_resume_pipeline.sql`
	- `migrations/0003_match_scoring_artifacts.sql`
	- `migrations/0004_connector_framework.sql`
	- `migrations/0005_canonical_jobs_dedupe_v1.sql`
	- `migrations/0006_canonical_dedupe_trace_events.sql`
	- `migrations/0007_tracker_state_history.sql`
	- `migrations/0008_reminder_tasks.sql`
	- `migrations/0009_notification_logs.sql`
	- `migrations/0010_application_records.sql`
	- `migrations/0011_workflow_persistence_and_notifications.sql`

## AI provider configuration

- `AI_PROVIDER`: `auto` (default), `deterministic`, or `openai`
- `AI_PROVIDER_FALLBACK`: `deterministic` (default) or `none`
- `AI_SCORE_EXPLANATION_MODE`: `provider` (default), `deterministic`, or `off` for score-artifact explanation generation
- `AI_SCORE_EXPLANATION_ROLLOUT_PERCENT`: integer `0-100` rollout gate for provider-backed score explanations (default: `100`)
- `OPENAI_API_KEY`: required when using OpenAI provider
- `OPENAI_MODEL`: optional model override (default: `gpt-4.1-mini`)
- `OPENAI_BASE_URL`: optional endpoint override (default: `https://api.openai.com/v1`)
- `OPENAI_TIMEOUT_MS`: optional request timeout in milliseconds (default: `20000`)

## Connector configuration

- `GREENHOUSE_BOARD_TOKEN`: Greenhouse board token used by the default public-board connector instance (default: `stripe` for local/dev bootstrap)
- `LEVER_COMPANY_HANDLE`: Lever company handle used by the default public-board connector instance (default: `netflix` for local/dev bootstrap)
	- Lever currently returns `0` postings for `netflix` from `https://api.lever.co/v0/postings/netflix?mode=json`; set this env var to an org handle with an active Lever public board if you want Lever ingestion volume
- `ARBEITNOW_API_BASE_URL`: optional endpoint override for the default Arbeitnow job-board connector (default: `https://www.arbeitnow.com/api/job-board-api`)
- `CONNECTOR_REPOSITORY`: repository mode for connector source state (`in-memory` default, `postgres` optional; when omitted the API auto-selects `postgres` if `DATABASE_URL` is set)

## Canonical catalog repository configuration

- `CANONICAL_JOBS_REPOSITORY`: repository mode for canonical jobs (`in-memory` default, `postgres` optional; when omitted the API auto-selects `postgres` if `DATABASE_URL` is set)

## Workflow repository configuration

- `WORKFLOW_REPOSITORY`: repository mode for auth/profile/resume/tracker/reminder/notification/application/saved-search modules (`in-memory` default, `postgres` optional; when omitted the API auto-selects `postgres` if `DATABASE_URL` is set)
- `RESUME_OBJECT_STORAGE_DIR`: filesystem directory used for resume uploads when `WORKFLOW_REPOSITORY=postgres` (default: `.data/resumes`)
- `API_RUNTIME_MODE`: `development` (default), `validation`, or `production`

When `API_RUNTIME_MODE` is `validation` or `production`, durable runtime is enforced and all repository modes must be `postgres`:
- `WORKFLOW_REPOSITORY=postgres`
- `CONNECTOR_REPOSITORY=postgres`
- `CANONICAL_JOBS_REPOSITORY=postgres`
- `DATABASE_URL` must be configured

## PostgreSQL adapter configuration

- `DATABASE_URL`: required for any `postgres` repository mode
- `PG_POOL_MAX`: optional maximum pool size (default: `10`)
- `PG_IDLE_TIMEOUT_MS`: optional pool idle timeout in milliseconds (default: `30000`)

## AI eval harness

- Run fixture-driven extraction/explanation eval summary:
	- `corepack pnpm --filter @job-hunter/api eval:ai`
- Force eval to use configured provider instead of deterministic baseline:
	- `AI_EVAL_MODE=configured corepack pnpm --filter @job-hunter/api eval:ai`
