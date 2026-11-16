# BE-07: Indexer not started in server.ts

Missing in backend/src/server.ts: no ExamVaultIndexer instantiation or start/backfill.

Evidence: /api/events returns [] while chain has 12 ParticipantRegistered events; no .indexer-state.json; restarting backend did not index.

Fix snippet (at boot):
\\\	s
const indexer = new ExamVaultIndexer(cfg, provider, prisma);
await indexer.backfill();
// poll loop
\\\
Stop indexer on shutdown.

Verify: /api/events returns 12 events and last indexed block == latest.
