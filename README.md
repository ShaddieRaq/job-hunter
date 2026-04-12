# Job Hunter

Job Hunter is a job-search assistant for individual job seekers.

The product aggregates jobs from official/public sources, normalizes and deduplicates them, scores them for a specific user, explains fit, and helps the user stay organized through the application process.

## Product intent

This is not a spray-and-pray auto-apply bot.

The product is designed to help a user:
- discover strong opportunities faster
- reduce time spent reviewing low-fit jobs
- understand why a job is worth applying to
- track what they have seen, saved, hidden, or applied to
- prepare tailored materials without fully automating the user out of the process

## Current repository status

This repository is a TypeScript monorepo with Steps 2 and 3 complete and Step 7 AI foundation work in progress:

```text
apps/
  api/      # Node API with health + auth/profile/preferences/resume + AI extraction/explanation v1 endpoints
  web/      # Placeholder web homepage server
  worker/   # Background worker entrypoint stub
packages/
  shared/   # Shared types and runtime-validated contracts (Zod)
docs/
```

### Implemented API surface (v1)

- POST /v1/auth/register
- POST /v1/auth/login
- GET /v1/profile
- PUT /v1/profile
- GET /v1/preferences
- PUT /v1/preferences
- POST /v1/resumes
- GET /v1/resumes
- GET /v1/resumes/:resumeId
- POST /v1/ai/extract/resume
- POST /v1/ai/extract/job
- POST /v1/ai/explain-match

### Persistence and tests currently included

- Initial migration for users/sessions/profiles/preferences schema under apps/api/migrations
- Resume metadata + structured profile migration under apps/api/migrations
- In-memory repository adapter for local runtime behavior
- In-memory object storage abstraction for resume files
- API unit and integration tests for auth/profile/preferences, resume upload/parsing, and AI provider behavior
- Fixture-driven AI extraction/explanation eval harness baseline in apps/api/test/evals

## Suggested local commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
```

## Documentation index

- `AGENTS.md` - shared instructions for AI coding agents
- `docs/mvp-scope.md` - what MVP includes and excludes
- `docs/architecture.md` - target architecture and module boundaries
- `docs/domain-model.md` - core data model and business rules
- `docs/testing.md` - testing strategy and quality gates
- `docs/roadmap-progress.md` - current roadmap status and next step tracker
- `docs/ai-implementation-plan.md` - Phase A AI implementation checklist and contracts
- `.github/copilot-instructions.md` - repo-wide Copilot guidance
- `.github/instructions/*.instructions.md` - scoped instructions by area
- `.github/prompts/*.prompt.md` - reusable prompts for repeated workflows

## Build order

Recommended order for early implementation:
1. repository skeleton
2. auth and user profile/preferences (done)
3. resume upload and parsing (done)
4. connector framework and first job sources
5. canonical jobs and dedupe
6. search and discovery UI
7. explainable scoring
8. tracker and reminders
9. application support tooling
