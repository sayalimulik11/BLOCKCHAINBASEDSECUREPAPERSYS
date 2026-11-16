# Member 4 pre-push checklist

Run these checks from the repository root before publishing the branch. This checklist does not authorize a push or pull request; wait for Member 4's explicit approval.

## Install, tests, typecheck, and build

```powershell
pnpm install
pnpm test
pnpm --filter @sigil/ui test
pnpm --filter @sigil/frontend test
pnpm --filter @sigil/core test
pnpm --filter @sigil/ui typecheck
pnpm --filter @sigil/frontend typecheck
pnpm --filter @sigil/frontend build
```

`@sigil/ui` has no separate build script; it is typechecked and bundled as part of the frontend build. The `pnpm test` workspace command runs all packages, including the targeted packages listed separately above.

## Manual real-stack walkthrough

1. Configure `backend/.env` with the local database, SIWE, API, and chain settings. Start a local PostgreSQL database using the repository's configured development setup.
2. From the repository root, start the chain, API/database orchestration, and frontend:

   ```powershell
   pnpm dev:all
   ```

   Confirm the API health endpoint and frontend are reachable before using MetaMask.
3. Use a real MetaMask wallet connected to the configured local chain. Sign in with SIWE and verify that the role displayed by the shell matches the role assigned on-chain.
4. Walk each available role and its owned pages:
   - **Admin:** filter participants; register an address and profile hash; revoke a participant; verify that an in-use holder is rejected with a decoded message.
   - **Authority:** create an exam with valid metadata; inspect invalid wizard submissions; run the key ceremony; verify the holder-key checks; open collection; inspect every command-centre state and Coupon; confirm seal blockers and typed cancellation.
   - **Setter:** author a valid question, exercise validation errors, import valid and invalid JSON/CSV, preview, submit a batch, and inspect pending and confirmed history.
   - **Holder:** create and download a `.sigilkey` once; register the public key; fetch and verify the encrypted share; commit randomness; test early, invalid, duplicate, late, and unassigned share submissions; confirm release and secret-field cleanup.
   - **Other roles and unauthenticated sessions:** verify role-appropriate navigation, direct-route denial, wrong-network, wallet, and SIWE guards.
5. Confirm transactions are signed by the connected role, failures use the FA-08 decoder, no plaintext secret is written to browser storage, and the share becomes public only in the release-time `submitShare` transaction.
6. Stop the local stack and record any backend, contract, or hook issue against its owner before release.

## Open owner items

- **Member 2:** zero core ceremony key/share buffers on success and failure; reconcile the frozen section 7 prose with `openCollection(uint256,bytes)` and `commitRandomness(uint256,bytes32,bytes32)`.
- **Member 1 / contract owner:** reconcile the spec's at-least-quota sealing rule with `ExamVault.sealExam` exact-quota behavior.
- **Member 5:** optional `useExamCommandCentre(examId, options)`, `useExamSectionTotals(examId, options)`, and `useHolderExamStatus(examId, holder, options)` hooks. Their exact signatures and current thin-container reads are in `docs/HANDOFF.md`.
- **Library review:** Radix Select's modal open state currently creates a full-document `aria-hidden-focus` axe finding on hidden background controls; its current Root API does not expose a `modal` option.
- **Manual release test:** real database/chain/MetaMask walkthrough above. This environment did not start or validate the real stack.

## Production CSP

The production build injects this policy; dev mode does not:

```text
default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' <configured origins>
```

Set `SIGIL_CSP_CONNECT_SRC` at build time to `'self'` plus the configured API and RPC HTTP(S) origins. The build rejects other source forms. `unsafe-eval` is not allowed. The inline style allowance supports existing React style attributes; offline fonts are same-origin assets.

## Publish only after approval

After Member 4 approves, push the branch and open a PR with:

```powershell
git push --set-upstream origin member4/design-system
gh pr create --base main --head member4/design-system --title "SIGIL Member 4 final frontend" --body "Completes FA-11 accessibility and quality review, audits FA-01 through FA-11, and documents remaining owner and manual integration checks."
```

Do not run either command until approval is explicit.

WARNING: revert uncommitted patch in frontend/src/hooks/useParticipants.ts before commit/push: git checkout -- frontend/src/hooks/useParticipants.ts

WARNING: temporary indexer runner (OS temp) is a workaround; do not commit. Stop it with Stop-Process -Id <pid> or taskkill.

WARNING: revert uncommitted hook patch: git checkout -- frontend/src/hooks/useParticipants.ts
