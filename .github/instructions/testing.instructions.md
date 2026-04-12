---
applyTo: "**/*test*/**,**/*.test.*,**/*.spec.*"
---

# Testing Instructions

- Add tests for meaningful logic changes; prioritize unit tests for normalization, scoring, dedupe, and workflow rules.
- Add integration tests for API endpoints, repository boundaries, and worker job handlers when behavior crosses modules.
- For ranking or dedupe changes, include deterministic and edge-case coverage with traceability assertions.
- Prefer focused assertions over giant snapshot/JSON assertions.
- Use stable fixtures for connector/source data, including messy and near-duplicate cases.
- Keep tests understandable and fast where possible, and document assumptions when full coverage is deferred.
