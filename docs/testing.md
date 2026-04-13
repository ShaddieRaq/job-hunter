# Testing Strategy

This document defines the testing expectations for the Job Hunter MVP.

## Current coverage snapshot

Steps 2 through 7 (auth/profile/preferences, resume pipeline, connector/canonical services, search/feed UI, and explainable scoring hardening) include:
- unit tests for preference rule validation and normalization behavior
- integration tests for auth/profile/preferences API request boundaries and happy paths
- unit tests for resume upload service parse behavior and error paths
- integration tests for resume upload/list/detail route boundaries and unsupported-format handling
- AI unit tests for deterministic provider behavior, OpenAI adapter schema parsing, and provider fallback/error handling
- AI deterministic scoring unit tests for sub-score generation and deal-breaker edge cases
- AI integration tests for `/v1/ai/*` route boundaries plus explicit provider failure mode responses
- AI integration tests for score artifact create/latest/history route behavior
- AI service/integration tests for explanation rollout controls and unsupported-evidence guardrail fallback
- fixture-driven AI eval harness tests for extraction precision/recall and explanation unsupported-claim checks
- fixture-driven connector normalization tests for Greenhouse source payloads, including malformed-record handling
- connector service idempotency tests for inserted/updated/unchanged import behavior
- connector route integration tests for authenticated sync and ingested source-job listing
- canonicalization/dedupe unit tests for conservative clustering, traceable mappings, and rebuild idempotency
- canonical catalog route integration tests for authenticated rebuild/list/detail boundaries
- canonical dedupe trace-event tests for link/unlink event history behavior
- feed/detail route integration tests for score-joined query payloads
- web integration tests for Step 6 sign-in, feed filtering, detail rendering, and sync/rebuild action redirects

Step 8 tracker/reminder/notification slices currently include:
- tracker service unit tests for transition-rule enforcement, canonical existence checks, transition observer hooks, and transition audit history behavior
- reminder service unit tests for creation, completion lifecycle, dedupe-by-tracker-event behavior, and unsupported-state handling
- notification service unit tests for due-reminder queue/send dispatch semantics and idempotency
- tracker route integration tests for authenticated list/detail/transition/history boundaries and invalid-transition handling
- reminder route integration tests for authenticated create/list/detail/complete boundaries, validation/auth errors, and tracker-transition side-effect coverage
- notification route integration tests for authenticated dispatch/log-list boundaries and validation/auth errors

## Testing goals

The product handles messy source data, user-sensitive career data, and decision-support logic.
Testing must protect:
- ingestion reliability
- normalization correctness
- duplicate handling
- score explainability
- tracker state correctness
- reminder and notification behavior

## Quality priorities

The highest-risk logic is:
1. source ingestion and parsing
2. canonicalization and deduplication
3. match scoring and explanation generation
4. status transitions in the application workflow
5. reminder and digest logic

## Test pyramid

### Unit tests
Use for:
- normalization helpers
- salary/location/title parsing
- duplicate heuristics
- scoring functions
- explanation builders
- tracker rule helpers

These should be fast and numerous.

### Integration tests
Use for:
- API routes
- persistence/repository logic
- queue job handlers
- connector fetch-to-normalized pipeline with fixtures
- notification generation against seeded data

### End-to-end tests
Use sparingly for:
- onboarding flow
- upload resume and review profile
- browse top matches
- save/shortlist/apply workflow
- reminder or notification settings flow

## Required test expectations by feature type

### New connector
Required:
- fixture-based parsing tests
- normalization mapping tests
- failure case tests for incomplete records
- idempotent import test if applicable

### Ranking or explanation change
Required:
- deterministic scoring tests
- edge case tests for deal breakers
- regression tests for explanation outputs
- versioning expectations when score model changes


### AI extraction or explanation change
Required:
- schema validation tests for input/output contracts
- deterministic fallback behavior tests when provider output is invalid
- fixture-based eval tests for factuality and unsupported-claim rate
- regression tests for recommendation class changes (`apply`, `review`, `skip`)

### Deduplication change
Required:
- positive duplicate match tests
- negative duplicate match tests
- confidence threshold tests
- traceability tests for source-to-canonical links

### Tracker workflow change
Required:
- state transition tests
- reminder side-effect tests
- audit/history tests if history is stored

### UI feature change
Required:
- component tests for critical behavior
- at least one happy-path integration or end-to-end test for major user-facing flows

## Suggested test folders

```text
apps/api/test/unit
apps/api/test/integration
apps/worker/test
apps/web/test
fixtures/connectors
fixtures/scoring
fixtures/dedupe
```

## Test data guidance

- Prefer stable fixtures over ad hoc inline mock blobs.
- Keep one fixture set per connector.
- Include messy, incomplete, and ambiguous job examples.
- Include at least one real-looking duplicate case and one deceptive near-duplicate case.
- Include resume/profile fixtures for safe-fit and career-transition users.

## Manual QA checklist for MVP

### Onboarding
- upload a resume
- review extracted profile
- edit preferences
- verify saved settings persist

### Job feed
- filter by remote/location/salary/source
- hide a job
- save a job
- confirm hidden jobs do not keep resurfacing incorrectly

### Job detail
- verify fit explanation is present
- verify gaps and deal breakers are coherent
- verify duplicate source view works

### Tracker
- move a job from discovered to shortlisted to applied
- attach notes and reminders
- verify history/timestamps update

### Notifications
- verify daily/weekly digest preferences
- verify high-fit alert suppression rules
- verify follow-up reminder creation and completion

## Definition of done from a testing perspective

A change is not done unless:
- the core behavior is covered by tests appropriate to its risk
- lint/typecheck pass if configured
- known assumptions are documented
- any new env or migration requirement is documented
- the developer can explain how they manually verified the change if end-to-end automation is absent

## Anti-patterns to avoid

- relying only on manual testing for ranking logic
- asserting huge JSON blobs when targeted assertions would be clearer
- testing through UI for behavior that belongs in pure domain functions
- shipping connector changes without fixture coverage
- changing score logic without updating score explanation tests
