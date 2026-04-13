# Web App

Server-rendered Step 6 discovery UI for Job Hunter.

## Current scope
- Email sign-in/create-account flow backed by API auth routes
- Feed view backed by `GET /v1/feed`
- Job detail view backed by `GET /v1/feed/:canonicalJobId`
- Preference-aligned filtering and deterministic sorting controls
- Connector sync and canonical rebuild actions from the UI
- Integration tests for sign-in, feed, detail, and action redirects

## Runtime configuration
- `WEB_PORT`: web server port (default `3000`)
- `API_BASE_URL`: API base URL (default `http://localhost:${API_PORT || 3001}`)

## Local usage
1. Start API (`apps/api`) so auth/feed endpoints are available.
2. Start web app (`pnpm --filter @job-hunter/web dev`).
3. Open `http://localhost:3000` and sign in with a test email.
