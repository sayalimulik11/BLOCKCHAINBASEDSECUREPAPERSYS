# Member 3 handoff

## Current task

Member 3 BE-01..BE-13 peer review completed and approved by Member 2. Branch: `m3/BE-wrapup-verification`. PR #1 is open against upstream `main`: https://github.com/GargiLaulkar/BLOCKCHAINBASEDSECUREPAPERSYS/pull/1. Review request: [member3-review-request.md](./reviews/member3-review-request.md). Review status: Approved; all BE-01..BE-13 tasks marked Completed.

## What is done

- Added the backend architecture/report chapter at [backend-chapter.md](./backend-chapter.md), including data boundaries, SIWE, indexing, authorization, section 13 threat coverage, and limitations.
- Updated the Member 3 progress table in [PROGRESS.md](./PROGRESS.md) with status, evidence, and open verification gaps.
- Updated `dev:all` to load `backend/.env`, preserve process environment precedence, use a configured `DATABASE_URL`, and otherwise start Compose PostgreSQL and derive its host connection string from captured Compose config without printing credentials.
- Updated `demo:reset` to load backend configuration, require a loopback database, run `prisma migrate reset --force --skip-seed`, reset the local chain, clear `BLOB_DIR`, and redeploy empty.
- Added backend ESLint/Prettier config and lint/format scripts; corrected existing unused imports/variables and made root lint work when called via Corepack.
- Added an opt-in child-process kill/restart test which indexes actual Hardhat contract logs, checks complete log coverage and unique event keys, and compares Exam/Batch projections after replay. It uses a JSON-backed persistent test adapter, not PostgreSQL.
- Ran backend typecheck, root lint, backend tests, child process test, and authorization matrix. Current results are recorded below.
- In the 2026-10-14 verification run, Prisma migrations deployed, all seven section 8.3 tables were confirmed, and reset left the tables and `BLOB_DIR` empty. `dev:all` used the configured `DATABASE_URL` (not Docker), started chain/API/web, and the existing health endpoint returned HTTP 200.
- Restored generated `packages/contracts-types` files and removed the generated `contracts/deployments/localhost.json` after verification. No frozen interface or OpenAPI file was changed.
- Secret triage completed without displaying values: database/session strings were test/config fixtures; 64-hex strings were hashes, seeds, or test vectors; keystore matches were code/docs. Exact local `.env` password search found no match in tracked files or `git log -p origin/main..HEAD`; no tracked keystore data file was found.
- Created the review request/checklist, PR title/body, and ready-to-send team messages under `docs/reviews/`.

## Files changed in this verification run

- `docs/HANDOFF.md`
- `docs/PROGRESS.md`
- `docs/reviews/member3-review-request.md`
- `docs/reviews/member3-pr-body.md`
- `docs/reviews/member3-team-messages.md`

Generated contract-type files were restored and the untracked localhost deployment artifact was removed. No runtime or frozen interface files were changed.

## BE-01..BE-13 check against “Done when”

| Task | Assessment |
|---|---|
| BE-01 | Runtime verified; approved by Member 2 peer review. `dev:all` used configured PostgreSQL, skipped Docker, and started chain/API/web; health returned HTTP 200. |
| BE-02 | Runtime verified; approved by Member 2 peer review. Migration deployed and all seven section 8.3 tables were confirmed empty after reset and startup. |
| BE-03 | SIWE nonce replay, domain, signature, session, and chain-derived-role tests pass; approved by Member 2 review. |
| BE-04 | Metadata hash, authority/assignment, and public-summary behavior tested; approved by Member 2 review. |
| BE-05 | Pending/confirmed upload, validation, assignment/state gates, and tampered-file rejection tested; approved by Member 2 review. |
| BE-06 | Encrypted share validation and holder-only retrieval tested; approved by Member 2 review. |
| BE-07 | Process test passed against real Hardhat logs; the persistent row adapter is JSON-backed, not PostgreSQL. Approved by Member 2 review. |
| BE-08 | Filtered cursor paging, validation, authenticated stats, and readiness schemas tested; approved by Member 2 review. |
| BE-09 | Auditor-only trace create/read, report/hash validation, and ownership tested; approved by Member 2 review. |
| BE-10 | Backend lint/security/validator tests pass; root lint retains the existing Member 1 Solhint warning. Approved by Member 2 review. |
| BE-11 | OpenAPI and generated frontend types are present; approved by Member 2 review. |
| BE-12 | Authorization matrix passed 295 tests; approved by Member 2 review. |
| BE-13 | Reset and `dev:all` runtime verified; approved by Member 2 review. |

## Definition of Done gaps

- **BE-07 production-database restart:** the OS child process was killed/restarted and its durable JSON row projection verified against real Hardhat logs; repeat with PostgreSQL if process restart must specifically prove real database transaction behavior.
- **Health response:** `/api/health` returned HTTP 200 and its existing chain-connectivity response; it was not modified because the interface is frozen.
- **Peer review:** Member 2's peer review completed and approved; all BE-01..BE-13 marked Completed.

Verification results: `corepack pnpm --filter @sigil/backend typecheck` passed; `corepack pnpm lint` passed with the existing Solhint `max-states-count` warning; backend tests passed (52 passed, 296 skipped, including the opt-in process and auth-matrix suites); `node scripts/test-indexer-process.mjs` passed (1 test); `corepack pnpm test:auth-matrix` passed (295 tests); `@sigil/core` test passed (17 tests); `@sigil/contracts` test passed (149 tests) with 100% statement / 96.36% branch coverage; zero OpenAPI or contract spec drift. Prisma migration deploy and reset passed. All seven application tables were empty after reset and after startup, and `BLOB_DIR` had zero entries. Interfaces in sections 6–9 and `docs/api/openapi.json` were not changed.

## Earlier implementation scope

- `backend/` implementation and tests for BE-01..BE-13 (completed in the prior task commits recorded in Git history and `PROGRESS.md`)
- Backend documentation and scripts from the preceding implementation work

## What remains

1. Complete the Gate 2 walking-skeleton check once Members 4 and 5 deliver the frontend (section 16).
2. Complete final integration review under the section 15 review ring.
3. If required for BE-07, repeat the crash/restart test with PostgreSQL-backed persistence; its current durable adapter is JSON-backed.

## Commands to run

From the repository root:

```powershell
corepack pnpm --filter @sigil/backend typecheck
corepack pnpm lint
corepack pnpm --filter @sigil/backend test
node scripts/test-indexer-process.mjs
corepack pnpm test:auth-matrix
corepack pnpm --filter @sigil/backend exec prisma migrate deploy --schema prisma/schema.prisma
corepack pnpm demo:reset
corepack pnpm dev:all
```

Backend tests and `node scripts/test-indexer-process.mjs` use the local Hardhat JSON-RPC node at `127.0.0.1:8545`. `corepack pnpm test:auth-matrix` starts its own isolated local Hardhat node. `dev:all` uses `DATABASE_URL` if configured; otherwise it requires Docker. `demo:reset` requires `DATABASE_URL` to point to `localhost` or `127.0.0.1` and a local Hardhat chain with ID 31337.

## Transient failures and final outcomes

- `corepack pnpm dev:chain` initially failed because its script invokes bare `pnpm`: `'pnpm' is not recognized as an internal or external command, operable program or batch file.` The local node was started with `corepack pnpm --filter @sigil/contracts exec hardhat node` and stopped after verification.
- First `corepack pnpm demo:reset` attempt failed before database/chain reset because the local Hardhat node was not running: `fetch failed`. After starting the node with Corepack, the reset succeeded.
- The initial API and web probes occurred before `dev:all` finished startup and failed with `Unable to connect to the remote server`; final checks succeeded after readiness: API health HTTP 200 and web HTTP 200.
- `corepack pnpm --filter @sigil/backend exec prisma migrate deploy --schema prisma/schema.prisma`: passed; migration `20261003000000_init` applied.
- Prisma read-only introspection confirmed `Exam`, `Participant`, `PanelMember`, `Batch`, `EncryptedShare`, `ChainEvent`, and `LeakTrace`.
- `corepack pnpm demo:reset`: passed on retry; migration reset succeeded, chain ID was 31337, deployment completed, all seven database table counts were zero, and `BLOB_DIR` had zero entries. No demo records were seeded by reset.
- `corepack pnpm dev:all`: passed; output confirmed `Using PostgreSQL configured by DATABASE_URL; skipping Docker.` Chain, API, and web started. Health returned `status: ok`, `chain.connected: true`, and `chainId: 31337`; web returned HTTP 200.
- After `dev:all`, all seven table counts remained zero and `BLOB_DIR` remained empty. Startup's explicit role bootstrap registered demo roles on the local chain.
- `corepack pnpm --filter @sigil/backend typecheck`: passed.
- `corepack pnpm lint`: passed; existing Solhint warning: `Contract has 22 states declarations but allowed no more than 15`.
- `corepack pnpm --filter @sigil/backend test`: passed, 52 passed and 296 skipped (authorization matrix and opt-in process test are run separately).
- `node scripts/test-indexer-process.mjs`: passed, 1 test.
- `corepack pnpm test:auth-matrix`: passed, 295 tests.
- All started local services were stopped. Ports 4000, 5173, and 8545 were confirmed stopped. Generated contract type files were restored and the untracked local deployment artifact was removed.

## Open questions

- Who will provide the required Member 2 review of Member 3 work?

## Decisions made and why

- The final-report chapter is a separate `docs/backend-chapter.md` so the report assembler can incorporate it without editing frozen API or contract interfaces.
- Docker fallback reads resolved Compose service settings in memory to form the host connection URL; it does not print the Compose configuration or database credentials.
- Reset requires a loopback PostgreSQL host and local Hardhat chain ID 31337, runs Prisma with `--skip-seed`, and does not proceed if DATABASE_URL is absent or remote.
- Verification claims distinguish completed PostgreSQL reset/startup checks from the JSON-backed process-test adapter used for BE-07.
- No API, contract or OpenAPI interface was changed.

## CI fixes (BE-13)

- Enforced `* text=auto eol=lf` in `.gitattributes` to eliminate line-ending drift on contract and OpenAPI specs across Windows and Linux checkouts.
- Added `scripts/export-abi.mjs` to synchronize `ExamVault.json` artifacts and ABI to `@sigil/contracts-types` immediately after `hardhat compile`.
- Restructured `ci.yml` test steps to run Smart Contract tests, Smart Contract coverage, and Core tests in isolated in-process steps without background node interference.
- Isolated backend tests with a dedicated ephemeral Hardhat node on `127.0.0.1:8545`, deploying `ExamVault` to `localhost` and dynamically injecting `CONTRACT_ADDRESS`, `DEPLOY_BLOCK`, `RPC_URL`, `CHAIN_ID`, and test database/session parameters into `@sigil/backend test`. Cleaned up the deployment artifact and terminated the node on exit.
- Preserved `test:auth-matrix` and `test-indexer-process` as opt-in verification suites run separately with their dedicated lifecycle runners.

## Cross-platform storage path validation fix (BE-05)

- Added `isValidStoragePath` in `backend/src/routes/exams.ts` to validate stored blob paths before any filesystem calls. Rejects paths that are absolute, contain `..` segments, contain backslashes (`\`), or contain NUL bytes, and enforces separator-aware prefix containment within `BLOB_DIR` returning HTTP 400 `INVALID_STORAGE_PATH`. This resolves a Linux CI failure where `..\outside.bin` was treated as a literal file name on POSIX rather than directory traversal, throwing `ENOENT` during `realpath` and returning 404 `BLOB_NOT_FOUND`.
- Added test cases in `backend/test/batches.test.ts` verifying rejection with HTTP 400 `INVALID_STORAGE_PATH` for `"../x"`, `"..\\x"`, and absolute paths, while preserving HTTP 404 `BLOB_NOT_FOUND` for genuinely missing files.
