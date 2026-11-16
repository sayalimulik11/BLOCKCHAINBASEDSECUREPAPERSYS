# Open items

## Owner follow-ups

- **Member 2 — ceremony secret cleanup:** `packages/core/src/ceremony.ts` exports private JWK scalar `d` and Shamir share buffers that are not explicitly zeroed on every success and failure path. The frontend does not receive the exam private key and cannot clear those core-local buffers. Add zeroization in `runCeremony` and tests for success and failure; until then the frontend can only state that the key was not returned to or stored by the screen, not that core memory was physically wiped.
- **Member 2 / contract owner — frozen ABI discrepancy:** the section 7 prose describes `openCollection(examId, commitments)` and a two-argument `commitRandomness(examId, commitment)`. The checked-in ABI exposes `openCollection(uint256,bytes)` and `commitRandomness(uint256,bytes32,bytes32)`. The UI follows the generated ABI; reconcile the frozen interface and intended flow through an ICR.
- **Member 1 / contract owner — seal quota discrepancy:** the spec says each section must have at least its quota, while `ExamVault.sealExam` currently requires exact equality (`have == need`). The UI follows the contract and reports both under- and over-quota blockers. Reconcile the contract and spec through an ICR.
- **Member 5 — optional command-centre hook:** expose `useExamCommandCentre(examId: string | null, options?: { enabled?: boolean })` returning `{ exam: { state: number; metaHash: string; bankHash: string | null; releaseOpensAt: string; examStartsAt: string; examEndsAt: string; threshold: number } | null; chainTime: number | null; sectionQuestionCounts: readonly { sectionId: number; questionCount: number }[]; holders: readonly { address: string; keyRegistered: boolean; shareVerified: boolean | "not-tracked"; randomnessCommitted: boolean }[]; setters: readonly { address: string; batchesSubmitted: boolean; batchCount: number }[]; isLoading: boolean; error: Error | null; refetch: () => Promise<void> }`. `CommandCentreContainer` currently reads the missing chain-only values directly.
- **Member 5 — optional setter section totals hook:** expose `useExamSectionTotals(examId: string | null, options?: { enabled?: boolean; contract?: ethers.Contract | null }): { totals: readonly bigint[]; isLoading: boolean; error: Error | null; refetch: () => Promise<readonly bigint[]> }`. Setter containers currently read `getSectionTotals` from the checked-in ABI.
- **Member 5 — optional holder status hook:** expose `useHolderExamStatus(examId: string | null, holder: Address | null, options?: { enabled?: boolean; contract?: ethers.Contract | null }): { encryptionKey: Uint8Array | null; shareCommitment: Hex | null; randomnessCommitted: boolean; shareSubmitted: boolean; submissionCount: number; chainTime: number | null; isLoading: boolean; error: Error | null; refetch: () => Promise<void> }`. `HolderConsoleContainer` currently performs these on-chain reads directly.

## Privacy and memory guarantees

Section 5 phase 5 intentionally publishes a holder's plaintext share on-chain through the `submitShare` transaction at release time. This single transaction at release time is the only place a share leaves the browser; it is a protocol action by design (section 5 phase 5), not an item awaiting owner confirmation. The share, passphrase, private key, and reveal are not sent to the metadata/share API or browser storage.

Frontend cleanup is best-effort JavaScript cleanup: component references and passphrase fields are cleared, byte buffers are overwritten where available, and JWK scalar strings are replaced. JavaScript engines and `@sigil/core` may retain copies or internal buffers; physical zeroization cannot be guaranteed until the core ceremony path is corrected and the browser runtime provides stronger guarantees.

## Deployment and final manual check

The production-only CSP currently emitted by `frontend/vite.config.ts` is:

```text
default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' <configured origins>
```

Set `SIGIL_CSP_CONNECT_SRC` in the production build environment to `'self'` followed by the API and RPC HTTP(S) origins, for example `'self' https://api.example https://rpc.example`. The Vite build rejects other source forms. `style-src 'unsafe-inline'` remains necessary for current inline React style attributes; scripts do not allow `unsafe-eval`. Offline fonts are served from the application origin.

Before release, run the real-stack walkthrough yourself with a configured `backend/.env`, database, local chain, and real MetaMask accounts for each role. The chain/backend/database were not started for the Member 4 final verification.

## Accessibility library note

When Radix Select is open, its current modal implementation applies `aria-hidden` to the rest of the gallery while leaving background controls focusable in the DOM. A full-document axe scan in that transient state reports `aria-hidden-focus` on the hidden siblings. The select overlay itself passes axe, and the full-document scans for the captured page screenshots pass. The current Radix Select Root API exposes no `modal` option, so this library-owned behavior is recorded for an upstream UI-library review rather than worked around with global DOM mutation.

## Open items for other members
- Member 5: useParticipants must read positional array payload [address, role, profileHash] (accept object too); request <=100 events per call.
- Member 3: start indexer in backend/src/server.ts; document payloadJson shape in OpenAPI.
- runCeremony: zero buffers; ceremony screen must not claim key wiped.
- Contract differs from spec for openCollection, commitRandomness; sealExam needs exact quota.
- Optional hooks: useExamCommandCentre, useExamSectionTotals, useHolderExamStatus.
