-- Step 5: dedupe trace events for canonical-source mapping audits.
-- PostgreSQL migration for reversible dedupe event history.

CREATE TABLE IF NOT EXISTS canonical_dedupe_trace_events (
  event_id UUID PRIMARY KEY,
  canonical_job_id UUID NOT NULL REFERENCES canonical_jobs(canonical_job_id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  source_job_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  mapping_confidence NUMERIC(4, 3) NOT NULL,
  mapping_reason_codes TEXT[] NOT NULL DEFAULT '{}',
  reversible BOOLEAN NOT NULL DEFAULT TRUE,
  dedupe_version TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT canonical_dedupe_trace_events_event_type_check
    CHECK (event_type IN ('linked_to_canonical', 'unlinked_from_canonical')),
  CONSTRAINT canonical_dedupe_trace_events_confidence_check
    CHECK (mapping_confidence >= 0 AND mapping_confidence <= 1)
);

CREATE INDEX IF NOT EXISTS canonical_dedupe_trace_events_job_idx
  ON canonical_dedupe_trace_events (canonical_job_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS canonical_dedupe_trace_events_source_idx
  ON canonical_dedupe_trace_events (source_name, source_job_id, occurred_at DESC);
