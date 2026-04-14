# Worker App

Background process for asynchronous workflows.

## Current scope
- Scheduled source-ingestion orchestration:
	- lists configured connectors via API
	- runs connector sync for each source
	- runs canonical catalog rebuild after sync
	- dispatches high-fit alerts across users after successful rebuild cycles
	- retries failed API operations with exponential backoff
- Scheduled ATS target verification orchestration:
	- processes candidate batches through vendor verifier adapters
	- enforces per-target idempotency windows to prevent duplicate writes
	- caps concurrent verification execution and applies retry budget limits for transient outcomes
	- records immutable verification events through a worker client boundary (currently no-op until registry API wiring in PR7)
- Operational status surface:
	- `GET /health`
	- `GET /v1/worker/jobs/ingestion/status`
	- `POST /v1/worker/jobs/ingestion/run` (manual trigger)
	- `GET /v1/worker/jobs/ats-verification/status`
	- `POST /v1/worker/jobs/ats-verification/run` (manual trigger; returns `409 ats_verification_disabled` when disabled)

## Configuration

- `WORKER_PORT`: worker HTTP port (default: `3002`)
- `WORKER_API_BASE_URL`: API base URL used for orchestration calls (default: `http://localhost:3001`)
- `WORKER_SERVICE_EMAIL`: service identity email used for worker auth session bootstrap (default: `worker.ingestion@job-hunter.local`)
- `WORKER_INGESTION_INTERVAL_MS`: schedule interval for sync + rebuild cycle (default: `300000`)
- `WORKER_INGESTION_RUN_ON_START`: whether to run one cycle at startup (`true` default)
- `WORKER_SYNC_MAX_RECORDS`: `maxRecords` value passed to connector sync calls (default: `200`)
- `WORKER_REBUILD_MAX_SOURCE_JOBS`: `maxSourceJobs` value passed to canonical rebuild calls (default: `500`)
- `WORKER_RETRY_MAX_ATTEMPTS`: max attempts for retried worker API calls (default: `3`)
- `WORKER_RETRY_BACKOFF_MS`: base exponential backoff delay in ms (default: `1000`)
- `WORKER_ATS_VERIFICATION_ENABLED`: enable ATS verification scheduler/endpoints (default: `false`)
- `WORKER_ATS_VERIFICATION_INTERVAL_MS`: schedule interval for ATS verification cycle (default: `900000`)
- `WORKER_ATS_VERIFICATION_RUN_ON_START`: whether ATS verification runs once on startup (default: `false`)
- `WORKER_ATS_VERIFICATION_BATCH_LIMIT`: max candidates fetched per ATS verification cycle (default: `100`)
- `WORKER_ATS_VERIFICATION_CONCURRENCY_LIMIT`: max concurrent verifier executions per cycle (default: `4`)
- `WORKER_ATS_VERIFICATION_IDEMPOTENCY_WINDOW_MS`: skip verification if the target was attempted more recently than this window (default: `21600000`)
- `WORKER_ATS_VERIFICATION_RETRY_BUDGET_PER_TARGET`: retries allowed per target after initial transient pending result (default: `1`)
- `WORKER_ATS_VERIFICATION_RETRY_BACKOFF_MS`: base exponential backoff delay in ms for ATS verification retries (default: `1000`)

## Test coverage

- unit coverage for ingestion cycle health outcomes (healthy/degraded)
- unit coverage for high-fit dispatch-all aggregation/failure handling in ingestion cycles
- unit coverage for retry behavior and exponential backoff
- unit coverage for scheduler status tracking via manual trigger
- unit coverage for ATS verification cycle health/degraded/retry-budget outcomes
- unit coverage for ATS verification concurrency-cap enforcement
