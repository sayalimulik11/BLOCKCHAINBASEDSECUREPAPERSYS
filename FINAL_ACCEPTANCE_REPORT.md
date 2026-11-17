# SIGIL Final Acceptance Report

**Verification date:** 2026-11-16
**Scope:** Final resolution of the documented FA-01 through FA-11 findings, local-stack integration, and acceptance verification.
**Overall result:** Code-fixable findings were resolved and verified. Owner decisions about two frozen contract/spec discrepancies and a real MetaMask walkthrough remain open; no production contract or wallet was used.

## 1. Original audit findings and disposition

| Area | Original finding / root cause | Disposition |
|---|---|---|
| FA-02 Select accessibility | Radix Select's modal behavior hid the page from assistive technology while leaving background controls focusable, causing a full-document `aria-hidden-focus` violation when the menu opened. | Fixed with a non-modal Popover-backed listbox while preserving the Select API. Focused axe and keyboard regression test passed; the integrated browser's full-document axe check reported no violations. |
| FA-06 Key Ceremony | Cleanup was best-effort, and the frozen master specification's `openCollection` and `commitRandomness` signatures differ from the checked-in contract and ABI. | Mutable buffers are cleared in `finally` and tested on success and encryption failure. The full local ceremony/release flow passed. JavaScript/WebCrypto cannot guarantee physical memory erasure. Interface discrepancy is documented for owner decision; no interface was changed. |
| FA-07 Exam Command Centre | `shareVerified` was not in readiness because it is a client-side decryption check with no trustworthy server proof. The master spec says quota is “at least” while the contract enforces exact equality. | Readiness continues to explicitly identify `shareVerified` as not tracked by the server; a self-report was not introduced. Exact-quota behavior was tested and retained pending an owner/spec decision. |
| FA-09 Setter workflow | An optional section-totals hook had been requested. | Not required: the checked-in ABI exposes `getSectionTotals`, and submission history is available through indexed `BatchSubmitted` events. Both were exercised in the local lifecycle test. |
| FA-10 Holder workflow | An optional holder-status hook had been requested; share publication and secret cleanup needed verification. | Not required for correctness: chain state is read directly and decryption verification remains local. The release transaction intentionally publishes the share on-chain at release. The threshold flow passed locally; memory cleanup remains best-effort. |
| FA-11 Cross-functional verification | Select accessibility, real-stack integration, and wallet walkthrough had not been completed. | Select and the local PostgreSQL/Hardhat/API/frontend lifecycle were verified. MetaMask was unavailable in the integrated browser, so real-wallet verification remains manual. |
| FA-01, FA-03, FA-04, FA-05, FA-08 | The prior Member 4 audit marked these areas done based on implementation and tests. | Preserved; workspace tests and a local role-authenticated lifecycle provided additional verification where applicable. |

## 2. Changes made

- Replaced the Select's modal primitive with a non-modal Popover listbox. Preserved its public props and theme classes; added accessible naming/state, keyboard navigation, typeahead, Escape, Tab exit, and focus retention/restoration.
- Added a focused Select accessibility regression test covering axe rules, keyboard selection, accessible semantics, and focus behavior.
- Hardened ceremony cleanup by overwriting mutable scalar/share buffers in `finally` and dropping references to exported JWK/conversion strings. Added success and failure-path tests.
- Hardened `ThresholdMeter` for missing/invalid values and exposed an accessible unavailable state; added valid and invalid input tests.
- Fixed indexer event argument serialization using ABI parameter metadata, and avoided opening database transactions for empty log batches while still updating the checkpoint.
- Started/stopped the event indexer with the backend server and added an empty-log checkpoint regression test.
- Regenerated frontend API types and updated the audit, handoff, progress, and threat-model documentation.
- Regenerated the checked-in contract artifact bytecode from the current Solidity build. The ABI signatures are unchanged; no Solidity source or frozen interface was changed.

## 3. Local real-stack integration

The existing local startup script started a Hardhat chain on chain ID `31337`, deployed the checked-in `ExamVault` contract, started the backend API and frontend, and connected the configured PostgreSQL database. The backend health endpoint reported the expected chain ID and contract address. Prisma reported that the configured migration was already up to date.

A disposable exam lifecycle passed using unlocked Hardhat JSON-RPC test signers:

1. Authenticated Authority, Holder, and Setter sessions through SIWE; returned roles matched chain state.
2. Registered three holder public keys, created an exam, stored canonical-hash-verified metadata and encrypted share envelopes.
3. Each holder fetched only its own envelope, decrypted it, and verified its share commitment.
4. Opened collection, submitted holder commitments, and confirmed the indexer and readiness API reflected them. Readiness explicitly retained `shareVerified` as client-only.
5. Uploaded an encrypted one-question batch, submitted its hash on-chain, checked the indexed `BatchSubmitted` history and on-chain section total, and confirmed setter readiness.
6. Sealed the exact-quota exam, advanced local chain time, submitted threshold shares, reconstructed and verified the exam key, and confirmed the indexed/API release state.
7. Downloaded the confirmed ciphertext as Authority, verified its hash, and decrypted it to the submitted question.

After verification, the exam's database rows, three encrypted-share rows, five panel rows, eleven exam events, confirmed batch row and blob, plus the 12 local Hardhat participants and 33 associated non-exam test events (participant, role, and holder-key events) were removed. Final counts were zero exams, batches, shares, panel members, participants, and chain events. The Hardhat node, API, and frontend were stopped; the pre-existing PostgreSQL process was left running.

**Wallet limitation:** This was a local Hardhat signer walkthrough, not a MetaMask walkthrough. `window.ethereum` was unavailable in the integrated browser. MetaMask installation/connection, network switching, wallet-popup confirmation, and the real frontend wallet journey remain manual release checks. The browser test did not verify production data or a live network.

## 4. Owner decisions and consequences

### Frozen function signatures

- **Current implementation:** the checked-in contract and ABI expose `openCollection(uint256,bytes)` and `commitRandomness(uint256,bytes32,bytes32)`. Each holder commits both a share commitment and randomness commitment. Frontend and backend follow this ABI.
- **Master specification:** section 7.1 describes `openCollection(uint256,bytes,bytes32[])` and `commitRandomness(uint256,bytes32)`.
- **Options:** (1) confirm current behavior and amend the specification, with no contract migration; or (2) implement the specified flow in a new contract deployment and update all ABI, frontend, backend, indexer, and integration consumers.
- **Consequences:** `ExamVault` is not upgradeable. A new interface requires deployment at a new address and recreation/migration planning for exams; existing contract state cannot be upgraded in place.
- **Recommendation:** do not alter the frozen interface absent approval. If the current flow is intended, resolve the discrepancy with an ICR that updates the specification.
- **Status:** requires owner/specification decision. No contract interface change was made.

### Section quota rule

- **Current implementation:** `ExamVault.sealExam` rejects when `have != need`, so each section must have exactly its configured quota.
- **Master specification:** sections may contain at least their quota; section selection later takes the quota from the full question pool.
- **Options:** (1) confirm exact quotas and amend the specification; or (2) change the contract to permit excess questions, deploy a new version, and reconcile selection and bank semantics for existing exams.
- **Consequences:** changing the rule requires redeployment and updates to contract artifacts and all clients. It changes which question totals can be sealed and may affect the intended randomized selection pool.
- **Recommendation:** preserve the current contract rule until the owner confirms whether oversized banks are intended; then resolve by ICR. No security rule was weakened.
- **Status:** requires owner/specification decision. Exact-quota behavior passed the local acceptance flow.

### `shareVerified` readiness

- **Current implementation:** the holder verifies decryption locally by comparing the decrypted share with its commitment. The API reports `notTrackedByServer: ["shareVerified"]`.
- **Discrepancy:** a commitment proves a value was committed, not that another party locally decrypted it. A client self-report is not a trustworthy server verification.
- **Options:** retain the explicit untracked state, or design a new server-verifiable proof/protocol and review its privacy/security implications.
- **Recommendation:** retain the current truthful status; do not treat self-report as readiness evidence. No contract change is needed for other readiness fields.
- **Status:** accepted architectural limitation unless the product owner requires a separately designed proof flow.

## 5. Final FA-01 through FA-11 status

Statuses use the requested labels.

| FA | Status | Evidence / remaining work |
|---|---|---|
| FA-01 | Implemented and Verified | Existing design tokens, responsive shell, and reduced-motion/contrast checks retained; workspace tests/build passed. |
| FA-02 | Implemented and Verified | Non-modal listbox fix; focused accessibility test passed; full-document axe check in the integrated browser reported no violations. |
| FA-03 | Implemented and Verified | Existing command-centre and rosette tests retained; local lifecycle confirmed command-centre readiness data. |
| FA-04 | Implemented but Partially Verified | Guards and chain-derived SIWE roles passed with Authority, Setter, and Holder Hardhat accounts. MetaMask connection and wallet UX remain manual. |
| FA-05 | Implemented and Verified | Existing participant/docket tests retained; backend indexed the local exam lifecycle. Disposable data was removed. |
| FA-06 | Implemented but Partially Verified | Ceremony cleanup tests and full local threshold flow passed. Physical zeroization is not guaranteeable in JavaScript/WebCrypto; frozen function-signature discrepancy awaits owner decision; MetaMask flow remains manual. |
| FA-07 | Implemented but Partially Verified | Confirmed readiness/event indexing passed. `shareVerified` is correctly not server-tracked; exact-versus-at-least quota discrepancy awaits owner decision. |
| FA-08 | Implemented and Verified | Error-decoder tests and workspace tests passed. |
| FA-09 | Implemented and Verified | Direct `getSectionTotals` and indexed submission history passed in the local lifecycle; optional hook is not needed. |
| FA-10 | Implemented but Partially Verified | Local encrypted-share verification, threshold publication at release, and cleanup flow passed. JavaScript zeroization is best-effort; real MetaMask flow remains manual. |
| FA-11 | Implemented but Partially Verified | Local stack, database migration, roles, transactions, indexer, API state, and encrypted batch retrieval passed. Real MetaMask/network-switch and UI wallet walkthrough remain manual. |

## 6. Tests and validation actually executed

| Command/check | Result |
|---|---|
| `corepack pnpm test` | **Passed on rerun.** Contracts 149; core 19; UI 18; frontend 174; backend 55. The default run skipped 295 authorization-matrix cases and one OS-process indexer test; both were run separately and passed. The first attempt failed because the required local Hardhat RPC was stopped; it passed after RPC was started. |
| `corepack pnpm typecheck` | **Passed** for all six workspace projects with typecheck scripts. |
| `corepack pnpm lint` | **Passed** with zero errors. Solhint emitted the existing `ExamVault.sol` max-states-count warning (22 states versus the configured 15); no contract source change was made. |
| `corepack pnpm -r --if-present build` | **Passed** for core, contract types, backend, and frontend. Frontend emitted existing Rollup/Zod annotation warnings and a 901.69 kB JavaScript chunk warning. |
| Contracts clean/compile | **Passed.** Clean compilation compiled six Solidity files; ABI signatures match the checked-in interface. |
| `corepack pnpm coverage` | **Passed:** 149 contract tests. Fresh coverage: 100% statements, 96.36% branches, 100% functions, 100% lines. |
| `corepack pnpm coverage:check` | **Passed:** configured line (95%) and branch (90%) thresholds met. |
| `corepack pnpm test:auth-matrix` | **Passed:** 295/295 authorization-matrix tests. |
| `node scripts/test-indexer-process.mjs` | **Passed:** 1/1 OS-process crash/restart test, with no event gaps or duplicates. |
| Focused Select accessibility test | **Passed:** 1/1. Covers accessible listbox semantics, axe rules, keyboard selection, Escape, Tab exit, and focus behavior. |
| Ceremony cleanup cryptographic test | **Passed:** 2/2 success/failure-path tests. |
| Full local lifecycle integration | **Passed** as described above; disposable records and blob were removed. |
| `git diff --check` | **Passed.** |

## 7. Files modified

- Backend: `backend/src/indexer/indexer.ts`, `backend/src/server.ts`, `backend/test/indexer.test.ts`
- Documentation: `docs/AUDIT_MEMBER4.md`, `docs/HANDOFF.md`, `docs/PROGRESS.md`, `docs/threat-model.md`
- Frontend: `frontend/src/api/generated.ts`, `frontend/test/select-accessibility.test.tsx`
- Contract artifact: `packages/contracts-types/src/ExamVault.json` (bytecode refreshed; ABI signatures unchanged)
- Core: `packages/core/src/ceremony.ts`, `packages/core/test/ceremony.test.ts`
- UI: `packages/ui/src/components/Select.tsx`, `packages/ui/src/components/ThresholdMeter.tsx`, `packages/ui/test/threshold-meter.test.tsx`
- This report: `FINAL_ACCEPTANCE_REPORT.md`

## 8. Contract deployment and release checklist

- No Solidity source or ABI signature was changed. The local integration used a disposable Hardhat deployment at the localhost address configured by the existing startup script; it was not a production deployment.
- The Select, indexer, UI guard, and cleanup fixes do not require contract redeployment.
- A contract change to either the frozen function signatures or quota rule requires owner approval and a new deployment, followed by ABI/client/indexer updates and an explicit plan for existing exam state.
- Before release, manually verify MetaMask connection, intended network, wallet role detection and access, wallet transaction confirmations, and live frontend reflection of confirmed chain state. Do not mark FA-04/FA-11 fully accepted until this is done.
- No commit, push, merge, or publication was performed.
