# Web App

Server-rendered discovery and application workflow UI for Job Hunter.

## Current scope
- Email sign-in/create-account flow backed by API auth routes
- Feed view backed by `GET /v1/feed`
- Job detail view backed by `GET /v1/feed/:canonicalJobId`
- Discovery tracker actions (save/shortlist/hide) backed by `POST /v1/tracker/jobs/:canonicalJobId/actions/:action`
- Saved-search create/apply/delete workflows backed by `GET/POST/DELETE /v1/saved-searches*`
- Feed high-fit alerts panel backed by sent notification reads via `GET /v1/notifications?status=sent`
- Application tracker list/detail views backed by `GET /v1/applications*`
- Application create/update actions backed by `POST /v1/applications` and `PUT /v1/applications/:applicationId`
- Structured material assistant rendering backed by `GET /v1/applications/:applicationId/material-guidance`
- Preference-aligned filtering and deterministic sorting controls
- Connector sync and canonical rebuild actions from the UI
- Resume/application material guidance checklists in job and application detail views
- Integration tests for sign-in, feed/detail tracker actions, saved-search and high-fit alert panel workflows, sync/rebuild actions, and application workflow routes

## Runtime configuration
- `WEB_PORT`: web server port (default `3000`)
- `API_BASE_URL`: API base URL (default `http://localhost:${API_PORT || 3001}`)

## Local usage
1. Start API (`apps/api`) so auth/feed endpoints are available.
2. Start web app (`corepack pnpm --filter @job-hunter/web dev`).
3. Open `http://localhost:3000` and sign in with a test email.
