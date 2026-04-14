# Job Hunter Q2–Q3 2026 Strategy and Execution Plan

Last updated: 2026-04-14  
Owner: product + engineering

## Executive summary

Job Hunter has shipped the full MVP workflow (feed, scoring, tracker, reminders, applications, and web flows) and is now constrained primarily by ATS tenant identifier discovery and lifecycle quality. The next two quarters should optimize for predictable coverage growth without trust regressions by running two tracks in parallel: immediate coverage gains and durable identifier governance. The operating model should enforce deterministic acceptance gates, explainable decisions, and strict data/privacy discipline inside the existing TypeScript modular monolith. Execution success is measured by verified active target growth, verification precision at 14 days, stale-target refresh performance, and sync pipeline reliability. We should not treat raw target volume as success unless precision and operational stability thresholds are met.

## 1) State assessment

### What is true now

- Core product workflows are implemented end-to-end across API, web, and worker.
- Roadmap Steps 2 through 9 are complete.
- MVP remediation slices are complete, including scheduled ingestion, discovery actions, privacy guardrails, saved searches, and high-fit alerts.
- Greenhouse and Lever now support multi-identifier configuration (`GREENHOUSE_BOARD_TOKENS`, `LEVER_COMPANY_HANDLES`) and a discovery helper exists for candidate board/slug probing.

### What is working

- Explainable, deterministic scoring infrastructure is present and versioned.
- Canonical dedupe and trace events are auditable.
- Tracker/reminder/application workflows and web integration are functional.
- Worker orchestration supports scheduled sync/rebuild and post-rebuild high-fit dispatch.

### What is fragile

- Coverage remains bottlenecked by identifier discovery quality; there is no global directory of active ATS tenant identifiers.
- Multi-identifier config improves throughput but does not provide durable freshness, reversibility, or governance by itself.
- Without registry-backed lifecycle controls, false positives and stale identifiers can quietly degrade feed trust and sync efficiency.

## 2) Direction (next 2 quarters)

### North star

Every runtime connector target is verifiably alive, explainably accepted, freshness-managed, and auditable, with measurable coverage growth and stable sync operations.

### Strategic principles

1. **Registry-first runtime**: only verified targets become active connector instances.
2. **Deterministic acceptance**: AI may propose candidates, but deterministic probes decide target status.
3. **Freshness as a lifecycle**: target validity expires and must be re-verified on schedule.
4. **Precision over vanity volume**: prioritize trust-preserving precision floor before gross target count.
5. **Governance by default**: ambiguous candidates route to review with reversible decisions and audit trails.

## 3) 30-60-90 day execution plan

## 0–30 days

### Milestone focus
- Milestone 0 quick wins + Milestone 1 registry first slice in parallel.

### Deliverables
- Curated verified target packs for Greenhouse/Lever.
- Initial registry schema and verification-event persistence.
- Coverage operations dashboard slices (verified counts, failure causes, precision trend).
- Safe connector backfill runbook and kill-switch controls.

### Dependencies
- DB migrations for registry tables.
- Greenhouse/Lever verifier adapters and reason codes.
- Worker capacity for batched verification.

### KPI targets
- +300 verified active targets across current vendors.
- >=95% 14-day verification precision for newly accepted targets.
- Daily sync cadence operates without repeated manual hotfixes.

## 31–60 days

### Milestone focus
- Complete Milestone 1 and begin Milestone 2 hardening.

### Deliverables
- Registry CRUD/read APIs and list-by-vendor endpoints.
- Runtime connector materialization from verified targets only.
- Scheduled re-verification and stale-target demotion.

### Dependencies
- Verification event model finalized.
- Failure-budget policy for upstream rate limiting/outages.

### KPI targets
- 100% of active runtime targets backed by verified registry entries.
- stale target rate <15%.
- degraded sync runs <10% weekly.

## 61–90 days

### Milestone focus
- Milestone 2 hardening + Milestone 3 review workflow + first Milestone 4 connector.

### Deliverables
- Review queue API with approve/reject + notes + reversibility.
- Conflict handling for duplicate identifier claims.
- Workable connector + verification adapter as first new vendor under registry lifecycle.

### Dependencies
- Reviewer ownership model and response SLA.
- Fixture coverage for new connector mapping + verifier logic.

### KPI targets
- ambiguous auto-acceptance = 0.
- median stale-target refresh time <7 days.
- pilot connector precision floor >=95% over 14 days before broad rollout.

## 4) Dual-track execution model

## Track A: immediate coverage gains

Objective: produce visible coverage lift in 1–2 release cycles.

- Weekly verified-target campaigns for current ATS vendors.
- Candidate generation from deterministic heuristics + controlled discovery helper usage.
- Deterministic probe verification with strict accept/reject logic.
- Controlled sync/rebuild backfills with failure budgets.

Primary outputs:
- net new verified targets
- net new active jobs surfaced
- precision and invalidation trends

## Track B: long-term durability and governance

Objective: prevent coverage decay and trust regression.

- Registry schema + lifecycle state machine (`verified`, `failed`, `pending`, `stale`).
- Verification event persistence and freshness scheduler.
- Review queue for ambiguous/low-confidence candidates.
- Vendor-agnostic verifier interface and contract tests.

Primary outputs:
- stale-rate reduction
- faster invalidation recovery
- auditable acceptance and reversibility

Recommended capacity split:
- Days 0–45: 60% Track A / 40% Track B
- Days 46–90: 45% Track A / 55% Track B

## 5) First sprint plan (12 tickets)

1. **Add `company_registry` migration**  
   Acceptance: migration applies/rolls back cleanly; constraints + indexes included.

2. **Add `ats_target_registry` migration**  
   Acceptance: unique constraints for vendor+identifier; status/confidence fields present.

3. **Add `ats_target_verification_events` migration**  
   Acceptance: immutable event rows written for each verification attempt.

4. **Implement candidate generation service (Greenhouse/Lever)**  
   Acceptance: deterministic output for seed companies; edge-case normalization tests pass.

5. **Implement Greenhouse verifier adapter**  
   Acceptance: deterministic pass/fail reason codes; retry classification unit-tested.

6. **Implement Lever verifier adapter**  
   Acceptance: adapter parity with Greenhouse contract; fixture tests pass.

7. **Implement verification orchestration worker job**  
   Acceptance: batched runs honor concurrency caps and idempotency windows.

8. **Add registry API: create/list/update targets**  
   Acceptance: Zod-validated boundaries, auth checks, audit metadata persisted.

9. **Add registry API: verification event history endpoint**  
   Acceptance: paginated per-target and per-vendor event retrieval.

10. **Rewire runtime connector registration to verified targets**  
    Acceptance: runtime excludes non-verified and stale targets by default.

11. **Add coverage metrics endpoint(s)**  
    Acceptance: returns verified counts, stale counts, fail reason distribution, and precision denominator/numerator.

12. **Write backfill runbook + emergency kill switch procedure**  
    Acceptance: docs include batch sizing, rollback steps, and ownership handoff.

## 6) Decision framework: new connector vs lifecycle investment

Use a weighted score before each planning cycle:

- **Coverage opportunity (0–5)**: expected unique verified targets in 60 days.
- **Lifecycle readiness (0–5)**: compatibility with current registry + verifier model.
- **Precision confidence (0–5)**: expected 14-day precision after pilot.
- **Operational risk (0–5, negative)**: rate limits, anti-abuse controls, endpoint volatility.
- **Engineering burden (0–5, negative)**: implementation + maintenance + fixture load.

Decision rule:
- Add a new connector only if `coverage + readiness + precision - risk - burden >= 5`
- and current-vendor stale rate is under threshold (<15%).
- Otherwise prioritize improving identifier lifecycle throughput and quality.

## 7) Risk register

1. **False-positive identifier acceptance**  
   Mitigation: strict verifier thresholds, review queue, reversible target state transitions.  
   Trigger: 14-day precision <95% for two consecutive weekly windows.

2. **Coverage decay from stale targets**  
   Mitigation: scheduled re-verification, automatic stale demotion, refresh SLA.  
   Trigger: stale rate >20% of active targets.

3. **Vendor rate limits / anti-abuse controls**  
   Mitigation: jittered schedules, capped concurrency, retry budgets, backoff.  
   Trigger: verifier 429/403 ratio >8% daily.

4. **Sync instability during bulk backfills**  
   Mitigation: canary cohorts, batch caps, emergency kill switch, partial-failure containment.  
   Trigger: degraded/failed sync runs >15% in 24 hours.

5. **Governance backlog for ambiguous candidates**  
   Mitigation: review ownership + SLA and queue prioritization.  
   Trigger: review queue p95 age >72 hours.

6. **Vendor schema drift breaking mappings**  
   Mitigation: adapter contract tests, fixture refresh process, versioned parser behavior.  
   Trigger: nightly fixture failures >10% for any vendor.

## 8) Explicit go/no-go gates

### Gate M0: quick-win coverage
- **Go**: +300 verified targets and >=95% 14-day precision; sync stable.
- **No-go**: precision misses threshold for 2 weeks or requires recurring manual hotfixes.

### Gate M1: registry foundation
- **Go**: can insert/read/update targets, persist verification events, and list verified by vendor.
- **No-go**: verification evidence is not queryable/auditable per target.

### Gate M2: lifecycle hardening
- **Go**: runtime connector set is fully registry-backed verified targets; stale demotion active and auditable.
- **No-go**: any production runtime path bypasses registry verification.

### Gate M3: human review workflow
- **Go**: ambiguous candidates are never auto-accepted; reviewer actions are logged and reversible.
- **No-go**: ambiguous auto-acceptance observed in production.

### Gate M4: new connector expansion
- **Go**: connector + verifier pass deterministic mapping tests and pilot precision floor.
- **No-go**: connector degrades global precision floor or breaks sync reliability budget.

## Assumptions

- Team can sustain parallel execution with at least one engineer focused on durability track.
- Seed-company intake sources (user lists, curated sets, internal records) are sufficient to drive candidate generation.
- Worker and storage capacity can absorb verification events at planned cadence.
- Product leadership treats precision and trust as hard gates, not advisory metrics.
