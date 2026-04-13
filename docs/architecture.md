# Architecture

This document describes the intended architecture for the Job Hunter MVP and realistic v1.

## Implementation status

As of 2026-04-13, Steps 2 through 9 are implemented, plus MVP remediation slices 1 through 5 and post-validation high-fit delivery iterations:
- shared v1 contracts for auth, profile, and preferences
- API v1 routes for auth/profile/preferences
- domain service validation for preference constraints
- initial SQL migration for auth/profile/preferences persistence tables
- shared v1 contracts for resume upload, metadata, and structured profile output
- shared v1 contracts for AI extraction, deterministic match scoring artifacts, and explainable match reasoning payloads
- API v1 routes for resume upload/list/detail
- API v1 AI routes for resume extraction, job extraction, deterministic score artifact generation, and match explanation
- AI provider abstraction with OpenAI structured-output adapter and deterministic fallback handling
- explicit provider failure-mode mapping (`invalid_json_schema`, `provider_timeout`, `provider_refusal`, `provider_http_error`)
- score explanation rollout controls with deterministic guardrail fallback for unsupported explanation evidence
- deterministic match scoring engine with named sub-scores, explicit penalties/deal-breakers, and recommendation classification
- versioned per-user score/explanation artifact snapshots with latest/history retrieval routes
- fixture-driven extraction/explanation eval harness baseline with threshold-enforced tests
- object-storage abstraction with in-memory adapter for uploaded resume files
- deterministic text resume parser wired into the resume upload pipeline
- SQL migration for resumes and structured profile extraction snapshots
- shared v1 connector contracts for source health + source job ingestion payloads
- API v1 connector routes for listing connector health, triggering source sync, and listing ingested source jobs
- Greenhouse public board connector adapter with source-job normalization and in-memory ingestion persistence
- SQL migration for connector/source job persistence scaffolding
- shared v1 canonical job contracts for catalog summaries, source mappings, and rebuild/list/detail payloads
- shared v1 notification contracts for reminder-due delivery logs and high-fit dispatch responses
- shared v1 application contracts for create/list/detail/update payloads
- API v1 canonical catalog routes for rebuilding and retrieving deduped canonical jobs
- deterministic canonicalization/dedupe domain service with conservative matching heuristics and mapping reason codes
- SQL migration scaffold for canonical jobs and source mapping traceability tables
- PostgreSQL repository adapters for source connector ingestion state and canonical catalog persistence (env-configurable with in-memory defaults)
- canonical dedupe trace-event persistence and retrieval for reversible audit trails
- feed/detail query paths backed by canonical catalog with latest score artifact joins
- server-rendered web feed/detail experience with auth session handling, preference-aligned filtering/sorting, and explicit sync/rebuild controls
- server-rendered web feed now includes sent high-fit alert visibility with direct job-detail deep links
- tracker state transition API slice with explicit transition rules and auditable transition-event history
- reminder task API slice with authenticated create/list/detail/complete routes and completion lifecycle
- notification API slice with authenticated log listing and due-reminder dispatch workflows
- high-fit alert dispatch workflow keyed to recommendation thresholds and tracker-state eligibility, including authenticated dispatch-all cadence support for worker orchestration
- application API slice with authenticated create/list/detail/update workflows and canonical/resume validation
- tracker transition observer linkage for auto-created follow-up reminders on key workflow states
- authenticated tracker discovery-action endpoint semantics for save/shortlist/hide workflows
- worker scheduler orchestration for scheduled connector sync + canonical rebuild cycles with retry/backoff, followed by high-fit dispatch-all cadence and health/status endpoints
- explicit AI provider-boundary payload minimization/redaction guardrails with upstream provider error-detail minimization
- saved-search persistence contracts plus authenticated API create/list/get/delete routes and web feed save/apply/delete controls
- SQL migration for versioned match score artifacts
- SQL migrations for tracker state history and reminder task lifecycle
- SQL migration for notification log workflow scaffolding
- SQL migration for application record workflow scaffolding

## Guiding approach

Build the MVP as a **modular monolith** with background workers.

This gives:
- fast iteration for a small team
- simpler deployment and debugging
- enough modularity to grow cleanly
- lower operational overhead than microservices

## High-level system

### Frontend
- web application for onboarding, discovery, job detail, tracker, reminders, and document support
- recommended stack: Next.js + TypeScript

### API backend
- account/profile/preferences APIs
- job feed and search APIs
- job detail and explanation APIs
- application tracker APIs
- notification preferences APIs
- admin and support endpoints

### Worker process
- source sync jobs
- normalization and canonicalization jobs
- deduplication jobs
- scoring jobs
- reminder and digest jobs
- source health jobs
- resume extraction or enrichment jobs

### Core infrastructure
- PostgreSQL as system of record
- Redis for queueing/caching
- object storage for resumes and generated docs
- email provider for digests and reminders

## Target module boundaries

### Identity and auth
Handles user accounts, sessions, and access control.

### Profile and preferences
Stores and updates job targets, work constraints, salary expectations, and ranking preferences.

### Resume/document management
Handles upload, storage, document metadata, and selected resume versions.

### Resume extraction
Converts resume text into structured experience, skill, and preference signals.

### Connector framework
Defines a common interface for official/public job sources.

### Ingestion orchestration
Schedules syncs, stores raw records, retries failures, and triggers downstream work.

### Canonical job catalog
Owns the internal unified job schema.

### Normalization and deduplication
Maps source records into canonical fields and groups duplicate jobs.

### Matching and ranking
Generates explainable user-specific match scores.

### AI orchestration
Owns provider-facing extraction and explanation orchestration while preserving deterministic domain decisions.

### Search and discovery
Serves job feed queries, filters, sorting, and saved searches.

### Tracker
Owns job state transitions, notes, reminders, and activity history.

### Notifications
Creates digests, follow-up reminders, and tracked-role alerts.

### Feedback and personalization
Stores like/dislike/hide signals and later tuning inputs.

## Data flow

### 1. User setup flow
1. user signs up
2. uploads resume
3. system extracts structured profile signals
4. user reviews preferences and constraints
5. initial scoring is enabled once jobs exist

### 2. Job ingestion flow
1. connector fetches records from source
2. raw source payload is stored
3. source record is normalized into intermediate structure
4. candidate canonical job is created or updated
5. dedupe rules attempt source-to-canonical linking
6. downstream scoring jobs are queued
7. notification eligibility is evaluated for affected users

### 3. Discovery flow
1. frontend requests job feed using direct filters or a saved-search preset
2. API queries canonical jobs plus user-specific score/state
3. results are filtered and sorted, with high-fit-first recommendation filtering applied by default when no explicit recommendation filter is provided
4. explanation snippets are returned with the job card and sent high-fit alerts are surfaced as jump-to-job notifications

### 4. Application workflow flow
1. user saves, shortlists, or hides a job from discovery
2. user moves it through tracker states
3. notes, reminders, and documents are attached
4. digests and follow-up reminders are generated

### 5. High-fit alert flow
1. worker ingestion cadence triggers high-fit dispatch-all after successful canonical rebuild cycles
2. notification dispatch scans latest scored jobs for each user
3. recommendation-threshold eligibility checks select high-fit jobs (apply recommendation, minimum overall score, no deal breakers)
4. tracker-state gating suppresses alerts for terminal workflow states
5. idempotent notification records are queued and dispatched as in-app alerts

## Storage strategy

### PostgreSQL
Use for:
- users and preferences
- canonical jobs
- source job records
- duplicate mappings
- user job scores
- tracker state
- reminders and notification logs

### Object storage
Use for:
- original resumes
- resume variants
- exported tailored document drafts

### Redis
Use for:
- job queues
- rate-limited work scheduling
- short-lived caching

## Search architecture

### MVP
Use PostgreSQL full-text search plus trigram indexes and structured filter columns.

Reason:
- simpler to operate
- enough for early scale
- strong support for keyword + filters

### Later
Introduce OpenSearch or similar only if semantic search, faceting scale, or query complexity justifies the extra system.

## Key architectural rules

- Preserve raw source records.
- Keep connector code source-specific and isolated.
- Keep canonical job schema stable and opinionated.
- Re-run normalization and scoring through jobs, not ad hoc scripts in application code.
- Make ranking explainable and versioned.
- Favor idempotent ingestion and scoring tasks.

## Failure handling expectations

### Connector failures
- isolate by source
- retry with backoff
- expose health metrics
- never block the whole pipeline because one source failed

### Data quality failures
- keep malformed payloads for inspection
- attach normalization warnings where needed
- avoid dropping records silently

### Ranking failures
- degrade gracefully to unranked or partially ranked feeds
- never present broken explanations as truth

## Suggested repo structure

```text
apps/
  web/
  api/
  worker/
packages/
  shared/
  config/
  ui/              # optional later
docs/
.github/
```

## Suggested future extraction points

Only split into separate services after real operational pressure exists.
Likely later split candidates:
- ingestion service
- scoring service
- notification service

For MVP, keep them inside one backend codebase plus worker.
