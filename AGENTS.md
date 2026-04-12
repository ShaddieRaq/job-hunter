# AGENTS.md

This file is the shared instruction set for AI coding agents working in this repository.

## Product identity

This project is an individual-focused **job-hunting assistant**.

The product helps a user:
- discover relevant jobs from multiple official/public sources
- avoid duplicate and low-fit roles
- understand why a job is or is not a good fit
- stay organized through the application workflow
- prepare stronger application materials without removing the human from the process

This is **not** an autonomous mass auto-apply bot.

## MVP outcome

The MVP should make it meaningfully easier for a serious job seeker to:
1. find high-fit jobs faster
2. spend less time reading irrelevant postings
3. stay organized during the search
4. decide where to apply with more confidence
5. prepare applications with less repeated manual work

## Core product principles

- Prefer official/public integrations over scraping.
- Recommendations must be explainable.
- User trust matters more than flashy automation.
- Keep the user in control of applying.
- Build maintainable systems before clever systems.
- Use simple deterministic logic first, then add smarter ranking later.
- Treat resumes and career data as sensitive user data.

## Explicit MVP non-goals

Do not design or implement these as core MVP features unless the user explicitly changes scope:
- autonomous mass auto-apply
- unofficial scraping-heavy job discovery as the foundation
- recruiter CRM workflows
- employer-side multi-tenant tools
- social/community features
- advanced interview coaching
- arbitrary browser automation across career sites

## Recommended stack and repository shape

Assume this repository will use a TypeScript monorepo by default unless the existing code clearly says otherwise.

Recommended layout:
- `apps/web` - Next.js frontend
- `apps/api` - NestJS or structured Node backend API
- `apps/worker` - background jobs for ingestion, scoring, reminders, and notifications
- `packages/shared` - shared types, schemas, enums, utilities
- `packages/config` - shared tsconfig, eslint, prettier, env schema helpers
- `docs` - product and technical documentation

Preferred package manager: `pnpm`

## Architecture rules

### System shape
Build as a **modular monolith** first, with clear internal boundaries.

The backend should be modular, but do not split into microservices during MVP.
Use background workers for long-running and asynchronous processes.

### Core modules
The codebase should preserve these domain boundaries:
- identity and auth
- user profile and preferences
- resume/document management
- source connectors and ingestion
- canonical job catalog
- normalization and deduplication
- matching and ranking
- search and filtering
- application tracker
- reminders and notifications
- feedback and personalization

### Business logic placement
- Do not put ranking logic in UI components.
- Do not put deduplication logic directly in connectors.
- Do not let controllers or routes own domain decisions.
- Put canonicalization, ranking, and dedupe logic in domain services.
- Keep source-specific mapping code inside connector modules.

## Domain rules that agents must preserve

### Job ingestion and canonicalization
- A source job record is not the same thing as a canonical job.
- Preserve the raw source payload for debugging and replay.
- Normalize source records into a shared intermediate structure before canonicalization.
- Store source-specific metadata separately from the canonical job model.
- Never pollute the canonical job schema with one-off source-specific fields unless they become broadly useful.

### Deduplication
- Deduplication must be traceable and reversible.
- Never silently merge jobs without explicit confidence logic.
- Keep links from canonical jobs back to every source record.
- Favor false negatives over false positives when duplicate confidence is weak.

### Matching and ranking
- Match scoring must be explainable.
- Every score must be decomposable into named sub-scores and penalties.
- Hard deal breakers must be represented explicitly, not hidden inside a single opaque score.
- The user should be able to see strengths, gaps, and why a role was recommended.

### Workflow tracking
- Discovery and application tracking are different states.
- The system should support states such as discovered, shortlisted, reviewing, ready_to_apply, applied, interview, offer, rejected, archived.
- Changes to job/user/application state should be auditable.

## Data and privacy rules

- Treat resumes, salary preferences, work authorization, notes, and application history as sensitive data.
- Avoid logging full resume text or sensitive user notes.
- Prefer data minimization when calling external AI or enrichment services.
- Store documents in object storage, not inline in the relational database.
- Use signed access patterns for private files.

## Coding rules

- Use TypeScript throughout unless the repository already standardizes on something else.
- Prefer explicit types and runtime validation at boundaries.
- Shared contracts should live in `packages/shared`.
- Use Zod for external request/response or ingestion boundary validation.
- Favor small pure functions for ranking and normalization logic.
- Avoid hidden magic in helpers.
- Keep modules testable without requiring full app boot.

## API and schema rules

- Use versioned DTOs or schema contracts for public API routes.
- Use explicit enums for statuses and preference values.
- Add migrations for schema changes; do not rely on ad hoc table drift.
- Do not introduce fields without documenting them in `docs/domain-model.md`.

## Testing rules

Every meaningful change should include the smallest valuable test set that proves the behavior.

Required test thinking:
- unit tests for normalization, scoring, and rule logic
- integration tests for API endpoints and repository boundaries
- connector fixture tests for source parsing
- regression tests for bugs that were fixed

If a change affects ranking, dedupe, or status workflows, tests are required.

## Definition of done for agent-generated changes

Before considering a task complete, the agent should:
1. update or add the relevant documentation when behavior changes
2. run applicable tests or explain what could not be run
3. run lint/typecheck if available
4. summarize assumptions and tradeoffs in the final message
5. avoid claiming a feature is complete if migrations, tests, or env changes are missing

## Implementation priorities for MVP

Build in this order unless the user explicitly redirects:
1. repository and architecture skeleton
2. auth and profile/preferences
3. resume upload and parsing pipeline
4. connector framework and first connectors
5. canonical job catalog and dedupe v1
6. search/feed UI
7. explainable match scoring
8. tracker and reminders
9. resume/application support

## What agents should read first

Before making broad changes, read:
- `README.md`
- `docs/mvp-scope.md`
- `docs/architecture.md`
- `docs/domain-model.md`
- `docs/testing.md`
- `.github/copilot-instructions.md`
- any matching file-specific instructions in `.github/instructions/`

## How to behave when requirements are unclear

- Preserve the MVP boundaries above.
- Make the smallest reasonable assumption.
- Prefer a simple implementation that keeps future extension possible.
- Call out assumptions in comments or commit notes when they matter.
- Do not expand scope silently.
