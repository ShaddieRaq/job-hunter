# MVP Validation Audit (HEAD)

_Date:_ 2026-04-13  
_Auditor mode:_ strict (docs treated as claims; code+tests/runtime required)

## Executive Verdict

The current HEAD delivers a substantial **MVP backbone** (auth/profile/preferences, resume ingestion, connector ingestion, canonicalization/dedupe, explainable scoring artifacts, tracker/reminders/notifications, and application workflows), but it does **not** fully satisfy every documented MVP promise. Several commitments in `docs/mvp-scope.md` and `docs/architecture.md` remain missing or weakly evidenced (notably scheduled imports, saved searches, explicit hide/save/shortlist feed actions, and high-fit alerts/digests UX). **Overall confidence: 83%.**

## Promise Coverage Table

| # | Promise (doc claim) | Source doc location | Implementation evidence | Test/runtime evidence | Status | Risk |
|---|---|---|---|---|---|---|
| 1 | Product is not an autonomous mass auto-apply bot | `README.md`; `docs/mvp-scope.md`; `.github/copilot-instructions.md` | API/web code exposes tracking, scoring, and guidance flows only; no module calls external apply submission endpoints. `apps/api/src/server.ts`, `apps/api/src/modules/applications/service.ts`, `apps/web/src/index.ts` | API/web test suites cover create/update tracker/application flows; no auto-apply behavior present in tested routes. `apps/api/test/integration/applications.routes.test.ts`, `apps/web/test/integration/feed-ui.test.ts` | Delivered | Critical |
| 2 | User account + profile/preferences supported | `docs/mvp-scope.md` | Auth/profile/preferences routes and services exist. `apps/api/src/modules/auth-profile/routes.ts`, `apps/api/src/modules/auth-profile/service.ts`, `packages/shared/src/contracts/profile/v1.ts`, `packages/shared/src/contracts/preferences/v1.ts` | Integration + unit validation coverage present. `apps/api/test/integration/auth-profile.routes.test.ts`, `apps/api/test/unit/auth-profile.service.test.ts` | Delivered | Low |
| 3 | Resume upload + structured extraction pipeline | `docs/mvp-scope.md` | Resume upload stores object URI + parses text + structured profile persistence. `apps/api/src/modules/resume/service.ts`, `apps/api/src/modules/resume/object-storage.ts`, `apps/api/migrations/0002_resume_pipeline.sql` | Resume unit + integration tests pass, including unsupported format handling. `apps/api/test/unit/resume.service.test.ts`, `apps/api/test/integration/resume.routes.test.ts` | Delivered | Low |
| 4 | Official/public source connectors and ingestion | `docs/mvp-scope.md`; `docs/architecture.md` | Greenhouse public board connector + connector framework and health status implemented. `apps/api/src/modules/connectors/greenhouse-public-board-connector.ts`, `apps/api/src/modules/connectors/service.ts`, `apps/api/migrations/0004_connector_framework.sql` | Fixture-driven connector tests + integration route tests. `apps/api/test/unit/connectors.greenhouse-public-board.test.ts`, `apps/api/test/integration/connectors.routes.test.ts` | Delivered | Medium |
| 5 | Scheduled import jobs | `docs/mvp-scope.md` | Worker is only a stub entrypoint; no scheduler/job orchestration implemented. `apps/worker/src/index.ts` | No scheduler tests found; no runtime scheduler command exists. | Not Delivered | High |
| 6 | Raw source payload storage and normalized intermediate fields | `docs/mvp-scope.md`; `docs/domain-model.md`; domain rules in AGENTS | Source candidate includes `rawPayload`; repository + migration persist `raw_payload_json` with normalized fields. `apps/api/src/modules/connectors/types.ts`, `apps/api/src/modules/connectors/repository.ts`, `apps/api/migrations/0004_connector_framework.sql` | Connector parsing/idempotency tests exercise candidate normalization and persistence pathways. `apps/api/test/unit/connectors.service.test.ts` | Delivered | Medium |
| 7 | Canonicalization + dedupe across sources | `docs/mvp-scope.md`; `docs/architecture.md` | Deterministic canonical clustering and source mappings with confidence/reason codes. `apps/api/src/modules/canonical-jobs/service.ts`, `apps/api/migrations/0005_canonical_jobs_dedupe_v1.sql` | Canonical service and integration tests for dedupe/idempotency. `apps/api/test/unit/canonical-jobs.service.test.ts`, `apps/api/test/integration/canonical-jobs.routes.test.ts` | Delivered | High |
| 8 | Dedupe traceability and reversibility | `docs/domain-model.md` + AGENTS domain rules | Dedupe event model includes reversible flag and explicit link/unlink events. `apps/api/migrations/0006_canonical_dedupe_trace_events.sql`, `packages/shared/src/contracts/jobs/v1.ts`, `apps/api/src/modules/canonical-jobs/routes.ts` | Unit tests assert unlinked/link event history behavior. `apps/api/test/unit/canonical-jobs.service.test.ts` | Delivered | High |
| 9 | Deterministic explainable scoring with decomposition + deal breakers | `docs/mvp-scope.md`; `docs/architecture.md`; AGENTS rules | Score artifact has named sub-scores, penalties, strengths/gaps/deal-breakers, recommendation class. `apps/api/src/modules/ai/scoring.ts`, `packages/shared/src/contracts/ai/v1.ts`, `apps/api/src/modules/ai/service.ts` | Unit/integration/eval tests for edge cases + guardrails. `apps/api/test/unit/ai.scoring.test.ts`, `apps/api/test/unit/ai.service.test.ts`, `apps/api/test/integration/ai.routes.test.ts`, `apps/api/test/evals/ai-eval.test.ts` | Delivered | Critical |
| 10 | Explainability shown in discovery/detail decisions | `docs/mvp-scope.md` | Feed/detail API joins latest score artifact and dedupe context. `apps/api/src/modules/canonical-jobs/routes.ts`; web renders score context. `apps/web/src/index.ts` | Web integration test asserts detail rendering of score + dedupe context. `apps/web/test/integration/feed-ui.test.ts` | Delivered | High |
| 11 | Aggregated feed with filtering/sorting | `docs/mvp-scope.md` | Feed route + web query filtering/sorting state exists. `apps/api/src/modules/canonical-jobs/routes.ts`, `apps/web/src/index.ts` | Feed UI integration tests cover filtering and authenticated feed behavior. `apps/web/test/integration/feed-ui.test.ts` | Delivered | Medium |
| 12 | Save/bookmark/hide/shortlist actions in discovery | `docs/mvp-scope.md` | Tracker states and transitions exist (`discovered`, `shortlisted`, etc.), but explicit feed save/hide/bookmark route/action surface is not clearly implemented in API/web endpoints. `packages/shared/src/contracts/tracker/v1.ts`, `apps/api/src/modules/tracker/routes.ts`, `apps/web/src/index.ts` | Tracker tests validate transitions, but no explicit feed “hide/save/bookmark action” tests found. `apps/api/test/integration/tracker.routes.test.ts` | Partially Delivered | High |
| 13 | Saved searches | `docs/mvp-scope.md` | No saved-search module/contract/routes found in workspace. | No tests found for saved searches. | Not Delivered | Medium |
| 14 | New high-fit alerts or digests | `docs/mvp-scope.md` | Reminder-based notifications exist, but no explicit high-fit job alert/digest generator tied to score thresholds. `apps/api/src/modules/notifications/service.ts`, `apps/api/src/modules/reminders/service.ts` | Notification tests cover due-reminder dispatch only. `apps/api/test/unit/notifications.service.test.ts`, `apps/api/test/integration/notifications.routes.test.ts` | Partially Delivered | Medium |
| 15 | Lightweight application tracking with timestamps/history | `docs/mvp-scope.md`; `docs/domain-model.md` | Tracker transition rules + event audit history and application lifecycle endpoints implemented. `apps/api/src/modules/tracker/service.ts`, `apps/api/src/modules/applications/service.ts`, `apps/api/migrations/0007_tracker_state_history.sql`, `apps/api/migrations/0010_application_records.sql` | Unit + integration tests validate transitions/history and application CRUD/update flows. `apps/api/test/unit/tracker.service.test.ts`, `apps/api/test/integration/tracker.routes.test.ts`, `apps/api/test/unit/applications.service.test.ts`, `apps/api/test/integration/applications.routes.test.ts` | Delivered | High |
| 16 | Resume/application support to reduce repeated manual work | `docs/mvp-scope.md` | Deterministic checklist, keyword suggestions, bullet prompts, cover-letter talking points returned per application. `apps/api/src/modules/applications/service.ts`, `packages/shared/src/contracts/applications/v1.ts` | Unit/integration + web tests for material guidance rendering paths. `apps/api/test/unit/applications.service.test.ts`, `apps/api/test/integration/applications.routes.test.ts`, `apps/web/test/integration/feed-ui.test.ts` | Delivered | Medium |
| 17 | Sensitive data handling (resumes/preferences/notes) and minimization | AGENTS, `.github/copilot-instructions.md`, `docs/domain-model.md` | Positive: resumes stored via object storage URI abstraction, not inline API response file blobs. `apps/api/src/modules/resume/service.ts`, `apps/api/src/modules/resume/object-storage.ts`.<br>Gap: no explicit data-minimization or redaction layer for outbound AI requests/logging policy enforcement visible in code. `apps/api/src/modules/ai/service.ts` | No explicit tests asserting sensitive-field redaction/minimization behavior. | Unproven | High |
| 18 | Modular monolith boundaries (domain logic in services, not UI/controllers) | `docs/architecture.md`; AGENTS; `.github/copilot-instructions.md` | Route modules mostly delegate to services; domain rules live in service modules (tracker transitions, canonical dedupe, scoring). `apps/api/src/server.ts`, `apps/api/src/modules/*/routes.ts`, `apps/api/src/modules/*/service.ts` | Broad integration/unit suites validate service-driven behavior. | Delivered | Medium |
| 19 | Required statuses include discovered → archived lifecycle | AGENTS domain rules; `docs/mvp-scope.md` | Tracker contract and transition logic include discovered/shortlisted/reviewing/ready_to_apply/applied/interview/offer/rejected/archived. `packages/shared/src/contracts/tracker/v1.ts`, `apps/api/src/modules/tracker/service.ts` | Tracker unit/integration tests cover transition validity and history. `apps/api/test/unit/tracker.service.test.ts`, `apps/api/test/integration/tracker.routes.test.ts` | Delivered | High |
| 20 | Testing expectations: meaningful behavior covered by unit+integration and runnable checks | `docs/testing.md` | Strong API/web test inventory exists in repo. `apps/api/test/**`, `apps/web/test/**` | Runtime audit execution: `pnpm -r typecheck`, API tests, web tests all passed. | Delivered | Medium |

## Direct Validation of Core MVP Outcomes

1. **Faster discovery of high-fit jobs** — **Partially Delivered**: Aggregated feed + scoring/recommendations exist, but scheduled ingestion automation is missing, weakening timeliness claims.  
2. **Reduced irrelevant job review burden** — **Partially Delivered**: Dedupe and explainable skip/review/apply signals exist; explicit save/hide/bookmark UX semantics are incomplete evidence.  
3. **Application workflow organization** — **Delivered**: tracker states, reminders, notifications, and application CRUD/history pathways are implemented and tested.  
4. **Explainable decision support for where to apply** — **Delivered**: decomposed scoring, strengths/gaps/deal-breakers, recommendation class, and feed/detail exposure are implemented and tested.  
5. **Reduced repeated manual work for application prep** — **Delivered**: material guidance/checklists/keyword and bullet prompts are implemented and tested.

## Undelivered or Weakly Delivered Promises (Prioritized)

1. **Scheduled import jobs missing** (High) — worker process is a stub; this blocks always-fresh discovery and alert reliability.  
2. **Saved searches missing** (Medium) — explicit discovery workflow commitment lacks API/DB/UI implementation.  
3. **Explicit save/hide/bookmark discovery actions weakly evidenced** (High) — tracker transitions exist, but discovery action semantics are not first-class in tested feed behavior.  
4. **High-fit alerts/digests only partially represented** (Medium) — reminder notification dispatch exists, but score-triggered high-fit digest workflows are not clearly present.  
5. **Sensitive-data minimization controls unproven** (High) — no explicit testable redaction/minimization policy layer for AI/log outputs.

## Scope Violations

- **No hard scope violation detected** for explicit non-goals (no autonomous mass auto-apply or scraping-heavy foundation found).  
- **Potential future risk**: if connector strategy expands without stronger official/public-source constraints, non-goal drift is possible.

## Minimal Remediation Plan

1. **Implement scheduled ingestion orchestration in `apps/worker`** (2–4 days, High risk reduction).  
   - Add cron/queue-driven sync + rebuild pipeline, retry/backoff, and health metrics.
2. **Add saved-search model + API + web controls** (2–3 days, Medium reduction).  
   - Persist user query presets and wire to feed filters.
3. **Introduce explicit feed actions (save/hide/shortlist) backed by tracker endpoints** (1–2 days, High reduction).  
   - Add dedicated UI affordances and route/integration tests.
4. **Add high-fit digest/alert workflow keyed to recommendation thresholds** (2–3 days, Medium reduction).  
   - Reuse notification module with scored-job eligibility checks.
5. **Add sensitive-data minimization guardrails and tests** (1–2 days, High reduction).  
   - Redact notes/resume text in logs and constrain provider payload fields.

## Final Gate Decision

**MVP Not Yet Validated**.

### Pass/Fail Criteria Used

- Pass requires every explicit documented MVP promise to be Delivered or clearly bounded with runtime+test proof.  
- Any **High/Critical** promise marked Not Delivered/Unproven fails validation.  
- Presence of core domain constraints (explainability, dedupe traceability, status workflow) is necessary but not sufficient without missing workflow commitments.
