# Shared Package

Shared contracts and utilities for Job Hunter apps.

## Current scope
- shared enum-like constants for cross-app workflow states
- v1 runtime-validated contracts (Zod) for:
	- auth
	- user profile
	- user preferences
	- resume upload/metadata/structured profile
	- AI extraction, explainable match narratives, and score artifacts
	- connector health, sync requests, and source job summaries
	- canonical jobs, source mappings, and rebuild/list response payloads
	- feed/detail payloads and dedupe trace event contracts
	- tracker state transitions and transition-history payloads
	- reminder task creation/list/completion payloads
	- notification log listing and reminder dispatch payloads
	- application record creation/list/detail/update payloads
