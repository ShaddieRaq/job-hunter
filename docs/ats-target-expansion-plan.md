# ATS Target Expansion Plan

Last updated: 2026-04-14  
Owner: team

## Problem statement

Job discovery coverage is constrained by ATS tenant identifier discovery (board tokens, company handles, subdomains, account slugs). For connectors like Greenhouse and Lever, there is no complete global directory of live public targets. A robust system must treat identifier discovery as an explicit lifecycle, not a one-time setup task.

## Outcome target

Build a high-confidence, continuously refreshed ATS target registry that supports broad discovery coverage while preserving explainability, deterministic verification, and user trust.

## Execution mode (do both)

Run two tracks in parallel so coverage improves immediately while foundation work lands:

1. Track A: Coverage now
- Expand verified targets for existing connectors and add new model-compatible ATS connectors.
- Goal: visible increase in job coverage within 1-2 release cycles.

2. Track B: Durability
- Implement registry, verification lifecycle, review queue, and freshness automation.
- Goal: reduce regression risk and keep coverage from decaying.

## Scope

In scope:
- ATS connectors that match the current connector model (tenant identifier + public endpoint + deterministic mapping)
- Candidate generation, deterministic verification, registry storage, refresh lifecycle, and operator/user review workflows
- Coverage metrics and quality gates

Out of scope:
- Claims of complete global ATS coverage
- Browser automation-heavy scraping as the foundational strategy
- Opaque ML-only acceptance of identifiers without deterministic checks

## Guiding principles

1. Verification over guessing: AI proposes candidates; deterministic probes decide acceptance.
2. Explainability first: every accepted target stores provenance and last verification evidence.
3. Safety over volume: prefer false negatives to false positives in automated acceptance.
4. Continuous freshness: treat target validity as expiring state with scheduled re-checks.
5. User control: allow user/org target preferences and explicit include/exclude rules.

## High-level architecture

1. Company seed intake
- Sources: curated public company datasets, user-provided target lists, existing internal companies, model-assisted expansion candidates

2. Candidate generation
- Deterministic slug/handle generation rules by ATS
- Optional AI ranking for candidate priority

3. Verification workers
- ATS-specific HTTP probes with deterministic pass/fail logic
- Store status code, probe timestamp, and response diagnostics

4. Target registry
- Canonical company record + ATS target records (identifier, status, confidence, source, freshness)

5. Connector registration
- Build active connector instances from verified targets only
- Keep unsupported/unverified targets out of sync runtime

6. Governance surfaces
- Review queue for low-confidence or ambiguous matches
- Audit history for accepted/rejected targets

## Data model additions (planned)

1. `company_registry`
- `company_id`
- `canonical_name`
- `normalized_name`
- `website_domain`
- `source_provenance`
- `created_at`, `updated_at`

2. `ats_target_registry`
- `target_id`
- `company_id`
- `ats_vendor` (enum)
- `identifier_type` (board_token, handle, subdomain, slug)
- `identifier_value`
- `verification_status` (verified, failed, pending, stale)
- `verification_confidence` (0-1)
- `verification_reason`
- `last_verified_at`
- `next_verification_at`
- `source_provenance`
- `created_at`, `updated_at`

3. `ats_target_verification_events`
- `event_id`
- `target_id`
- `attempted_at`
- `outcome_status`
- `http_status`
- `error_code`
- `evidence_summary`

## Milestones

### Milestone 0: 30-day coverage quick wins (parallel with Milestone 1)

Deliverables:
- Curated target packs for Greenhouse/Lever verified through deterministic probes
- Source health dashboard slices for verified target counts and failure causes
- Connector backfill runbook for safe large-batch sync/rebuild execution

Acceptance criteria:
- +300 verified active targets across currently supported ATS vendors
- >=95% verification precision for newly accepted targets over 14 days
- Daily sync pipeline remains operational without manual hotfixes

### Milestone 1: Registry foundation

Deliverables:
- DB migrations for company/target/event registry tables
- API module for target registry CRUD and reads
- Deterministic verification service abstraction (vendor-specific adapters)

Acceptance criteria:
- Can insert/read/update targets
- Can run verification and persist event history
- Can list verified targets by vendor

### Milestone 2: Greenhouse and Lever lifecycle hardening

Deliverables:
- Use verified registry targets to materialize runtime connector list
- Scheduled re-verification and stale-target demotion
- Failure budget handling (rate limits, transient outages)

Acceptance criteria:
- Connectors are created only from `verified` targets
- Stale targets are auto-rechecked and status transitions are auditable
- Sync pipeline remains stable under partial target failures

### Milestone 3: Human review workflow

Deliverables:
- Review queue API for low-confidence targets
- Approve/reject endpoints and notes
- Conflict handling for duplicate identifier claims

Acceptance criteria:
- Ambiguous candidates are not auto-accepted
- Reviewer actions are logged and reversible

### Milestone 4: Next ATS connectors (model-compatible)

Target order:
1. Workable
2. Ashby
3. SmartRecruiters
4. Recruitee

Deliverables:
- Connector adapters + fixtures + unit tests
- Registry verification adapters per vendor

Acceptance criteria:
- Each connector has deterministic mapping tests
- Verification adapter pass/fail rules are documented and tested

### Milestone 5: AI-assisted prioritization

Deliverables:
- Candidate scoring model for ranking verification attempts
- Feature logging for precision/recall analysis

Acceptance criteria:
- AI is advisory only; deterministic verifier remains gatekeeper
- Quality metrics show better verification yield than baseline rules-only

### Milestone 6: Coverage observability and operations

Deliverables:
- Coverage dashboard (verified targets, stale targets, failure rates)
- Operational runbooks for outages and schema drift

Acceptance criteria:
- Team can track coverage by vendor/region/industry
- Mean time to recover from target invalidation is measurable

## Success metrics

1. Verified active targets by vendor
2. Verification precision (accepted targets still valid after N days)
3. Stale target rate and median time-to-refresh
4. Sync health across verified targets (success, degraded, failed)
5. Coverage growth trajectory over 30/60/90 days

## Risk register

1. Upstream API shape changes
- Mitigation: contract tests and adapter versioning

2. Rate limits or anti-abuse controls
- Mitigation: backoff, jitter, capped concurrency, retry budgets

3. False positive identifier acceptance
- Mitigation: strict verifier thresholds, review queue, reversible state transitions

4. Overfitting to one vendor
- Mitigation: vendor-agnostic registry model and adapter interface

## Governance and decision checkpoints

1. Any non-deterministic acceptance rule requires explicit owner approval.
2. Any expansion beyond official/public sources requires documented rationale.
3. Any compromise affecting trust or explainability must be pre-approved and recorded in roadmap notes.

## Immediate next actions (execution order)

1. Execute Milestone 0 and Milestone 1 in parallel.
2. Implement schema + registry module, then rewire Greenhouse/Lever runtime to registry-backed verified targets.
3. Ship a first verified target pack and run controlled sync backfill.
4. Add review queue endpoints and operator audit surfaces.
5. Add Workable connector + verification adapter as the first new vendor.
