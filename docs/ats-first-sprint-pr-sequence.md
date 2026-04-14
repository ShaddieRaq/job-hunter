# ATS Milestone 0 + Milestone 1 First Sprint PR Sequence

Last updated: 2026-04-14  
Owner: engineering

Related plans:
- `docs/ats-target-expansion-plan.md`
- `docs/q2-q3-strategy-execution-plan.md`

## Purpose

Convert the first-sprint 12-ticket plan into a concrete 10-PR, 2-week delivery sequence that can ship incrementally without losing quality gates.

## Delivery constraints

1. Keep each PR independently testable and revertable.
2. Merge schema-first before runtime rewiring.
3. Do not allow unverified targets into runtime connector materialization at any stage.
4. Preserve deterministic verifier behavior and auditable event history.

## Two-week PR sequence

### Week 1

#### PR 1 (Day 1): Registry schema core

- Tickets: 1, 2
- Scope:
  - Add `company_registry` migration.
  - Add `ats_target_registry` migration with vendor+identifier uniqueness constraints.
- Acceptance:
  - Migrations apply and roll back cleanly.
  - Required indexes/constraints exist and are verified by integration tests.
- Tests:
  - Migration up/down smoke tests.

#### PR 2 (Day 2): Verification event schema and repository scaffolding

- Tickets: 3
- Scope:
  - Add `ats_target_verification_events` migration.
  - Add repository interfaces/models for immutable verification events.
- Acceptance:
  - Each verification attempt writes an immutable event row.
  - Event read shape supports pagination and vendor filtering.
- Tests:
  - Repository unit tests for append-only behavior.

#### PR 3 (Day 3): Candidate generation service

- Tickets: 4
- Scope:
  - Implement deterministic Greenhouse/Lever candidate generation from seed companies.
  - Add normalization rules and fixtures for edge-case names.
- Acceptance:
  - Same input seed set always returns same ordered candidate set.
  - Known edge-case fixtures pass normalization assertions.
- Tests:
  - Unit tests with deterministic fixtures.

#### PR 4 (Day 4): Greenhouse verifier adapter

- Tickets: 5
- Scope:
  - Implement Greenhouse deterministic verifier adapter.
  - Add explicit pass/fail reason codes and retry classification.
- Acceptance:
  - Adapter output includes deterministic status, reason code, and retry class.
  - Non-deterministic or ambiguous responses are classified as non-verified.
- Tests:
  - Adapter unit tests for positive, negative, and transient scenarios.

#### PR 5 (Day 5): Lever verifier adapter

- Tickets: 6
- Scope:
  - Implement Lever deterministic verifier adapter.
  - Ensure contract parity with Greenhouse verifier output.
- Acceptance:
  - Lever adapter emits the same normalized verifier result contract as Greenhouse.
  - Fixture set covers success, missing target, and transient provider states.
- Tests:
  - Adapter unit and fixture tests.

### Week 2

#### PR 6 (Day 6): Verification orchestration worker job

- Tickets: 7
- Scope:
  - Add worker job for batched verification runs.
  - Add concurrency limits, idempotency windows, and retry budget handling.
- Acceptance:
  - Worker can process candidate batches without duplicate event writes.
  - Concurrency and retry limits are enforced by configuration.
- Tests:
  - Worker unit tests for healthy/degraded/retry-limit behavior.

#### PR 7 (Day 7): Registry CRUD/read API

- Tickets: 8
- Scope:
  - Add authenticated create/list/update endpoints for ATS targets.
  - Add Zod boundary validation and audit metadata persistence.
- Acceptance:
  - Requests fail fast on invalid payloads.
  - Audit metadata is attached to each write.
- Tests:
  - API integration tests for auth, validation, and write/read behavior.

#### PR 8 (Day 8): Verification event history API

- Tickets: 9
- Scope:
  - Add paginated history endpoint for per-target and per-vendor event queries.
- Acceptance:
  - Pagination is stable and deterministic.
  - Per-target and per-vendor filters return expected slices.
- Tests:
  - API integration tests for pagination and filtering semantics.

#### PR 9 (Day 9): Runtime connector rewiring

- Tickets: 10
- Scope:
  - Materialize runtime connector targets from `verified` registry entries only.
  - Exclude stale/non-verified targets by default.
  - Add temporary rollout control flag for safe cutover.
- Acceptance:
  - Runtime path never includes non-verified targets.
  - Feature flag allows controlled rollout and rollback.
- Tests:
  - Integration tests for connector list materialization by status.

#### PR 10 (Day 10): Coverage metrics and runbook/kill-switch

- Tickets: 11, 12
- Scope:
  - Add metrics endpoint(s) for verified/stale/failure/precision counters.
  - Add backfill runbook and emergency kill-switch procedure docs.
- Acceptance:
  - Metrics endpoint returns numerator/denominator for precision tracking.
  - Runbook includes canary strategy, rollback steps, and ownership handoff.
- Tests:
  - API tests for metrics payload shape and semantics.

## Merge gates per PR

1. Typecheck passes for affected workspaces.
2. New/changed unit and integration tests pass.
3. Any schema changes include migration tests and rollback validation.
4. No PR introduces runtime paths that bypass deterministic verification.

## Critical path and rollback points

- Critical path: PR 1 -> PR 2 -> PR 6 -> PR 9.
- Safe rollback points:
  - After PR 5 (adapters completed, runtime unchanged).
  - Before PR 9 cutover (registry data live but runtime still legacy-source based).

## Ownership recommendation

- Track A lead (coverage now): PR 3, PR 4, PR 5, PR 10.
- Track B lead (durability): PR 1, PR 2, PR 6, PR 7, PR 8, PR 9.
