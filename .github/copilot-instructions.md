# Copilot Instructions

## Product and scope guardrails
- Build Job Hunter as an individual-focused job-hunting assistant, not an autonomous mass auto-apply bot.
- Keep changes within documented MVP scope; prefer small, maintainable increments over broad feature expansion.
- Preserve explainability and user trust for recommendation, ranking, and workflow decisions.

## Engineering defaults
- Use TypeScript and explicit types.
- Add runtime validation at external boundaries (API/connector inputs and outputs), preferring shared contracts.
- Keep module boundaries clear: UI for presentation, domain services for decisions, connectors for source-specific mapping.
- Treat resumes, preferences, notes, and application history as sensitive data; avoid unnecessary logging/exposure.

## Architecture and quality expectations
- Follow modular-monolith boundaries and avoid introducing microservices during MVP.
- Keep canonicalization, dedupe, and ranking logic traceable and explainable.
- For meaningful behavior changes, add the smallest valuable tests and run lint/typecheck/test where available.
- If requirements are unclear, make the smallest assumption and call it out.
