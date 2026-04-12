# MVP Scope

This document defines what the MVP is supposed to do, what it is explicitly not supposed to do, and how to handle borderline feature ideas.

## Product objective

The MVP should make it meaningfully easier for an individual job seeker to:
- discover high-fit jobs faster
- avoid wasting time on low-fit or duplicate postings
- stay organized during the application process
- decide where to apply with more confidence
- prepare application materials with less repeated manual effort

## In scope for MVP

### User profile and preferences
- user account and basic identity
- resume upload
- structured profile extraction from resume
- editable job preferences including titles, location, remote preference, salary floor, work authorization, and deal breakers
- support for safe-fit versus stretch-role preference tuning

### Job ingestion
- official/public source connectors
- scheduled import jobs
- raw source payload storage
- normalization into a canonical job model
- source health visibility
- deduplication across sources

### Matching and ranking
- deterministic explainable scoring
- score breakdown by category
- deal breaker identification
- strengths and gaps
- confidence banding
- user feedback capture that can inform later ranking

### Search and discovery
- aggregated job feed
- filtering and sorting
- save/bookmark/hide/shortlist actions
- saved searches
- new high-fit job alerts or digests

### Job detail and decision support
- canonical job detail view
- extracted requirements and preferred qualifications
- source and application URL
- salary/location/work arrangement when available
- duplicate/merged source view
- fit explanation and application-worthiness cues

### Application tracking
- lightweight pipeline statuses
- notes
- reminders and follow-up tasks
- document association by application
- timestamps/history

### Resume and application support
- resume tailoring suggestions
- missing keyword or evidence suggestions
- relevant past experience bullet suggestions
- cover letter talking points
- application checklist

## Explicit non-goals for MVP

The following are intentionally out of scope unless there is a deliberate scope change:
- autonomous mass auto-apply
- scraping-heavy job ingestion foundation
- deep recruiter CRM workflows
- employer-side tools
- social networking/community features
- complex browser automation across arbitrary sites
- advanced interview coaching
- highly personalized machine-learned ranking that depends on large-scale behavioral data

## Borderline features guidance

### Allowed if simple and low-risk
- manual job save/import by URL
- basic company enrichment from public data
- export of tailored resume draft text
- closure detection for tracked jobs if source supports it

### Defer unless there is a strong reason
- semantic search engine
- custom ML ranking model
- SMS/push notifications
- extensive analytics dashboards
- multi-user/team collaboration
- mobile app

## MVP success criteria

The MVP is successful if a serious job seeker can:
1. create a profile and upload a resume
2. receive a useful personalized job feed from multiple sources
3. understand why jobs are recommended or filtered out
4. track shortlisted and applied jobs in one place
5. get reminders and digests that reduce missed opportunities
6. prepare application materials faster than they could manually

## Default product tradeoffs

When forced to choose:
- prefer trust over automation
- prefer explainability over opaque intelligence
- prefer fewer better matches over more noisy matches
- prefer maintainability over premature sophistication
