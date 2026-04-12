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
- Resume upload/parsing v1 endpoints:
	- `POST /v1/resumes`
	- `GET /v1/resumes`
	- `GET /v1/resumes/:resumeId`
- Domain service validation for preference constraints (salary and seniority ranges)
- Resume parsing service with deterministic text extraction heuristics
- Object-storage abstraction with in-memory adapter for uploaded resume files
- In-memory repository adapter for local development
- PostgreSQL migrations:
	- `migrations/0001_auth_profile_preferences.sql`
	- `migrations/0002_resume_pipeline.sql`
