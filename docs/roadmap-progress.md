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
5. ⬜ Canonical job catalog and dedupe v1
6. ⬜ Search/feed UI
7. 🟨 Explainable match scoring
   - Evidence: provider-backed structured AI outputs remain wired through the API AI module with OpenAI adapter + deterministic fallback, fixture-driven extraction/explanation eval harness is in place, and deterministic score-breakdown artifacts are now persisted/versioned and exposed via `/v1/ai/score-match` routes.
   - Remaining: wire score artifact reads into canonical job catalog/feed query paths once Steps 4-6 data surfaces are available.
8. ⬜ Tracker and reminders
9. ⬜ Resume/application support

## Current focus
- Active step: 5 (canonical job catalog and dedupe v1) while continuing Step 7 integration points
- Next PR target: introduce canonical job/source mapping modules and wire persisted scoring artifacts into canonical feed/detail retrieval paths
- Known blockers: package installation/check execution may be limited by network/proxy constraints in some environments

## Recent evidence
- 2026-04-12: AI bootstrap contract and API route scaffolding added (`/v1/ai/extract/resume`, `/v1/ai/extract/job`, `/v1/ai/explain-match`) with deterministic placeholder service and tests.
- 2026-04-12: AI provider abstraction landed with OpenAI structured JSON schema adapter, deterministic fallback handling for provider failures, and fixture-driven extraction + explanation eval harness with threshold-enforced tests.
- 2026-04-12: Deterministic score-breakdown generation and versioned match score/explanation artifacts added (`POST /v1/ai/score-match`, latest/history retrieval routes), with unit + integration coverage and migration `0003_match_scoring_artifacts.sql`.
- 2026-04-12: Connector framework Step 4 completed with Greenhouse public board ingestion adapter, in-memory source job persistence, connector health/sync endpoints, fixture-driven connector normalization tests, and migration `0004_connector_framework.sql`.

## Update rule for every roadmap PR
When a PR touches roadmap scope, update this file with:
1. step status changes
2. evidence (PR or commit reference; local commits may be referenced before PR exists)
3. remaining work for any in-progress step
