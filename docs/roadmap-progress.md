# MVP Roadmap Progress

Last updated: 2026-04-12  
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
8. 🟨 Tracker and reminders
   - Evidence: tracker contracts (`packages/shared/src/contracts/tracker/v1.ts`), API tracker module (`apps/api/src/modules/tracker`) with auditable transition events and transition validation routes (`/v1/tracker/jobs*`), migration scaffold `0007_tracker_state_history.sql`, and unit/integration coverage.
   - Remaining: reminders, reminder task scheduling surfaces, and notification workflows.
9. ⬜ Resume/application support

## Current focus
- Active step: 8 (tracker and reminders)
- Next PR target: add reminder task model + API skeleton with due-date lifecycle and completion events
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
- 2026-04-12: Step 8 first slice landed with tracker state transition contracts, authenticated tracker transition/list/detail/history routes, transition audit events, migration `0007_tracker_state_history.sql`, and tracker unit/integration coverage.

## Update rule for every roadmap PR
When a PR touches roadmap scope, update this file with:
1. step status changes
2. evidence (PR or commit reference; local commits may be referenced before PR exists)
3. remaining work for any in-progress step
