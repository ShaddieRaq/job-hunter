# Domain Model

This document defines the core entities, relationships, and business rules for the Job Hunter product.

## Design intent

The model should support:
- multiple job sources
- one canonical job view
- source-specific traceability
- per-user matching and state
- explainable ranking
- lightweight application tracking

## Core concepts

### Source job
A job record fetched from a specific external source such as Greenhouse, Lever, Ashby, USAJOBS, or another official/public feed.

### Canonical job
The internal unified representation of one real-world opportunity, potentially linked to multiple source jobs.

### User job score
A per-user evaluation of how well a canonical job matches the user's goals, preferences, and constraints.

### User job state
A per-user interaction state for a job, such as hidden, saved, shortlisted, or archived.

### Application
A user-managed record of an actual application workflow for a canonical job.

## Entity list

## User
Represents the account owner.

Suggested fields:
- id
- email
- created_at
- timezone
- status

## UserProfile
Represents semi-stable user career facts.

Suggested fields:
- user_id
- current_title
- years_experience
- summary
- work_authorization
- sponsorship_required
- transition_notes
- created_at
- updated_at

## UserPreference
Represents explicit search and ranking preferences.

Suggested fields:
- user_id
- preferred_titles
- preferred_industries
- preferred_skills
- preferred_locations
- remote_preference
- target_seniority_min
- target_seniority_max
- salary_min
- salary_target
- deal_breakers
- hidden_companies
- hidden_titles
- stretch_preference_level
- notification_preferences

## Resume
Represents an uploaded resume or variant.

Suggested fields:
- id
- user_id
- file_uri
- original_filename
- content_type
- size_bytes
- checksum_sha256
- parsed_text
- parser_version
- parse_status
- uploaded_at
- parsed_at
- created_at
- updated_at

## ResumeStructuredProfile
Represents structured data extracted from a resume.

Suggested fields:
- resume_id
- normalized_skills
- experience_roles
- companies
- industries
- education
- certifications
- inferred_seniority
- extraction_confidence
- extracted_at

## JobSource
Represents a source connector configuration.

Suggested fields:
- id
- source_name
- source_type
- connector_version
- health_status
- last_sync_at

## SourceJob
Represents one fetched job posting from a source.

Suggested fields:
- id
- source_id
- source_job_id
- source_company_id
- fetch_url
- application_url
- raw_payload_json
- normalized_payload_json
- fetched_at
- first_seen_at
- last_seen_at
- source_status
- checksum

## CanonicalJob
Represents the internal unified job opportunity.

Suggested fields:
- id
- canonical_company_name
- canonical_title
- normalized_description
- employment_type
- seniority
- remote_type
- location_normalized
- salary_min
- salary_max
- salary_currency
- salary_period
- sponsorship_info
- posted_at
- deadline_at
- job_status
- first_seen_at
- last_seen_at
- canonicalization_version

## JobRequirement
Represents extracted requirements or preferred qualifications.

Suggested fields:
- id
- canonical_job_id
- requirement_type            # required | preferred
- requirement_category        # skill | years_experience | education | certification | domain | location | clearance | other
- normalized_text
- confidence

## JobSourceMapping
Links canonical jobs to one or more source jobs.

Suggested fields:
- canonical_job_id
- source_job_id
- is_primary
- mapping_confidence
- mapping_reason_codes

## DuplicateGroup
Represents duplicate clustering or merge evidence.

Suggested fields:
- id
- canonical_job_id_primary
- duplicate_confidence
- reason_codes
- reviewed_by_user_or_admin

## UserJobScore
Stores per-user scoring and explanation.

Suggested fields:
- user_id
- canonical_job_id
- overall_score
- title_score
- skill_score
- seniority_score
- location_score
- compensation_score
- domain_score
- requirement_score
- trajectory_score
- penalty_score
- confidence_band
- strengths_json
- gaps_json
- deal_breakers_json
- explanation_json
- scoring_version
- last_scored_at

## UserJobState
Stores user-specific interaction state.

Suggested fields:
- user_id
- canonical_job_id
- state                     # hidden | saved | shortlisted | reviewing | archived
- not_relevant_reason
- updated_at

## Application
Represents the user's application record for a job.

Suggested fields:
- id
- user_id
- canonical_job_id
- status                    # ready_to_apply | applied | interview | offer | rejected | archived
- applied_at
- application_url
- resume_id_used
- cover_letter_doc_uri
- notes
- created_at
- updated_at

## ReminderTask
Represents reminders and follow-up tasks.

Suggested fields:
- id
- user_id
- canonical_job_id
- application_id
- task_type
- due_at
- completed_at
- payload_json

## FeedbackEvent
Represents user feedback that can later improve ranking.

Suggested fields:
- id
- user_id
- canonical_job_id
- feedback_type             # thumbs_up | thumbs_down | more_like_this | less_like_this | hide_company | hide_title
- value
- created_at

## NotificationLog
Tracks notification generation and delivery.

Suggested fields:
- id
- user_id
- notification_type
- related_entity_type
- related_entity_id
- delivery_channel
- scheduled_for
- sent_at
- status

## Relationship summary

- one user has one profile and one preference record or a small set of versioned preference records
- one user can have many resumes
- one resume can have one or more structured extraction snapshots
- one source can have many source jobs
- many source jobs can map to one canonical job
- one canonical job can have many requirements
- one user can have one score per canonical job per scoring version
- one user can have one state per canonical job
- one user can have zero or more applications per canonical job, but MVP should generally assume one active application record
- reminders can point to a job, an application, or both

## Business rules

### Rule: source jobs are immutable records of fetched data
Do not overwrite the meaning of the original source job.
Store updated fetches as updates to the source record with timestamps and checksums.

### Rule: canonical jobs are opinionated and user-facing
Canonical jobs should be stable enough to drive search, ranking, and UI.

### Rule: scoring is versioned
Any change to scoring logic should bump a scoring version so old scores can be re-evaluated and explained.

### Rule: explanation is part of the product
If a score cannot be explained from stored components, the implementation is incomplete.

### Rule: state and score are different concerns
A user can hide or save a job without changing the underlying score.

### Rule: application records are user assertions
Even if a source job disappears, the user's application history remains.

### Rule: deal breakers should be explicit
Examples:
- sponsorship mismatch
- location mismatch
- salary below hard floor
- must-have certification missing

## Enumeration suggestions

### RemoteType
- remote
- hybrid
- onsite
- unknown

### JobStatus
- open
- closed
- unknown

### UserJobState
- none
- saved
- hidden
- shortlisted
- reviewing
- archived

### ApplicationStatus
- ready_to_apply
- applied
- interview
- offer
- rejected
- archived

## Data modeling cautions

- Do not collapse source and canonical jobs into one table too early.
- Do not store all explanation logic as freeform prose only.
- Do not rely on raw JSON payloads as the operational model.
- Do not hardcode source-specific enums into the canonical layer without normalization.
