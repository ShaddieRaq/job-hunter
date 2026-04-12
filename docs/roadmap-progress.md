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
   - Evidence: Step 2 implementation completed on 2026-04-12 (shared v1 contracts, API auth/profile/preferences routes + domain services, migration SQL, and unit/integration test coverage).
   - Remaining: none.

3. 🟨 Resume upload and parsing pipeline
4. ⬜ Connector framework and first connectors
5. ⬜ Canonical job catalog and dedupe v1
6. ⬜ Search/feed UI
7. ⬜ Explainable match scoring
8. ⬜ Tracker and reminders
9. ⬜ Resume/application support

## Current focus
- Active step: 3 (resume upload and parsing pipeline)
- Next PR target: add resume metadata contracts and API upload endpoint skeleton with object-storage abstraction
- Known blockers: package installation/check execution may be limited by network/proxy constraints in some environments

## Update rule for every roadmap PR
When a PR touches roadmap scope, update this file with:
1. step status changes
2. evidence (PR or commit reference; local commits may be referenced before PR exists)
3. remaining work for any in-progress step
