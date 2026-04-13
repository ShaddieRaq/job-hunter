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
  - deterministic match scoring artifact creation/history
  - score-breakdown-driven match explanations
- API v1 route skeletons:
  - `POST /v1/ai/extract/resume`
  - `POST /v1/ai/extract/job`
  - `POST /v1/ai/explain-match`
- API v1 deterministic score artifact routes:
  - `POST /v1/ai/score-match`
  - `GET /v1/ai/score-match/:canonicalJobId`
  - `GET /v1/ai/score-match/:canonicalJobId/versions`
- Provider-backed AI orchestration in `apps/api/src/modules/ai`:
  - provider abstraction + deterministic fallback path
  - OpenAI adapter using strict `json_schema` structured output mode
  - explicit failure mode mapping for `invalid_json_schema`, `provider_timeout`, and `provider_refusal`
- Deterministic scoring engine for named sub-scores, penalties, and recommendation output with versioned artifact persistence.
- Fixture-driven AI eval harness baseline in `apps/api/test/evals` and `apps/api/test/fixtures`:
  - extraction precision/recall counters
  - explanation recommendation/factuality checks
  - threshold-enforced eval test for CI
- Unit + integration tests covering route wiring, provider handling, and eval baseline.

## Phase A progress snapshot

- A1 Structured extraction pipeline: ✅ done
  - Done: provider adapter interface, OpenAI structured-output adapter, metadata propagation, deterministic fallback, provider failure handling paths, and rollout controls for score explanation generation.
  - Remaining: none.
- A2 Explainable match narrative layer: ✅ done
  - Done: explanation generation runs over deterministic score outputs with evidence-only constraints, schema-bound output validation, versioned score/explanation snapshots exposed via API, score-artifact reads integrated into canonical feed/detail query models, and deterministic guardrail fallback for unsupported evidence.
  - Remaining: none.
- A3 Eval harness baseline: 🟨 in progress
  - Done: fixture corpus + extraction/explanation eval harness + threshold test with stricter explanation evidence coverage checks.
  - Remaining: wire eval command into repository CI workflow once pipeline definitions are in place.

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
