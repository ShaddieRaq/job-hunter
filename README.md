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

This repository is a TypeScript monorepo with Steps 2 through 9 complete,
plus MVP remediation slices 1 through 4 delivered (scheduled ingestion + explicit discovery actions + AI sensitive-data minimization guardrails + saved searches):

```text
apps/
  api/      # Node API with health + auth/profile/preferences/resume + connector ingestion + canonical/feed + AI + tracker/reminder/notification/application v1 endpoints
  web/      # Server-rendered feed/detail + application tracker UI with auth, high-fit-first filters, sync/rebuild controls, discovery actions (save/shortlist/hide), saved-search controls, and material guidance checklists
  worker/   # Background worker with scheduled sync+rebuild orchestration and job-status endpoints
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
- GET /v1/connectors
- POST /v1/connectors/:sourceName/sync
- GET /v1/source-jobs
- POST /v1/canonical-jobs/rebuild
- GET /v1/canonical-jobs
- GET /v1/canonical-jobs/:canonicalJobId
- GET /v1/canonical-jobs/:canonicalJobId/dedupe-events
- GET /v1/feed
- GET /v1/feed/:canonicalJobId
- POST /v1/ai/extract/resume
- POST /v1/ai/extract/job
- POST /v1/ai/explain-match
- POST /v1/ai/score-match
- GET /v1/ai/score-match/:canonicalJobId
- GET /v1/ai/score-match/:canonicalJobId/versions
- GET /v1/tracker/jobs
- GET /v1/tracker/jobs/:canonicalJobId
- PUT /v1/tracker/jobs/:canonicalJobId/state
- POST /v1/tracker/jobs/:canonicalJobId/actions/:action
- GET /v1/tracker/jobs/:canonicalJobId/history
- GET /v1/saved-searches
- POST /v1/saved-searches
- GET /v1/saved-searches/:savedSearchId
- DELETE /v1/saved-searches/:savedSearchId
- GET /v1/reminders
- POST /v1/reminders
- GET /v1/reminders/:reminderId
- PUT /v1/reminders/:reminderId/complete
- GET /v1/notifications
- POST /v1/notifications/reminders/dispatch
- GET /v1/applications
- POST /v1/applications
- GET /v1/applications/:applicationId
- PUT /v1/applications/:applicationId
- GET /v1/applications/:applicationId/material-guidance

### Persistence and tests currently included

- Initial migration for users/sessions/profiles/preferences schema under apps/api/migrations
- Resume metadata + structured profile migration under apps/api/migrations
- Connector source health + source job payload migration under apps/api/migrations
- Canonical jobs + source mapping dedupe migration scaffold under apps/api/migrations
- Canonical dedupe trace-event migration under apps/api/migrations
- Match scoring artifact migration under apps/api/migrations
- Tracker state + transition audit migration under apps/api/migrations
- Reminder task lifecycle migration under apps/api/migrations
- Notification log workflow migration under apps/api/migrations
- Application record workflow migration under apps/api/migrations
- In-memory repository adapter for local runtime behavior
- In-memory object storage abstraction for resume files
- In-memory connector repository + Greenhouse public board connector adapter
- API unit and integration tests for auth/profile/preferences, resume upload/parsing, and AI provider behavior
- Connector fixture-driven unit tests plus connector route integration tests
- Fixture-driven AI extraction/explanation eval harness baseline in apps/api/test/evals
- Tracker/reminder unit and integration tests for transition history, reminder lifecycle, and tracker-linked reminder side effects
- Tracker discovery-action unit/integration tests for save/shortlist/hide semantics
- Notification unit and integration tests for reminder-due dispatch and notification log listing
- Application unit and integration tests for create/list/detail/update workflows and validation paths
- Application material-guidance unit/integration coverage and web integration coverage for assistant rendering
- Web integration tests for sign-in/feed/detail, tracker discovery action flows, plus application create/list/detail/update workflows
- Worker unit tests for scheduled ingestion health outcomes, retry/backoff behavior, and scheduler status tracking
- Saved-search API and web integration tests for create/list/get/delete and feed apply/delete flows
- AI provider-boundary minimization regression tests for redacted payload handling and provider error-detail minimization

## Suggested local commands

```bash
corepack pnpm install
corepack pnpm dev
corepack pnpm build
corepack pnpm lint
corepack pnpm -r typecheck
```

## Documentation index

- `AGENTS.md` - shared instructions for AI coding agents
- `docs/mvp-scope.md` - what MVP includes and excludes
- `docs/architecture.md` - target architecture and module boundaries
- `docs/domain-model.md` - core data model and business rules
- `docs/testing.md` - testing strategy and quality gates
- `docs/manual-e2e-test-plan.md` - browser-driven regression runbook for key user workflows
- `docs/roadmap-progress.md` - current roadmap status and next step tracker
- `docs/mvp-validation-audit-2026-04-13.md` - strict MVP promise-versus-delivery audit and remediation priorities
- `docs/ai-implementation-plan.md` - Phase A AI implementation checklist and contracts
- `.github/copilot-instructions.md` - repo-wide Copilot guidance
- `.github/instructions/*.instructions.md` - scoped instructions by area
- `.github/prompts/*.prompt.md` - reusable prompts for repeated workflows

## Build order

Recommended order for early implementation:
1. repository skeleton
2. auth and user profile/preferences (done)
3. resume upload and parsing (done)
4. connector framework and first job sources (done)
5. canonical jobs and dedupe (done)
6. search and discovery UI (done)
7. explainable scoring (done)
8. tracker and reminders (done)
9. application support tooling (done)
