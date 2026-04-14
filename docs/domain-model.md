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
A per-user workflow state for a job, such as discovered, shortlisted, reviewing, ready_to_apply, applied, interview, offer, rejected, or archived.

### Saved search
A per-user persisted feed query preset that stores recommendation, remote, source, sort, and text-query controls for fast discovery reuse.

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

## SavedSearch
Represents a user-defined feed query preset for repeatable discovery workflows.

Suggested fields:
- id
- user_id
- name
- query_text
- recommendation_filter          # high_fit | all | apply | review | skip | unscored
- remote_filter                  # aligned | any | remote | hybrid | onsite
- source_filter                  # any | connector source_name
- sort_mode                      # fit | recent | salary
- include_hidden
- created_at
- updated_at
- last_used_at

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

## CompanyRegistry
Represents canonical company identity used for ATS target lifecycle management.

Suggested fields:
- company_id
- canonical_name
- normalized_name
- website_domain
- source_provenance
- created_at
- updated_at

## AtsTargetRegistry
Represents verifiable ATS tenant identifiers linked to canonical companies.

Suggested fields:
- target_id
- company_id
- ats_vendor                 # greenhouse | lever | workable | ashby | smartrecruiters | recruitee
- identifier_type            # board_token | handle | subdomain | slug
- identifier_value
- verification_status        # verified | failed | pending | stale
- verification_confidence    # 0..1, nullable when pending
- verification_reason
- last_verified_at
- next_verification_at
- source_provenance
- created_at
- updated_at

## AtsTargetVerificationEvent
Represents one immutable verification attempt against an ATS target identifier.

Suggested fields:
- event_id
- target_id
- attempted_at
- outcome_status
- http_status
- error_code
- evidence_summary

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
- artifact_version
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
- explanation_metadata_json
- explanation_error_code
- scoring_version
- recommendation
- last_scored_at

## UserJobState
Stores user-specific interaction state.

Suggested fields:
- user_id
- canonical_job_id
- state                     # discovered | shortlisted | reviewing | ready_to_apply | applied | interview | offer | rejected | archived
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
- task_type
- title
- note
- due_at
- status
- linked_tracker_event_id
- created_at
- updated_at
- completed_at

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
- reminder_id                 # nullable for non-reminder notifications
- canonical_job_id
- match_artifact_version      # nullable; links high-fit alerts to score snapshots
- notification_type           # reminder_due | high_fit_alert
- delivery_channel
- message
- scheduled_for
- sent_at
- failed_at
- error_code
- status
- created_at
- updated_at

## Relationship summary

- one user has one profile and one preference record or a small set of versioned preference records
- one user can have many resumes
- one resume can have one or more structured extraction snapshots
- one source can have many source jobs
- many source jobs can map to one canonical job
- one company registry record can have many ATS target records
- one ATS target record belongs to one company registry record
- one ATS target record can have many verification event records
- one canonical job can have many requirements
- one user can have one score per canonical job per scoring version
- one user can have one state per canonical job
- one user can have many saved-search presets
- one user can have at most one active application record per canonical job in MVP workflows
- one user can have zero or more reminders per canonical job
- reminders may link to tracker transition events for traceable auto-created follow-ups
- one user can have zero or more notification logs tied to reminder tasks and score-triggered high-fit alerts

## Business rules

### Rule: source jobs are immutable records of fetched data
Do not overwrite the meaning of the original source job.
Store updated fetches as updates to the source record with timestamps and checksums.

### Rule: runtime ATS targets must be verifiably backed
Connector target materialization should come from verified ATS target registry records, not ad hoc identifier guesses.

### Rule: verification events are append-only
Each ATS verification attempt should persist as a separate immutable event for auditability and time-series quality tracking.

### Rule: canonical jobs are opinionated and user-facing
Canonical jobs should be stable enough to drive search, ranking, and UI.

### Rule: scoring is versioned
Any change to scoring logic should bump a scoring version so old scores can be re-evaluated and explained.

### Rule: explanation is part of the product
If a score cannot be explained from stored components, the implementation is incomplete.

### Rule: state and score are different concerns
A user can move job workflow state without changing the underlying score.

### Rule: discovery actions map to explicit workflow states
Discovery actions should remain deterministic and auditable (for example, hide maps to archived in tracker state history).

### Rule: saved searches are explicit query snapshots
Persist the exact filter shape used by discovery (query text, recommendation filter, remote filter, source filter, sort mode, include-hidden) so reruns are reproducible.

### Rule: high-fit alerts are threshold and state gated
Alert generation should be tied to explicit score thresholds and recommendation class, and should suppress terminal tracker states to avoid noisy follow-up notifications.

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
- discovered
- shortlisted
- reviewing
- ready_to_apply
- applied
- interview
- offer
- rejected
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


## AIExtractionRun
Tracks one extraction invocation for resume/job structured outputs.

Suggested fields:
- id
- user_id
- source_type                  # resume | job
- source_entity_id
- schema_version
- extractor_version
- model_version
- input_checksum
- output_json
- status                       # success | failed | partial
- failure_code
- created_at

## MatchExplanationSnapshot
Stores generated explanation text linked to deterministic score evidence.

Suggested fields:
- id
- user_id
- canonical_job_id
- scoring_version
- score_breakdown_json
- strengths_json
- gaps_json
- deal_breakers_json
- explanation_json
- generator_version
- model_version
- created_at

## AIEvalRun
Stores extraction/explanation eval results for regression tracking.

Suggested fields:
- id
- eval_suite_name
- eval_suite_version
- target_component             # extraction | explanation
- metrics_json
- pass_fail
- executed_at
