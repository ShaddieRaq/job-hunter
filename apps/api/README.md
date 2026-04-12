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
- AI extraction/explanation v1 endpoints:
	- `POST /v1/ai/extract/resume`
	- `POST /v1/ai/extract/job`
	- `POST /v1/ai/explain-match`
- AI provider orchestration:
	- OpenAI structured JSON-schema adapter (when provider env is configured)
	- deterministic fallback provider for resilient local/dev behavior
	- explicit provider error codes surfaced at HTTP boundaries (`invalid_json_schema`, `provider_timeout`, `provider_refusal`, `provider_http_error`)
- Domain service validation for preference constraints (salary and seniority ranges)
- Resume parsing service with deterministic text extraction heuristics
- Object-storage abstraction with in-memory adapter for uploaded resume files
- In-memory repository adapter for local development
- PostgreSQL migrations:
	- `migrations/0001_auth_profile_preferences.sql`
	- `migrations/0002_resume_pipeline.sql`

## AI provider configuration

- `AI_PROVIDER`: `auto` (default), `deterministic`, or `openai`
- `AI_PROVIDER_FALLBACK`: `deterministic` (default) or `none`
- `OPENAI_API_KEY`: required when using OpenAI provider
- `OPENAI_MODEL`: optional model override (default: `gpt-4.1-mini`)
- `OPENAI_BASE_URL`: optional endpoint override (default: `https://api.openai.com/v1`)
- `OPENAI_TIMEOUT_MS`: optional request timeout in milliseconds (default: `20000`)

## AI eval harness

- Run fixture-driven extraction/explanation eval summary:
	- `corepack pnpm --filter @job-hunter/api eval:ai`
- Force eval to use configured provider instead of deterministic baseline:
	- `AI_EVAL_MODE=configured corepack pnpm --filter @job-hunter/api eval:ai`
