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
- Canonical catalog v1 endpoints:
	- `POST /v1/canonical-jobs/rebuild`
	- `GET /v1/canonical-jobs`
	- `GET /v1/canonical-jobs/:canonicalJobId`
	- `GET /v1/canonical-jobs/:canonicalJobId/dedupe-events`
	- `GET /v1/feed`
	- `GET /v1/feed/:canonicalJobId`
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
	- `GET /v1/tracker/jobs/:canonicalJobId/history`
- Reminder v1 endpoints:
	- `GET /v1/reminders`
	- `POST /v1/reminders`
	- `GET /v1/reminders/:reminderId`
	- `PUT /v1/reminders/:reminderId/complete`
- AI provider orchestration:
	- OpenAI structured JSON-schema adapter (when provider env is configured)
	- deterministic fallback provider for resilient local/dev behavior
	- explicit provider error codes surfaced at HTTP boundaries (`invalid_json_schema`, `provider_timeout`, `provider_refusal`, `provider_http_error`)
	- deterministic score-breakdown generation persisted as per-user, per-job versioned artifacts
- Domain service validation for preference constraints (salary and seniority ranges)
- Resume parsing service with deterministic text extraction heuristics
- Object-storage abstraction with in-memory adapter for uploaded resume files
- In-memory repository adapter for local development
- PostgreSQL migrations:
	- `migrations/0001_auth_profile_preferences.sql`
	- `migrations/0002_resume_pipeline.sql`
	- `migrations/0003_match_scoring_artifacts.sql`
	- `migrations/0004_connector_framework.sql`
	- `migrations/0005_canonical_jobs_dedupe_v1.sql`
	- `migrations/0006_canonical_dedupe_trace_events.sql`
	- `migrations/0007_tracker_state_history.sql`
	- `migrations/0008_reminder_tasks.sql`

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
- `CONNECTOR_REPOSITORY`: repository mode for connector source state (`in-memory` default, `postgres` optional)

## Canonical catalog repository configuration

- `CANONICAL_JOBS_REPOSITORY`: repository mode for canonical jobs (`in-memory` default, `postgres` optional)

## PostgreSQL adapter configuration

- `DATABASE_URL`: required for any `postgres` repository mode
- `PG_POOL_MAX`: optional maximum pool size (default: `10`)
- `PG_IDLE_TIMEOUT_MS`: optional pool idle timeout in milliseconds (default: `30000`)

## AI eval harness

- Run fixture-driven extraction/explanation eval summary:
	- `corepack pnpm --filter @job-hunter/api eval:ai`
- Force eval to use configured provider instead of deterministic baseline:
	- `AI_EVAL_MODE=configured corepack pnpm --filter @job-hunter/api eval:ai`
