# Open items

## Owner decisions

- **Member 2 — ceremony secret cleanup (resolved locally 2026-11-16):** `runCeremony` now clears the mutable scalar and Shamir share buffers in a `finally` block and drops references to exported JWK and conversion strings. Success and encryption-failure paths are tested. JavaScript strings and WebCrypto/runtime copies still prevent any guarantee of physical memory zeroization.
- **Member 2 / contract owner — frozen ABI discrepancy:** section 7 documents `openCollection(examId, examPublicKey, shareCommitments)` and `commitRandomness(examId, commitment)`. The checked-in contract and ABI instead expose `openCollection(uint256,bytes)` and `commitRandomness(uint256,bytes32,bytes32)`; each holder submits both its share and randomness commitments. The frontend/backend follow the checked-in ABI. Options: (1) confirm current behavior and amend the spec, which requires no contract migration and preserves existing clients; or (2) implement the spec flow in a new deployment, update every ABI/client/indexer, and migrate/recreate exams because the contract is not upgradeable. **Recommendation:** keep the frozen interface until the owner decides; if the current flow is intended, reconcile the spec by ICR.
- **Member 1 / contract owner — seal quota discrepancy:** the spec requires each section to have at least its quota; `ExamVault.sealExam` rejects any total not exactly equal to the quota. Options: (1) confirm exact quotas and amend the spec, preserving the deployed interface; or (2) change the contract to permit excess questions and deploy a new version, then update clients and reconcile selection/bank semantics for existing exams. **Recommendation:** do not change contract rules without approval; the owner should decide whether the intended workflow selects from an oversized question pool.
- **Readiness `shareVerified` — protocol/owner decision if server verification is required:** this is established when the holder decrypts a share locally and compares it with its commitment. The server receives no trustworthy proof of that local operation. Keep it explicitly untracked; do not infer it from a self-report or randomness commitment. A server-verifiable status would require a separately designed proof/protocol and security review.

## Optional hooks (not blockers)

- `useExamCommandCentre(examId, options)` could centralize the values currently read by `CommandCentreContainer`; its current direct contract reads plus indexed API readiness work and were exercised in the local lifecycle check.
- `useExamSectionTotals(examId, options)` could centralize `getSectionTotals`; the checked-in ABI and current direct reads already provide the required counts.
- `useHolderExamStatus(examId, holder, options)` could centralize holder chain state; the current container reads those values directly and keeps decryption verification local.

## Privacy and memory guarantees

Section 5 phase 5 intentionally publishes a holder's plaintext share on-chain through the `submitShare` transaction at release time. This single transaction at release time is the only place a share leaves the browser; it is a protocol action by design (section 5 phase 5), not an item awaiting owner confirmation. The share, passphrase, private key, and reveal are not sent to the metadata/share API or browser storage.

Frontend and core cleanup is best-effort JavaScript cleanup: component references and passphrase fields are cleared, mutable scalar/share buffers are overwritten on both success and failure, and JWK/conversion-string references are dropped. JavaScript engines, immutable strings, WebCrypto and internal libraries may retain copies; physical zeroization cannot be guaranteed.

## Deployment and final manual check

The production-only CSP currently emitted by `frontend/vite.config.ts` is:

```text
default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' <configured origins>
```

Set `SIGIL_CSP_CONNECT_SRC` in the production build environment to `'self'` followed by the API and RPC HTTP(S) origins, for example `'self' https://api.example https://rpc.example`. The Vite build rejects other source forms. `style-src 'unsafe-inline'` remains necessary for current inline React style attributes; scripts do not allow `unsafe-eval`. Offline fonts are served from the application origin.

The local application stack was started with the configured backend environment, PostgreSQL, a Hardhat chain (31337), the backend API, and Vite frontend. The configured database migration was already up to date. A disposable exam was created, its encrypted ceremony shares were retrieved/decrypted by holder test accounts, a question batch was uploaded and submitted, section totals and indexed readiness/history were checked, the exam was sealed, and threshold shares released it. The API exposed the confirmed release and a hash-verified batch download; the downloaded batch decrypted to the submitted question. The test exam, share records, batch/blob, and local bootstrap participants/events were removed afterward.

This was a local Hardhat JSON-RPC signer walkthrough, **not** a MetaMask walkthrough. `window.ethereum` was unavailable in the integrated browser, so MetaMask installation/connection, network switching, and wallet-popup confirmation for each real role remain manual release checks. No production wallet, network, contract, or database was used.

## Select accessibility finding: resolved

The existing Select API is preserved, but its implementation now uses a non-modal Radix Popover with listbox semantics. This avoids hiding focusable page content when the menu is open without global DOM mutation. The focused accessibility test covers accessible naming, selected option semantics, keyboard selection, Escape, Tab exit, and focus retention/restoration; full-document axe and browser checks passed.

## Open items for other members
- Member 5 participants feed: resolved in current tree; the API normalizes positional legacy payloads to named ABI fields, and the hook requests cursor-paginated pages of at most 100 events.
- Member 3 indexer startup: resolved locally 2026-11-16; the backend server now starts the indexer and stops it during graceful shutdown.
- Owner decisions remain for the `openCollection`/`commitRandomness` specification mismatch and exact-versus-at-least quota rule.
- The three hooks above remain optional follow-up improvements, not correctness blockers.
