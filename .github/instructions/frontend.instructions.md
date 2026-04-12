---
applyTo: "apps/web/**/*,packages/ui/**/*,**/*.tsx"
---

# Frontend Instructions

- Keep UI components focused on rendering and interaction; do not implement ranking, dedupe, or canonicalization logic in UI.
- Present recommendation rationale clearly (strengths, gaps, deal breakers) without opaque scoring behavior.
- Keep user actions in control of applying; do not add autonomous auto-apply workflows.
- Use shared types/contracts from shared packages and keep state transitions explicit.
- Prefer simple, accessible components and predictable state management suitable for MVP iteration.
- Avoid exposing sensitive resume/profile/notes data unnecessarily in client logs or telemetry.
