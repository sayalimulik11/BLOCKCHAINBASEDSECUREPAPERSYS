# Member 4 completion audit

Scope: FA-01 through FA-11 in section 15 and the section 18 acceptance items applicable to Member 4's shell, design system, and Admin, Authority, Setter, and Holder flows. In addition to source and test review, the local PostgreSQL/Hardhat/API/frontend stack completed a disposable exam lifecycle using unlocked Hardhat test accounts. A real MetaMask walkthrough remains a manual release check.

| Task ID | Status | Evidence | Anything missing |
|---|---|---|---|
| FA-01 | done | `packages/ui/src/styles/tokens.css`, `packages/ui/src/styles/base.css`, `/dev/gallery`; responsive browser checks emulate reduced motion and run axe contrast checks | None in Member 4 scope. |
| FA-02 | done | `packages/ui/src/components/Select.tsx`; `frontend/test/select-accessibility.test.tsx`; full-document axe and keyboard checks | The non-modal Popover-backed listbox preserves the Select API and avoids hiding focusable page content. Keyboard selection, Escape, Tab exit, focus retention/restoration, and accessible naming are tested. |
| FA-03 | done | `packages/ui/test/rosette.test.ts`; `frontend/test/command-centre.test.tsx`; desktop/mobile command-centre screenshots | None in Member 4 scope. |
| FA-04 | done | `frontend/test/guards.test.tsx`; `frontend/src/shell/`; local SIWE sessions for Authority, Setter, and Holders returned chain-derived roles | The local flow used Hardhat JSON-RPC signers, not MetaMask. Real extension/network-switch verification remains manual. |
| FA-05 | done | `frontend/test/participants.test.tsx`, `frontend/test/participants-container.test.tsx`, `frontend/test/docket.test.tsx`; local-stack exam creation and event-indexing checks | No deployed production data was used; the disposable local exam and records were removed after verification. |
| FA-06 | partial | `frontend/test/create-exam-validation.test.ts`, `frontend/test/create-exam.test.tsx`, `frontend/test/key-ceremony.test.tsx`, `packages/core/test/ceremony.test.ts`; full local ceremony and threshold-release flow | Mutable secret buffers are cleared best-effort, but JavaScript/WebCrypto cannot guarantee physical memory erasure. Frozen section 7 function signatures differ from the checked-in ABI. Owner decision required; no interface was changed. |
| FA-07 | partial | `frontend/test/command-centre.test.tsx`; local readiness was checked against indexed `RandomnessCommitted` and `BatchSubmitted` events | `shareVerified` remains client-only because the server has no trustworthy proof of local decryption. The contract requires exact quotas while the spec says at least the quota. Both need an owner/specification decision; see `docs/HANDOFF.md`. |
| FA-08 | done | `frontend/test/errors.test.ts` (34 tests) | None in Member 4 scope. |
| FA-09 | done | `frontend/test/setter-import.test.ts`, `frontend/test/setter-pages.test.tsx`, `frontend/test/setter-workflow.test.ts`, `frontend/test/setter-container.test.tsx`; local `getSectionTotals` and indexed submission-history checks | The optional `useExamSectionTotals` hook is not needed for correctness; the checked-in ABI and direct reads provide the required totals. |
| FA-10 | partial | `frontend/test/holder-container.test.tsx`, `frontend/test/holder-pages.test.tsx`; local encrypted-share retrieval, commitment verification, and threshold release | Holder status is read from chain and local decryption state; the optional hook is not required. Cleanup is best-effort, and `submitShare` intentionally publishes the share on-chain at release. MetaMask verification remains manual. |
| FA-11 | partial | `scripts/verify-gallery-responsive.mjs`; 168 desktop/mobile screenshots; full-document axe and keyboard regression test; local PostgreSQL/Hardhat/API/frontend lifecycle and event-indexing test | The Select finding is resolved and local role, transaction, indexer, API, and release flows passed. Real MetaMask/network-switch verification remains manual. |

## Section 18 acceptance items applicable to Member 4

| Acceptance item | Result | Evidence or remaining work |
|---|---|---|
| No hard-coded operational exams, questions, users, hashes, or statistics | pass for Member 4 routes | Sample records are rendered only by `/dev/gallery` and tests; operational containers use live hooks/API/chain reads. |
| Signed transactions use the correct role and lifecycle | implemented; locally verified with test signers | Page containers call the checked-in ABI through TxDrawer and the FA-08 decoder. Authority, Setter, and Holder SIWE/transactions passed against local Hardhat; repeat with real MetaMask before release. |
| Section 11 validation has clear inline errors | pass for covered Member 4 forms | Wizard and composer validation tests cover the specified bounds and invalid inputs. |
| Secrets stay out of browser storage and are not rendered after use | pass in tests and headless gallery checks | Holder container tests assert no test passphrase/key/share/reveal appears in the DOM after use and spy on storage writes. Core now clears mutable ceremony buffers best-effort; physical JavaScript/WebCrypto zeroization cannot be guaranteed. |
| UI passes axe and keyboard-only operation | pass for audited flows | Captured-page and full-document Select checks are clean. Keyboard order, visible focus, arrow-key selection, Escape, Tab exit, and focus restoration are exercised. |
| Report honestly lists section 3.5 limitations | done | `docs/report/member4-interface.md` |

Verification executed for this audit: focused Select accessibility and local lifecycle checks passed. Workspace and package-level test/build results are recorded in `FINAL_ACCEPTANCE_REPORT.md`. The local PostgreSQL process was pre-existing and left running; the Hardhat node, API, and frontend started for this test were stopped afterward. No MetaMask extension was available to the integrated browser.
