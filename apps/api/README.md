# API App

Structured Node.js API for the Job Hunter modular monolith.

## Current scope
- Health endpoint at `GET /health`
- Auth/profile/preferences v1 endpoints:
	- `POST /v1/auth/register`
	- `POST /v1/auth/login`
	- `GET /v1/profile`
	- `PUT /v1/profile`
	- `GET /v1/preferences`
	- `PUT /v1/preferences`
- Domain service validation for preference constraints (salary and seniority ranges)
- In-memory repository adapter for local development
- Initial PostgreSQL migration for auth/profile/preferences tables in `migrations/0001_auth_profile_preferences.sql`
