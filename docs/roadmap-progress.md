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
4. ⬜ Connector framework and first connectors
5. ⬜ Canonical job catalog and dedupe v1
6. ⬜ Search/feed UI
7. 🟨 Explainable match scoring
8. ⬜ Tracker and reminders
9. ⬜ Resume/application support

## Current focus
- Active step: 7 (explainable match scoring) and AI Phase A foundation
- Next PR target: wire provider-backed structured outputs and add fixture-driven extraction + explanation eval harness
- Known blockers: package installation/check execution may be limited by network/proxy constraints in some environments

## Recent evidence
- 2026-04-12: AI bootstrap contract and API route scaffolding added (`/v1/ai/extract/resume`, `/v1/ai/extract/job`, `/v1/ai/explain-match`) with deterministic placeholder service and tests.

## Update rule for every roadmap PR
When a PR touches roadmap scope, update this file with:
1. step status changes
2. evidence (PR or commit reference; local commits may be referenced before PR exists)
3. remaining work for any in-progress step
