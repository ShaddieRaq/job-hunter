# Manual End-to-End Test Plan

Last updated: 2026-04-13
Owner: QA / Manual testing

## Purpose

This plan gives a repeatable manual E2E flow for the current MVP implementation.
It focuses on user-visible behavior, route wiring, and workflow correctness across:
- auth and session flow
- feed browsing and detail views
- sync/rebuild actions
- application tracking workflow
- material assistant guidance rendering

## Scope

Included:
- web app E2E via browser
- key API-backed behavior that is surfaced in the web UI

Out of scope for this plan:
- deep API-only module validation (tracker/reminders/notifications direct route testing)
- load/performance testing
- security penetration testing

## Preconditions

1. Start services:
   - API: corepack pnpm --filter @job-hunter/api dev
   - Web: corepack pnpm --filter @job-hunter/web dev
2. Confirm health endpoints:
   - http://localhost:3001/health returns api ok
   - http://localhost:3000/health returns web ok
3. Use only one browser host for the whole session.
   - Prefer http://localhost:3000
   - Do not switch between localhost and 127.0.0.1 mid-run
4. Use a clean browser profile or private window.

## Test Data

Use unique emails each run:
- qa.e2e.01+<timestamp>@test.dev
- qa.e2e.02+<timestamp>@test.dev

Sample text inputs:
- Notes field: "Follow-up after recruiter call"
- Application URL: "https://jobs.example.com/apply/abc123"

## Execution Order

Run in this sequence to reduce setup churn:
1. Auth/session
2. Feed and detail
3. Sync/rebuild actions
4. Application workflow
5. Material assistant checks
6. Negative/error checks

## Test Cases

### Auth and Session

#### E2E-AUTH-001 Create account (new email)
Steps:
1. Open http://localhost:3000
2. Enter a brand-new email
3. Click Create account

Expected:
1. Redirect to feed page
2. Notice indicates account creation or sign-in success
3. Header shows signed-in user context

#### E2E-AUTH-002 Sign in (existing email)
Steps:
1. Sign out
2. Enter previously created email
3. Click Sign in

Expected:
1. Redirect to feed page
2. No auth error displayed

#### E2E-AUTH-003 Sign out
Steps:
1. Click Sign out from feed or detail page

Expected:
1. Return to sign-in page
2. Attempting protected pages redirects back to auth flow

#### E2E-AUTH-004 Regression: submit mode handling
Steps:
1. On sign-in page, click Create account once for a new email

Expected:
1. No "No account found for this email" error for new email
2. Account creation path is used (not login fallback)

### Feed and Detail

#### E2E-FEED-001 Feed renders after auth
Steps:
1. Complete account creation or sign in

Expected:
1. Feed cards render
2. Header shows remote preference context
3. Summary strip shows visible vs total count

#### E2E-FEED-002 Filter and sorting controls
Steps:
1. Use search query (title/company/skill)
2. Change recommendation filter
3. Change remote filter
4. Change sort (fit, recent, salary)

Expected:
1. Feed list updates after each filter apply
2. No server error flash appears

#### E2E-FEED-003 Include hidden toggle
Steps:
1. Load feed with default settings
2. Enable Include hidden companies and titles

Expected:
1. Hidden roles appear only when toggle is enabled

#### E2E-FEED-004 Job detail page
Steps:
1. Open a job from feed card

Expected:
1. Score rationale section is visible
2. Source mappings and dedupe trace events are visible
3. Back link returns to feed with preserved context

### Sync and Rebuild Actions

#### E2E-ACTION-001 Sync source
Steps:
1. From feed header, click Sync source

Expected:
1. Redirect back to feed
2. Success notice for sync completion

#### E2E-ACTION-002 Rebuild catalog
Steps:
1. From feed header, click Rebuild catalog

Expected:
1. Redirect back to feed
2. Success notice for rebuild completion

### Application Workflow

#### E2E-APP-001 Create application from feed card
Steps:
1. On a job card without tracking, click Track application

Expected:
1. Redirect to application detail page
2. Notice indicates application was created
3. Application status defaults to ready_to_apply unless changed in form

#### E2E-APP-002 Duplicate application handling
Steps:
1. Return to same job and attempt to create again

Expected:
1. App redirects to existing application (or shows already exists notice)
2. No duplicate record is created for same user + canonical job

#### E2E-APP-003 Quick status update from feed/app list
Steps:
1. Change application status using inline update control

Expected:
1. Redirect back with application_updated notice
2. Updated status appears immediately

#### E2E-APP-004 Applications list page
Steps:
1. Open Applications from feed header
2. Filter by status

Expected:
1. List shows only matching statuses
2. Open application and open job detail links work

#### E2E-APP-005 Application detail update form
Steps:
1. Open an application detail page
2. Update status, application URL, and notes
3. Save updates

Expected:
1. Update succeeds with notice
2. Fields persist on reload
3. Applied-at metadata updates when status moves to applied/interview/offer flow

### Material Assistant

#### E2E-MAT-001 Structured guidance is visible
Steps:
1. Open application detail for a tracked job

Expected:
1. Material assistant section appears
2. Checklist is populated
3. Keyword suggestions are populated
4. Resume bullet prompts are populated
5. Cover letter talking points are populated

#### E2E-MAT-002 Job detail guidance integration
Steps:
1. Open job detail for a job with an existing application

Expected:
1. Application workflow panel is visible
2. Material assistant content appears (structured guidance when available)

### Negative and Error Checks

#### E2E-NEG-001 Invalid auth session
Steps:
1. Sign in
2. Clear site cookies
3. Refresh protected page

Expected:
1. Redirect to sign-in page with auth-related error messaging

#### E2E-NEG-002 Invalid application URL path
Steps:
1. Navigate to /applications/not-a-uuid

Expected:
1. Invalid application id page or equivalent graceful error response

#### E2E-NEG-003 Invalid job detail path
Steps:
1. Navigate to /jobs/not-a-uuid

Expected:
1. Invalid job id page or equivalent graceful error response

## Pass/Fail Rule

A run is PASS when:
1. All critical cases pass:
   - E2E-AUTH-001
   - E2E-FEED-001
   - E2E-APP-001
   - E2E-MAT-001
2. No blocker defects in auth, feed load, application create/update, or material assistant rendering

## Defect Reporting Template

For each failure, capture:
1. Test case ID
2. Environment (browser + OS)
3. Exact URL
4. Repro steps
5. Expected vs actual result
6. Screenshot/video
7. Console/network error snippets if present
