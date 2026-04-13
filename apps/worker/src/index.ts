const intervalMs = Number(process.env.WORKER_HEARTBEAT_MS ?? 15000);

console.log('Worker started. Background jobs are not implemented yet.');

setInterval(() => {
  console.log(
    'Worker heartbeat: waiting for ingestion/scoring/reminder/notification jobs.',
  );
}, intervalMs);
