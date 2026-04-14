# MVP Roadmap Progress

Last updated: 2026-04-14  
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
   - Evidence: shared connector contracts (`packages/shared/src/contracts/connectors/v1.ts`), API connector module (`apps/api/src/modules/connectors`), Greenhouse + Lever public board connector adapters, source sync/list routes (`/v1/connectors`, `/v1/connectors/:sourceName/sync`, `/v1/source-jobs`), migration `0004_connector_framework.sql`, and unit/integration coverage.
   - Remaining: none.
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
- Active step: run iterative checkpoint delivery after phase 3 (daily-priority queue) and prioritize phase 4 motivation/progress panel
- Next PR target: iteration phase 4 motivation/progress panel and confidence-preserving UX cues
- Known blockers: package installation/check execution may be limited by network/proxy constraints in some environments

## MVP validation remediation checklist
- Outcome: gate moved from "MVP Not Yet Validated" to "MVP Validated" using code + test/runtime evidence for each open promise.
- Source audit: `docs/mvp-validation-audit-2026-04-13.md` (revised after remediation slice 5).

1. ✅ P0 - scheduled import jobs (`High` risk)
   - Scope: implement worker orchestration for connector sync + canonical rebuild on a schedule, including retry/backoff, post-rebuild high-fit dispatch cadence, and health reporting.
   - Delivery evidence: worker ingestion API client + scheduler implementation (`apps/worker/src/ingestion/client.ts`, `apps/worker/src/ingestion/scheduler.ts`), authenticated API high-fit dispatch-all route (`apps/api/src/modules/notifications/routes.ts`), worker job status endpoints (`apps/worker/src/index.ts`), and worker unit coverage (`apps/worker/test/unit/ingestion.scheduler.test.ts`).
   - Completion check: worker can run scheduled sync/rebuild + high-fit dispatch cycles and expose latest run health/status (including dispatch aggregates/failures) without manual `/actions/sync` and `/actions/rebuild` triggers.

2. ✅ P1 - explicit discovery actions save/hide/shortlist (`High` risk)
   - Scope: add first-class feed actions and API semantics for save/bookmark/hide/shortlist, mapped to tracker workflow states.
   - Delivery evidence: shared tracker action contracts (`packages/shared/src/contracts/tracker/v1.ts`), API tracker discovery-action endpoint (`POST /v1/tracker/jobs/:canonicalJobId/actions/:action` in `apps/api/src/modules/tracker/routes.ts`), service-level action mapping (`apps/api/src/modules/tracker/service.ts`), web discovery controls + action handler (`apps/web/src/index.ts`), and API/web regression coverage (`apps/api/test/integration/tracker.routes.test.ts`, `apps/web/test/integration/feed-ui.test.ts`).
   - Completion check: users can save, shortlist, and hide roles directly from discovery and see deterministic tracker state updates in feed/detail UI.

3. ✅ P1 - sensitive-data minimization guardrails (`High` risk)
   - Scope: add explicit redaction/minimization controls for AI-provider payload construction and sensitive logging boundaries.
   - Delivery evidence: AI privacy guardrails module and service-level provider-boundary sanitization (`apps/api/src/modules/ai/privacy.ts`, `apps/api/src/modules/ai/service.ts`) plus provider error-detail minimization (`apps/api/src/modules/ai/openai-provider.ts`) and regression coverage (`apps/api/test/unit/ai.service.test.ts`, `apps/api/test/unit/ai.openai-provider.test.ts`).
   - Completion check: outbound AI provider payloads are redacted/minimized and provider-side error bodies are not propagated through API error details.

4. ✅ P2 - saved searches (`Medium` risk)
   - Scope: add saved-search persistence plus API/web flows for creating and reusing feed filter presets.
   - Delivery evidence: shared saved-search contracts (`packages/shared/src/contracts/saved-searches/v1.ts` + `packages/shared/src/index.ts` exports), API saved-search module/routes (`apps/api/src/modules/saved-searches/*`, `apps/api/src/server.ts`), web saved-search feed actions/UI (`apps/web/src/index.ts`), and regression coverage (`apps/api/test/unit/saved-searches.service.test.ts`, `apps/api/test/integration/saved-searches.routes.test.ts`, `apps/web/test/integration/feed-ui.test.ts`).
   - Completion check: users can store, re-apply, and delete search presets directly from discovery workflows.

5. ✅ P2 - high-fit alerts/digests (`Medium` risk)
   - Scope: extend notifications with recommendation-threshold-based high-fit alert/digest generation.
   - Delivery evidence: notification contract/service/repository updates with score-threshold and tracker-state eligibility gating plus authenticated high-fit dispatch routes (`packages/shared/src/contracts/notifications/v1.ts`, `apps/api/src/modules/notifications/service.ts`, `apps/api/src/modules/notifications/routes.ts`, `apps/api/src/modules/notifications/in-memory-repository.ts`, `apps/api/src/server.ts`), worker post-rebuild high-fit dispatch cadence wiring (`apps/worker/src/ingestion/client.ts`, `apps/worker/src/ingestion/scheduler.ts`), and regression coverage (`apps/api/test/unit/notifications.service.test.ts`, `apps/api/test/integration/notifications.routes.test.ts`, `apps/worker/test/unit/ingestion.scheduler.test.ts`).
   - Completion check: users receive explainable high-fit alerts without manual polling.

## Validation gate criteria
1. All `High` risk audit gaps are `✅ done` with linked code and tests.
2. Remaining `Medium` gaps are either `✅ done` or intentionally de-scoped with documented rationale in `docs/mvp-scope.md`.
3. `pnpm -r typecheck` and relevant API/web tests pass for each remediation slice.
4. `docs/mvp-validation-audit-2026-04-13.md` is updated (or superseded) with an explicit re-audit verdict.

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
- 2026-04-13: External strict MVP validation audit merged (`643c2d1`) and identified five prioritized remediation gaps before final MVP gate sign-off.
- 2026-04-13: MVP remediation slice 1 landed in commit `0c4f22f` with worker-based scheduled sync/rebuild orchestration, retry/backoff handling, worker job-health/status endpoints, and worker unit coverage for healthy/degraded cycle behavior.
- 2026-04-13: MVP remediation slice 2 landed in commit `c821fd7` with explicit discovery save/shortlist/hide actions across shared contracts, API semantics, web feed/detail controls, and API/web test coverage.
- 2026-04-13: MVP remediation slice 3 landed with explicit AI provider-boundary payload minimization (resume/job/explanation sanitization + user-identity anonymization), upstream provider error-detail minimization, and AI regression coverage proving sensitive text is redacted before provider invocation.
- 2026-04-13: MVP remediation slice 4 landed with saved-search contracts, authenticated API create/list/get/delete routes, and web feed save/apply/delete flows backed by API/web regression coverage.
- 2026-04-13: MVP remediation slice 5 landed with recommendation-threshold high-fit alert dispatch (`POST /v1/notifications/high-fit/dispatch`), score-artifact idempotency keys, tracker-state suppression for terminal workflows, and unit/integration coverage for alert eligibility plus duplicate suppression.
- 2026-04-13: Post-validation UX polish landed with feed-integrated high-fit alert visibility (sent notification fetch, high-fit-only panel rendering, and direct jump-to-job navigation) covered by web integration regression tests.
- 2026-04-13: Post-validation worker cadence landed with high-fit dispatch-all orchestration (`POST /v1/notifications/high-fit/dispatch-all`) triggered after successful worker rebuild cycles, plus API/worker regression coverage for aggregate and degraded dispatch paths.
- 2026-04-13: Post-validation connector expansion landed with Lever public board ingestion (`lever_public_board`) wired into default connector service, fixture-driven normalization tests, and connector route integration coverage for multi-source sync/list behavior.
- 2026-04-13: Post-validation connector expansion continued with Arbeitnow job-board ingestion (`arbeitnow_job_board`) wired into default connector service, fixture-driven normalization tests, connector route integration coverage updates, and web one-click sync orchestration for Greenhouse + Arbeitnow with partial-success notice handling.
- 2026-04-13: Post-validation feed UX refinement landed with source-aware discovery controls (feed `source` filter, per-card source provenance chips, source-aware saved-search snapshots), plus shared/API/web regression coverage updates.
- 2026-04-13: External-analysis remediation hardening landed with workflow Postgres repositories (auth/profile, resume, tracker, reminders, notifications, applications, saved searches), migration `0011_workflow_persistence_and_notifications.sql`, runtime durability enforcement via `API_RUNTIME_MODE` + repository mode gating, server-side `/v1/feed` query filtering parity (`q`, recommendation/remote/source/sort/includeHidden/limit), and regression coverage for feed filter semantics plus legacy saved-search source normalization.
- 2026-04-13: Iteration phase 1 landed with feed-detail source listing enrichment (`sourceJobs` summaries resolved per canonical mapping) and web job-detail source listing panel rendering (listing/apply URLs, posted date, location text, required/preferred skills), with API connector/canonical and web detail regression coverage updates.
- 2026-04-13: Iteration phase 2 landed with deterministic feed/detail `nextAction` cues derived from tracker/application/reminder + score context, tracker next-action rule unit coverage, and web job-detail next-action rendering regression coverage.
- 2026-04-13: Iteration phase 3 landed with feed Today priorities queue rendering backed by pending reminder reads (`GET /v1/reminders?status=pending`), deterministic urgency ordering (pending reminders -> untouched high-fit -> shortlisted without progress), and web integration regression coverage for queue category ordering transitions.
- 2026-04-14: Value iteration landed with web profile/preferences editor flows (`/profile`, `/actions/profile/save`) for skills and search-intent input, source listing full-description retrieval via `GET /v1/source-jobs/:sourceName/:sourceJobId`, and API repository auto-selection of Postgres when `DATABASE_URL` is configured.
- 2026-04-14: Connector expansion landed with multi-board Greenhouse configuration via `GREENHOUSE_BOARD_TOKENS` (one registered source per board token) and web sync orchestration updated to discover and sync all configured connector sources through `GET /v1/connectors`.

## Update rule for every roadmap PR
When a PR touches roadmap scope, update this file with:
1. step status changes
2. evidence (PR or commit reference; local commits may be referenced before PR exists)
3. remaining work for any in-progress step
