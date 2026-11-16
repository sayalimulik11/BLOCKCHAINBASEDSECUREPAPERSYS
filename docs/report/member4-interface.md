# Member 4: interface and user flows

## Design language and shell

The interface uses the SIGIL security-paper palette: mist page backgrounds, sheet panels, ink text and actions, slate secondary text, hairline dividers, marigold current/focus states, and verified/alert colors for outcomes. It uses offline Atkinson Hyperlegible fonts, square threshold notches, round custody bubbles, dashed permanent-action Coupons, mono serials and hashes, and a slightly rotated state stamp. The operational pages use dense ledger tables and a 1200px content maximum; at phone width, layouts stack and wide tables scroll inside their own wrappers.

The project layout diagram in section 10.4 shows a left navigation rail. The delivered shell uses a top bar instead, as explicitly approved for Member 4: role-aware links remain in one responsive header, with wallet, network, chain-time, and transaction chips alongside them. This is the approved shell layout, not a change to any frozen section 6–9 interface.

## Authentication and role flows

The user connects a wallet, signs in with SIWE, and receives navigation and guards based on the role resolved from the chain. The interface does not treat a client-provided role as authoritative. Separate guards explain sign-in, wallet connection, wrong network, and missing role states.

- **Admin:** review the participant ledger, filter by role, register a checksummed address with its profile hash, or revoke through a confirmation Coupon. The contract remains authoritative for refusing revocation of a holder in a live exam.
- **Authority:** inspect the exam docket, create an exam through the six-step wizard, review canonical metadata, and sign the create transaction. The key ceremony runs in the browser, encrypts holder shares with `@sigil/core`, uploads encrypted material, then opens collection on-chain. The command centre displays chain-derived custody, readiness, quotas, and lifecycle Coupons.
- **Setter:** select an assigned exam and section, author or import questions, inspect row-level errors, preview the batch, then follow visible encrypt, upload, sign, and confirmation stages. Question text is rendered as text.
- **Holder:** create an encrypted `.sigilkey` with a passphrase, download it once, and register the public key. The holder retrieves only their encrypted share, unlocks and verifies it in the browser against the on-chain commitment, and commits randomness through the checked-in ABI. At release, the `submitShare` transaction publishes the verified share and reveal on-chain as required by section 5 phase 5.

All page data comes from the merged hooks, generated API client, or checked-in contract ABI through thin containers. Gallery examples and test fixtures are not operational-route data.

## Trust model and limitations

The interface describes the prototype without claiming leak-proof custody:

- The Authority's browser runs the key ceremony, so the Authority is trusted to discard the generated key. Production should use distributed key generation.
- Once the threshold of shares is published at release, the exam key is effectively public. Secrecy then depends on access to the encrypted bank and a short exam window; production should re-encrypt shares to centre-specific keys.
- The contract gates on-chain submission, but threshold holders could pool shares off-chain. A true time-lock would add a second cryptographic barrier.
- Commit-reveal randomness has last-revealer bias; production should use VRF or drand.
- A decrypted paper can be photographed. Variant tracing can identify a centre's version, not the person who leaked it.
- On-chain data is visible to every node; the design stores hashes, public keys, roles, and events rather than the encrypted bank.
- The prototype uses a single-node local chain. Production permissioning must also restrict nodes and validators.

The `submitShare` transaction is the deliberate release-time exception for plaintext shares: it publishes the share on-chain by protocol design, and is the only point at which a share leaves the holder's browser. The browser does not send a plaintext share, passphrase, private key, or reveal to the metadata/share API or storage.

Memory clearing is best effort. The frontend clears passphrase fields and component references and overwrites mutable byte buffers where available. JavaScript strings and engine copies are not reliably zeroizable. The current `@sigil/core` ceremony also does not explicitly zero all of its internal key/share buffers on every path; this remains an owner follow-up recorded in `docs/HANDOFF.md`.

## Visual and accessibility verification

The gallery was opened in real headless Chrome at 1280px and 390px. The final responsive run captured 168 screenshots, confirmed both `window.innerWidth` values, found no page-level horizontal overflow, no console errors, and empty local and session storage. The production preview passed the same gallery checks under its build-only CSP. Loading-to-ready heights differ by less than 2% for all measured page states.

The browser audit found no axe violations in the captured page states or the select-menu root, checked keyboard order and visible marigold focus, verified select and tab arrow navigation, and checked Escape/focus restoration for overlays. Radix Select's modal open state causes a full-document `aria-hidden-focus` report on its hidden background siblings; the component API exposes no `modal` option. This library behavior is documented in `docs/HANDOFF.md`. Reduced-motion emulation disables animations and transitions. WCAG color-contrast checks passed across the captured page states, including dimmed Coupon reasons.

Production CSP:

```text
default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' <configured origins>
```

Deployers set `SIGIL_CSP_CONNECT_SRC` to `'self'` and the API/RPC HTTP(S) origins at build time. `unsafe-eval` is not allowed. Inline styles remain permitted because current React views use style attributes; bundled offline fonts load from the same origin.

## Figures

- Admin participants, ready state: [desktop](../screenshots/desktop-participants-populated.png), [mobile](../screenshots/mobile-participants-populated.png).
- Authority docket, populated state: [desktop](../screenshots/desktop-docket-populated.png), [mobile](../screenshots/mobile-docket-populated.png).
- Create Exam review and sign: [desktop](../screenshots/desktop-create-exam-step-6-review-and-sign.png), [mobile](../screenshots/mobile-create-exam-step-6-review-and-sign.png).
- Key Ceremony, ready state: [desktop](../screenshots/desktop-key-ceremony-ready.png), [mobile](../screenshots/mobile-key-ceremony-ready.png).
- Command centre, Released: [desktop](../screenshots/desktop-command-centre-released.png), [mobile](../screenshots/mobile-command-centre-released.png).
- Setter assignments: [desktop](../screenshots/desktop-fa09-setter-assignments-ready.png), [mobile](../screenshots/mobile-fa09-setter-assignments-ready.png).
- Question Composer: [desktop](../screenshots/desktop-fa09-question-composer-ready.png), [mobile](../screenshots/mobile-fa09-question-composer-ready.png).
- Holder assignments: [desktop](../screenshots/desktop-fa10-holder-assignments-ready.png), [mobile](../screenshots/mobile-fa10-holder-assignments-ready.png).
- Holder release console: [desktop](../screenshots/desktop-fa10-holder-console-flow-ready-to-release.png), [mobile](../screenshots/mobile-fa10-holder-console-flow-ready-to-release.png).
- Guard screens: [desktop set](../screenshots/desktop-guard-sign-in.png), [mobile set](../screenshots/mobile-guard-sign-in.png); the other guard states use the matching `desktop-guard-*` and `mobile-guard-*` files.
