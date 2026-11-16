# Member 4 completion audit

Scope: FA-01 through FA-11 in section 15 and the section 18 acceptance items applicable to Member 4's shell, design system, and Admin, Authority, Setter, and Holder flows. The audit is based on the checked-in source and tests; a real-stack MetaMask walkthrough remains a manual release check.

| Task ID | Status | Evidence | Anything missing |
|---|---|---|---|
| FA-01 | done | `packages/ui/src/styles/tokens.css`, `packages/ui/src/styles/base.css`, `/dev/gallery`; responsive browser checks emulate reduced motion and run axe contrast checks | None in Member 4 scope. |
| FA-02 | partial | `packages/ui/src/components/`; keyboard checks in `scripts/verify-gallery-responsive.mjs` | Radix Select's open-menu modal behavior triggers a library-owned `aria-hidden-focus` finding when axe scans the entire document. The menu-root scan passes; see `docs/HANDOFF.md`. |
| FA-03 | done | `packages/ui/test/rosette.test.ts`; `frontend/test/command-centre.test.tsx`; desktop/mobile command-centre screenshots | None in Member 4 scope. |
| FA-04 | done | `frontend/test/guards.test.tsx`; `frontend/src/shell/`; browser checks for keyboard focus and empty storage | Real MetaMask/SIWE role walkthrough remains manual. |
| FA-05 | done | `frontend/test/participants.test.tsx`, `frontend/test/participants-container.test.tsx`, `frontend/test/docket.test.tsx`; live-data containers and gallery states | No real backend/chain was started, so deployed-data integration remains part of the manual walkthrough. |
| FA-06 | partial | `frontend/test/create-exam-validation.test.ts`, `frontend/test/create-exam.test.tsx`, `frontend/test/key-ceremony.test.tsx`; desktop/mobile wizard and ceremony screenshots | The current `@sigil/core` ceremony does not explicitly zero all internal key/share buffers. The frozen section 7 prose also differs from the checked-in `openCollection` and `commitRandomness` ABI signatures. See `docs/HANDOFF.md`; no frozen interfaces were changed. |
| FA-07 | partial | `frontend/test/command-centre.test.tsx`; desktop/mobile command-centre screenshots | `shareVerified` is not tracked by the current readiness response; `useExamCommandCentre` is requested from Member 5; contract exact-quota behavior differs from the spec's at-least-quota rule. See `docs/HANDOFF.md`. |
| FA-08 | done | `frontend/test/errors.test.ts` (34 tests) | None in Member 4 scope. |
| FA-09 | done | `frontend/test/setter-import.test.ts`, `frontend/test/setter-pages.test.tsx`, `frontend/test/setter-workflow.test.ts`, `frontend/test/setter-container.test.tsx` | The optional `useExamSectionTotals` hook is requested from Member 5; current thin containers use the checked-in ABI. |
| FA-10 | partial | `frontend/test/holder-container.test.tsx`, `frontend/test/holder-pages.test.tsx`; desktop/mobile Holder screenshots | `useHolderExamStatus` is requested from Member 5. Component cleanup is best-effort and cannot promise physical JavaScript/WebCrypto zeroization; `submitShare` intentionally publishes the share on-chain at release. See `docs/HANDOFF.md`. |
| FA-11 | partial | `scripts/verify-gallery-responsive.mjs`; 168 desktop/mobile screenshots; frontend test suite; production CSP build and preview | All captured-page axe scans are clean. The open Radix Select menu has the library-only full-document finding listed under FA-02. Real-stack and wallet checks remain manual. |

## Section 18 acceptance items applicable to Member 4

| Acceptance item | Result | Evidence or remaining work |
|---|---|---|
| No hard-coded operational exams, questions, users, hashes, or statistics | pass for Member 4 routes | Sample records are rendered only by `/dev/gallery` and tests; operational containers use live hooks/API/chain reads. |
| Signed transactions use the correct role and lifecycle | implemented; manual integration pending | Page containers call the checked-in ABI through TxDrawer and the FA-08 decoder. Walk each role with real MetaMask during the final real-stack test. |
| Section 11 validation has clear inline errors | pass for covered Member 4 forms | Wizard and composer validation tests cover the specified bounds and invalid inputs. |
| Secrets stay out of browser storage and are not rendered after use | pass in tests and headless gallery checks | Holder container tests assert no test passphrase/key/share/reveal appears in the DOM after use and spy on storage writes. Core's internal ceremony-buffer zeroization remains open. |
| UI passes axe and keyboard-only operation | pass with one library note | 174 axe runs found no captured-page/menu-root violations; keyboard order, visible focus, arrow-key select/tab navigation, Escape, and focus restoration are exercised. Radix's full-document open-select behavior is documented in `docs/HANDOFF.md`. |
| Report honestly lists section 3.5 limitations | done | `docs/report/member4-interface.md` |

Verification executed for this audit: `@sigil/ui` 5/5 tests, `@sigil/frontend` 161/161 tests, `@sigil/core` 17/17 tests; UI/frontend typechecks and frontend production build passed. Browser checks ran against headless Chrome at 1280px and 390px. No backend, database, or chain was started.
