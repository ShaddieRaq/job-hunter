# AI Implementation Plan (Phase A Bootstrap)

Last updated: 2026-04-12.

This document turns the recommended AI roadmap into concrete implementation work the team can pick up immediately.

## Goals

1. Add deterministic, schema-validated extraction for resume and job text.
2. Keep deterministic match scoring as the source of truth.
3. Add AI explanation generation as a presentation layer over deterministic scoring outputs.
4. Create an eval harness baseline for extraction and explanation quality.

## Implemented bootstrap in this repository

- Shared v1 AI contracts in `packages/shared` for:
  - resume extraction
  - job extraction
  - score-breakdown-driven match explanations
- API v1 route skeletons:
  - `POST /v1/ai/extract/resume`
  - `POST /v1/ai/extract/job`
  - `POST /v1/ai/explain-match`
- Deterministic placeholder `AiService` implementation so frontend/backend teams can start integrating against stable contracts before external model wiring.
- Unit + integration tests covering route wiring and baseline behavior.

## Phase A task breakdown

### A1) Structured extraction pipeline

Deliverables:
- Replace deterministic placeholder extraction in `AiService` with provider-backed extraction via strict JSON schema.
- Add provider adapter interface and one concrete OpenAI adapter implementation.
- Persist extraction metadata (`schemaVersion`, `extractorVersion`, `modelVersion`, timestamps).
- Add failure mode handling (`invalid_json_schema`, `provider_timeout`, `provider_refusal`).

Definition of done:
- All extraction responses validate against shared schemas.
- Extraction error paths are deterministic and tested.

### A2) Explainable match narrative layer

Deliverables:
- Feed deterministic score components (`scoreBreakdown`, strengths/gaps/dealBreakers) into explanation prompt.
- Require explanation output to include recommendation + bounded bullets.
- Add guardrails to prevent unsupported claims (must only use supplied evidence fields).

Definition of done:
- Explanation route never changes deterministic score.
- Explanation output is concise, evidence-backed, and schema-valid.

### A3) Eval harness baseline

Deliverables:
- Fixture set of anonymized resume/job samples.
- Extraction eval script with field-level precision/recall counters.
- Explanation eval script with factuality and unsupported-claim checks.

Definition of done:
- Eval scripts run in CI and publish pass/fail summary.

## Interfaces to keep stable during implementation

- `@job-hunter/shared` AI schemas and exported types.
- API route paths and response envelopes (`contractVersion`).
- Deterministic score breakdown contract consumed by explanation route.

## Non-goals for this bootstrap

- No autonomous apply behavior.
- No autonomous dedupe merge decisions.
- No production semantic retrieval implementation yet.
