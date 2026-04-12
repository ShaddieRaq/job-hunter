# Architecture

This document describes the intended architecture for the Job Hunter MVP and realistic v1.

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
1. frontend requests job feed or saved search
2. API queries canonical jobs plus user-specific score/state
3. results are filtered and sorted
4. explanation snippets are returned with the job card

### 4. Application workflow flow
1. user saves or shortlists a job
2. user moves it through tracker states
3. notes, reminders, and documents are attached
4. digests and follow-up reminders are generated

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
