---
applyTo: "apps/api/**/*,apps/worker/**/*,packages/shared/**/*,packages/**/*.ts"
---

# Backend / Domain Instructions

- Keep controllers/routes thin; place canonicalization, deduplication, ranking, and workflow decisions in domain services.
- Keep source-specific mapping logic inside connector modules; do not pollute canonical models with one-off source fields.
- Preserve traceability: keep links from canonical jobs to source records and keep dedupe decisions explicit/reversible.
- Prefer deterministic, explainable scoring with named sub-scores, penalties, and explicit deal breakers.
- Use explicit types and boundary validation for API DTOs and ingestion payloads.
- Favor simple, maintainable MVP implementations over clever abstractions.
- Handle sensitive user career data cautiously; minimize logging of private content.
