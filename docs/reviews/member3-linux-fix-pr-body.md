Title: BE-05: reject non-portable traversal paths consistently on Linux

Follow-up to #1. CI ran on e2b24e2 before this fix.

The batch download route now rejects absolute paths, `..` segments, backslashes, and NUL bytes with HTTP 400 `INVALID_STORAGE_PATH` before filesystem access. Genuinely missing files still return HTTP 404 `BLOB_NOT_FOUND`. Error codes and response shapes are unchanged.

Verification:
- Windows (Node v24.11.0): `corepack pnpm lint` passed with the existing Solhint state-count warning; backend typecheck passed after the CI prerequisite builds; `batches.test.ts` passed (6/6).
- Linux WSL (Node v20.18.0): lint passed with the existing Solhint warning; backend typecheck passed; `batches.test.ts` passed (6/6); full backend suite passed (53 passed, 296 skipped). The suite used a local Hardhat node on `127.0.0.1:8545` (chain ID 31337), which was stopped after the run.

Please review, Bhaktimo.
