# Worker App

Background process for asynchronous workflows.

## Current scope
- Scheduled source-ingestion orchestration:
	- lists configured connectors via API
	- runs connector sync for each source
	- runs canonical catalog rebuild after sync
	- dispatches high-fit alerts across users after successful rebuild cycles
	- retries failed API operations with exponential backoff
- Operational status surface:
	- `GET /health`
	- `GET /v1/worker/jobs/ingestion/status`
	- `POST /v1/worker/jobs/ingestion/run` (manual trigger)

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

## Test coverage

- unit coverage for ingestion cycle health outcomes (healthy/degraded)
- unit coverage for high-fit dispatch-all aggregation/failure handling in ingestion cycles
- unit coverage for retry behavior and exponential backoff
- unit coverage for scheduler status tracking via manual trigger
