# ATS Go/No-Go Gate Acceptance Test Cases

Last updated: 2026-04-14  
Owner: engineering + product

Related plans:
- `docs/ats-target-expansion-plan.md`
- `docs/q2-q3-strategy-execution-plan.md`
- `docs/ats-first-sprint-pr-sequence.md`

## Purpose

Define objective, repeatable gate tests so milestone go/no-go decisions are evidence-based and auditable.

## Evidence pack template (required for every gate review)

1. Metric snapshot (time window, numerator, denominator, threshold).
2. Test run links/results (unit, integration, worker, and canary outcomes where applicable).
3. Incident summary for the same window (degraded/failed runs, mitigation actions).
4. Explicit gate verdict: go or no-go, with owner sign-off.

## Gate M0: quick-win coverage

### M0-T1 Verified target growth

- Objective: validate target count growth without counting unverified or stale entries.
- Method: automated query against registry counts by vendor.
- Pass criteria:
  - Verified active targets increase by at least 300 versus baseline window.
  - Count excludes `pending`, `failed`, and `stale` statuses.
- Evidence:
  - Metrics snapshot for baseline and current window.

### M0-T2 14-day precision floor

- Objective: confirm acceptance quality remains trust-preserving.
- Method: automated precision calculation using 14-day re-check outcomes.
- Pass criteria:
  - Precision >=95% for newly accepted targets.
  - Denominator and exclusion rules documented in output.
- Evidence:
  - Precision report with numerator/denominator and excluded cohorts.

### M0-T3 Sync stability

- Objective: ensure coverage growth did not destabilize ingestion.
- Method: worker/API run-health analysis for daily sync cadence.
- Pass criteria:
  - No recurring manual hotfix requirement during review window.
  - Degraded/failed runs remain below agreed failure budget.
- Evidence:
  - Run-health dashboard export and incident log.

## Gate M1: registry foundation

### M1-T1 CRUD and read-by-vendor behavior

- Objective: verify core registry operations and read patterns.
- Method: API integration tests + canary manual API calls.
- Pass criteria:
  - Can create/list/update ATS targets with auth and validation.
  - Can list verified targets by vendor deterministically.
- Evidence:
  - Integration test report and canary request logs.

### M1-T2 Verification-event persistence

- Objective: ensure every verification attempt has immutable evidence.
- Method: repository + API tests with repeated attempts.
- Pass criteria:
  - One append-only event row per attempt.
  - Existing events cannot be modified by update paths.
- Evidence:
  - Event table snapshots before/after attempts.

### M1-T3 Queryable audit trail

- Objective: confirm evidence is practical for gate review.
- Method: API endpoint queries by target and vendor with pagination.
- Pass criteria:
  - Event history is retrievable, paginated, and filterable.
  - Returned event payload includes status, reason, timestamp, and HTTP evidence fields.
- Evidence:
  - Endpoint responses for sample targets/vendors.

## Gate M2: lifecycle hardening

### M2-T1 Registry-backed runtime enforcement

- Objective: prove runtime connector set is fully registry-backed.
- Method: integration tests and runtime introspection.
- Pass criteria:
  - Runtime connector materialization includes only `verified` targets.
  - Any target outside `verified` is excluded from active runtime list.
- Evidence:
  - Connector list snapshots and status-filter test output.

### M2-T2 Stale demotion automation

- Objective: validate freshness lifecycle behavior.
- Method: scheduler test with forced staleness windows.
- Pass criteria:
  - Targets transition to `stale` when overdue.
  - Re-verification job updates status and emits new events.
- Evidence:
  - Status transition log and corresponding event rows.

### M2-T3 Partial failure containment

- Objective: ensure lifecycle controls tolerate upstream instability.
- Method: canary batch with injected transient failures.
- Pass criteria:
  - Partial verification failures do not collapse sync pipeline.
  - Failure budget and retry ceilings are respected.
- Evidence:
  - Canary run report and retry/failure counters.

## Gate M3: human review workflow

### M3-T1 Ambiguous candidate handling

- Objective: prevent ambiguous auto-acceptance.
- Method: integration tests with ambiguous candidate fixtures.
- Pass criteria:
  - Ambiguous candidates are routed to review queue and not auto-verified.
  - Ambiguous auto-acceptance count equals zero in review window.
- Evidence:
  - Queue records and acceptance decision logs.

### M3-T2 Reviewer decision auditability

- Objective: ensure reviewer actions are traceable and reversible.
- Method: API workflow tests for approve/reject and reversal actions.
- Pass criteria:
  - Approve/reject actions persist actor, timestamp, note, and prior state.
  - Reversal action preserves historical evidence instead of overwriting.
- Evidence:
  - Decision timeline output for sample target IDs.

### M3-T3 Queue SLA compliance

- Objective: ensure governance backlog stays bounded.
- Method: queue age analytics on p95 review age.
- Pass criteria:
  - p95 queue age <=72 hours for review window.
- Evidence:
  - Queue age dashboard extract with p50/p95 metrics.

## Gate M4: new connector expansion

### M4-T1 Deterministic mapping and verifier contract

- Objective: validate new connector correctness before rollout.
- Method: fixture-driven mapping tests + verifier contract tests.
- Pass criteria:
  - Mapping tests pass for required/edge-case fixtures.
  - Verifier adapter emits normalized deterministic reason/status outputs.
- Evidence:
  - Test reports and fixture run artifacts.

### M4-T2 Pilot precision threshold

- Objective: verify new connector quality does not dilute trust.
- Method: limited pilot cohort with 14-day precision tracking.
- Pass criteria:
  - Pilot precision >=95% over 14 days before broad rollout.
- Evidence:
  - Cohort precision report with confidence interval notes.

### M4-T3 Reliability budget impact

- Objective: ensure connector rollout does not break existing reliability budgets.
- Method: compare degraded/failed sync rates before and during pilot.
- Pass criteria:
  - Global degraded/failed run rates remain within budget threshold.
  - No sustained regression in median sync completion time.
- Evidence:
  - Before/after reliability dashboard snapshots.

## Default no-go triggers

1. Missing numerator/denominator evidence for any KPI-driven gate.
2. Any production runtime path bypassing deterministic verification.
3. Any observed ambiguous auto-acceptance in production.
4. Precision below floor for two consecutive weekly windows.
5. Reliability budget breach without approved mitigation and rollback plan.

## Review cadence recommendation

1. M0 review: weekly during 0-30 day window.
2. M1 and M2 review: at each major merge milestone and weekly thereafter.
3. M3 and M4 review: before enabling broad rollout flags.
