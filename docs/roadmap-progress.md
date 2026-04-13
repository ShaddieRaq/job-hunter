# MVP Roadmap Progress

Last updated: 2026-04-13  
Owner: team

## Status legend
- ✅ done
- 🟨 in progress
- ⬜ not started
- ⛔ blocked

## Steps
1. ✅ Repository and architecture skeleton
   - Evidence: scaffold workspace/apps/shared/tooling and guidance layers are merged.
   - Remaining: none.

2. ✅ Auth and profile/preferences
   - Evidence: Step 2 implementation completed on 2026-04-12 in commit 9b3e8cf (shared v1 contracts, API auth/profile/preferences routes + domain services, migration SQL, and unit/integration test coverage).
   - Remaining: none.

3. ✅ Resume upload and parsing pipeline
   - Evidence: Step 3 implementation completed on 2026-04-12 in commit df591b3 and is included in mainline history up through b593171 (shared resume v1 contracts, API resume routes/service/object-storage abstraction, migration `0002_resume_pipeline.sql`, and unit/integration tests).
   - Remaining: none.
4. ✅ Connector framework and first connectors
   - Evidence: shared connector contracts (`packages/shared/src/contracts/connectors/v1.ts`), API connector module (`apps/api/src/modules/connectors`), Greenhouse public board connector adapter, source sync/list routes (`/v1/connectors`, `/v1/connectors/:sourceName/sync`, `/v1/source-jobs`), migration `0004_connector_framework.sql`, and unit/integration coverage.
   - Remaining: add additional official/public connectors after canonical job module (Step 5) is in place.
5. ✅ Canonical job catalog and dedupe v1
   - Evidence: canonical job contracts (`packages/shared/src/contracts/jobs/v1.ts`), API canonical module (`apps/api/src/modules/canonical-jobs`), canonical rebuild/list/detail routes (`/v1/canonical-jobs/*`), dedupe trace events (`/v1/canonical-jobs/:canonicalJobId/dedupe-events`), feed/detail query routes (`/v1/feed`, `/v1/feed/:canonicalJobId`) with score-artifact joins, migrations `0005_canonical_jobs_dedupe_v1.sql` + `0006_canonical_dedupe_trace_events.sql`, PostgreSQL repository adapters, and unit/integration coverage.
   - Remaining: none.
6. ✅ Search/feed UI
   - Evidence: server-rendered web feed/detail module (`apps/web/src/index.ts`) now consumes `/v1/feed` and `/v1/feed/:canonicalJobId`, includes preference-aligned filters/sorting, and exposes sync/rebuild control actions.
   - Remaining: none.
7. ✅ Explainable match scoring
   - Evidence: provider-backed structured AI outputs remain wired through the API AI module with OpenAI adapter + deterministic fallback, deterministic score-breakdown artifacts are persisted/versioned via `/v1/ai/score-match` routes, score explanation rollout controls (`AI_SCORE_EXPLANATION_MODE`, `AI_SCORE_EXPLANATION_ROLLOUT_PERCENT`) are implemented, and explanation evidence guardrails enforce deterministic fallback for unsupported outputs.
   - Remaining: none.
8. ✅ Tracker and reminders
   - Evidence: tracker contracts (`packages/shared/src/contracts/tracker/v1.ts`), reminder contracts (`packages/shared/src/contracts/reminders/v1.ts`), notification contracts (`packages/shared/src/contracts/notifications/v1.ts`), API modules for tracker/reminder/notification workflows (`apps/api/src/modules/tracker`, `apps/api/src/modules/reminders`, `apps/api/src/modules/notifications`), authenticated routes (`/v1/tracker/jobs*`, `/v1/reminders*`, `/v1/notifications*`), tracker observer-driven auto-reminders for `applied`/`interview`, and migrations `0007_tracker_state_history.sql` + `0008_reminder_tasks.sql` + `0009_notification_logs.sql` with unit/integration coverage (`5169288`, `2a82afa`, `f99eb47`).
   - Remaining: none.
9. ✅ Resume/application support
   - Evidence: shared application contracts (`packages/shared/src/contracts/applications/v1.ts`) now include structured material-guidance schemas, API application module (`apps/api/src/modules/applications`) provides authenticated create/list/detail/update plus `GET /v1/applications/:applicationId/material-guidance`, guidance generation is deterministic and profile/preferences-aware in the application domain service, and web application workflow surfaces in `apps/web/src/index.ts` render API-backed material assistant outputs for application/job detail pages with integration coverage.
   - Remaining: none.

## Current focus
- Active step: roadmap completion follow-through and MVP polish
- Next PR target: post-roadmap hardening tasks (quality gates, docs refinement, and operational readiness checks)
- Known blockers: package installation/check execution may be limited by network/proxy constraints in some environments

## Recent evidence
- 2026-04-12: AI bootstrap contract and API route scaffolding added (`/v1/ai/extract/resume`, `/v1/ai/extract/job`, `/v1/ai/explain-match`) with deterministic placeholder service and tests.
- 2026-04-12: AI provider abstraction landed with OpenAI structured JSON schema adapter, deterministic fallback handling for provider failures, and fixture-driven extraction + explanation eval harness with threshold-enforced tests.
- 2026-04-12: Deterministic score-breakdown generation and versioned match score/explanation artifacts added (`POST /v1/ai/score-match`, latest/history retrieval routes), with unit + integration coverage and migration `0003_match_scoring_artifacts.sql`.
- 2026-04-12: Connector framework Step 4 completed with Greenhouse public board ingestion adapter, in-memory source job persistence, connector health/sync endpoints, fixture-driven connector normalization tests, and migration `0004_connector_framework.sql`.
- 2026-04-12: Step 5 first slice landed with deterministic canonicalization/dedupe service, canonical catalog routes (`POST /v1/canonical-jobs/rebuild`, `GET /v1/canonical-jobs`, `GET /v1/canonical-jobs/:canonicalJobId`), migration scaffold `0005_canonical_jobs_dedupe_v1.sql`, PostgreSQL-backed repository adapters, and coverage for dedupe behavior plus route boundaries.
- 2026-04-12: Step 5 completion landed with dedupe trace event persistence (`0006_canonical_dedupe_trace_events.sql`), canonical dedupe-event route, and feed/detail query routes joined with latest score artifacts.
- 2026-04-12: Step 6 landed with authenticated web feed/detail UI, preference-aligned filtering/sorting, score and dedupe context rendering, and web integration tests for sign-in/feed/detail/action flows.
- 2026-04-12: Step 7 completed with score explanation rollout controls, deterministic guardrail fallback for unsupported explanation evidence, expanded explanation fixtures (including review recommendations), and stricter explanation quality threshold checks.
- 2026-04-12: Step 8 first slice landed with tracker state transition contracts, authenticated tracker transition/list/detail/history routes, transition audit events, migration `0007_tracker_state_history.sql`, and tracker unit/integration coverage (`5169288`).
- 2026-04-12: Step 8 second slice landed with reminder task contracts/routes (`GET/POST /v1/reminders`, `GET /v1/reminders/:reminderId`, `PUT /v1/reminders/:reminderId/complete`), tracker transition observer hooks for auto-reminder creation on `applied` and `interview`, migration `0008_reminder_tasks.sql`, and reminder unit/integration coverage (`2a82afa`).
- 2026-04-12: Step 8 final slice landed with notification log contracts/routes (`GET /v1/notifications`, `POST /v1/notifications/reminders/dispatch`), due-reminder dispatch workflow scaffolding, migration `0009_notification_logs.sql`, and notification unit/integration coverage (`f99eb47`).
- 2026-04-12: Step 9 first slice landed with application contracts/routes (`GET/POST /v1/applications`, `GET/PUT /v1/applications/:applicationId`), canonical/resume validation, migration `0010_application_records.sql`, and application unit/integration coverage (`7dbdfae`).
- 2026-04-12: Step 9 second slice landed with web application workflow support (feed card track/update actions, `/applications` list/detail pages, job/application material guidance checklists) and web integration coverage for create/list/detail/update flows.
- 2026-04-12: Step 9 final slice landed with deterministic structured material assistant flows (`GET /v1/applications/:applicationId/material-guidance`), shared guidance contracts, API unit/integration coverage, and web rendering of keyword suggestions, bullet prompts, and cover-letter talking points.
- 2026-04-13: Post-MVP stabilization hardening landed with web auth submit-mode fallback protection, connector sync response contract caps for large error batches, canonical rebuild payload-limit alignment in web actions, Greenhouse null-metadata compatibility handling, and expanded unit/integration/manual QA coverage.

## Update rule for every roadmap PR
When a PR touches roadmap scope, update this file with:
1. step status changes
2. evidence (PR or commit reference; local commits may be referenced before PR exists)
3. remaining work for any in-progress step
