# Threat Model

This document expands every threat, security control, and residual risk analyzed in **Section 13 of the SIGIL Master Project Document** into detailed paragraphs. For each control, an **Evidence** entry cites the exact test file and test title in `contracts/test` proving the control on-chain, or explicitly notes pending work for components owned by other team members (`@sigil/core`, backend, frontend).

---

## Threat Matrix Overview

| Stage | Threat | Primary Control | Residual Risk |
|---|---|---|---|
| **Setting** | A setter leaks their questions | Question bank over-provisioning & random selection | Setter knows their own questions may appear |
| **Setting** | Authority reads the paper early | Shamir secret sharing & contract timelock gate | Authority trusted during ceremony execution |
| **Storage** | Database admin swaps or edits ciphertext | On-chain `bankHash` & AES-256-GCM authentication | Availability/denial of service |
| **Storage** | Backend compromised | Zero-knowledge backend architecture (no keys) | Denial of service |
| **Key Custody** | One holder is bribed | Strict majority threshold ($n/2 < t \le n$) | $t$ holders colluding off-chain |
| **Key Custody** | Rogue holder submits a fake share | Verifiable on-chain share commitment checking | None for poisoning |
| **Release** | Officials try to release early | Contract rejects submissions before `releaseOpensAt` | $t$ holders pooling off-chain (mitigated by tlock in P2) |
| **Release** | Holders unavailable | $(n - t)$ fault tolerance & cancellation fallback | Exam delay or rescheduling |
| **Randomness** | Seed is biased | Pre-committed randomness reveals & deterministic ordering | Last-revealer bias (VRF/drand in production) |
| **Printing** | Press or courier leaks the paper | Local decryption and printing at examination centre | Insider at the centre |
| **Centre** | Paper is photographed and leaked | Per-centre structural variants & registered fingerprints | Attribution is to a centre variant, not a person |
| **Identity** | Impersonation of candidates | Candidate roster Merkle root verification | Prototype does not verify biometrics |
| **Governance** | Admin abuses role changes | Immutable audit events & active exam lock | Prototype uses single admin |
| **Frontend** | XSS or malicious extension steals keys | Strict CSP, memory scrubbing, encrypted keystore | Compromised host machine/browser |
| **Replay** | Ciphertext or commitment reused across exams | Domain-separated AAD & exam-bound commitments | None identified |
| **Post-release** | Outsider obtains ciphertext and public shares | Backend access gating & short release window | Short operational window |

---

## Detailed Threat Analysis & Evidence

### 1. Setting: A setter leaks their questions

- **Threat:** A paper setter who authors questions attempts to leak or sell their submitted questions before the examination takes place.
- **Control:** The question bank is intentionally over-provisioned (the total questions in each section must meet or exceed the section quota). The final questions for the examination are selected pseudo-randomly using the canonical multi-party release seed revealed only upon release. The setter cannot predict which questions will be selected nor their final order. In the smart contract, `sealExam` enforces strict quota requirements before the exam can advance.
- **Residual Risk:** A setter knows that their specific submitted questions might appear in the bank, although they cannot determine if they will be chosen or what option ordering will be assigned.
- **Evidence:**
  - `contracts/test/ExamVault.test.ts` > `Exam Sealing (SC-05)` > `should revert QuotaNotMet if section question total is less than quota`
  - `contracts/test/ExamVault.test.ts` > `Exam Sealing (SC-05)` > `should revert QuotaNotMet if section question total exceeds quota`
  - Random paper selection algorithm: `Pending: Member 2, CR-07`
  - Cross-language test vectors: `Pending: Member 1, SC-08`

---

### 2. Setting: Authority reads the paper early

- **Threat:** An Exam Authority official or insider attempts to inspect or decrypt question batches before the scheduled release window.
- **Control:** The exam private key scalar is generated during the key ceremony, split into $n$ Shamir secret shares with threshold $t$, and individually encrypted to the registered P-256 public keys of assigned holders. The ceremony overwrites its mutable scalar/share buffers on success and failure and drops references to the exported JWK and conversion strings. The smart contract strictly enforces that no share submissions are accepted before `releaseOpensAt`.
- **Residual Risk:** Cleanup is best-effort only. JavaScript strings, WebCrypto and runtime/library copies cannot be physically zeroized or verified, so the Exam Authority's browser remains trusted during client-side key generation.
- **Evidence:**
  - `contracts/test/ExamVault.test.ts` > `Threshold Release & Submit Share (SC-06)` > `Time boundary validations (1 second before and after each boundary)` > `should revert TooEarly exactly 1 second before releaseOpensAt`
  - Ephemeral key ceremony buffer cleanup: `packages/core/test/ceremony.test.ts` (`runCeremony secret cleanup`)
  - Shamir secret splitting: `Pending: Member 2, CR-04`

---

### 3. Storage: Database admin swaps or edits ciphertext

- **Threat:** A database administrator, cloud provider operator, or attacker with direct database access attempts to modify, swap, or corrupt question batch ciphertexts.
- **Control:** When an exam is sealed, `ExamVault` computes and immutably records `bankHash = keccak256(abi.encodePacked(batchHashes))` across all batch ciphertext hashes in submission order. In addition, AES-256-GCM authenticated encryption ensures that any payload tampering causes cryptographic decryption failure.
- **Residual Risk:** Zero risk of undetected tampering or payload swapping. Withholding ciphertext (denial of service) remains an operational risk.
- **Evidence:**
  - `contracts/test/ExamVault.test.ts` > `Exam Sealing (SC-05)` > `should successfully seal exam, compute exact bankHash, transition state to Sealed, and emit ExamSealed`
  - AES-256-GCM envelope tamper rejection: `Pending: Member 2, CR-03`

---

### 4. Storage: Backend compromised

- **Threat:** An adversary breaches the backend Node/Express server, gaining root access and control of the database and filesystem.
- **Control:** The backend architecture is strictly zero-knowledge with respect to cryptographic keys: it stores only encrypted ciphertext envelopes, public keys, and indexed public blockchain events. It holds no decryption keys, holds no holder passphrases, and never signs blockchain transactions.
- **Residual Risk:** An attacker can disrupt service availability (denial of service), but cannot read plaintext questions or forge blockchain transactions.
- **Evidence:**
  - Backend zero-knowledge ciphertext storage: `Pending: Member 3, BE-05`
  - Holder share access isolation: `Pending: Member 3, BE-06`

---

### 5. Key Custody: One holder is bribed

- **Threat:** An attacker bribes, coerces, or compromises one or more key holders in an attempt to decrypt the question bank prematurely.
- **Control:** The smart contract enforces a strict majority threshold during exam creation ($n/2 < t \le n$, where $3 \le n \le 20$). Possession of fewer than $t$ shares yields zero information regarding the private key under Shamir secret sharing.
- **Residual Risk:** A colluding coalition of at least $t$ holders sharing secrets out-of-band could reconstruct early (mitigated in production/P2 with cryptographic timelock encryption / tlock).
- **Evidence:**
  - `contracts/test/ExamVault.test.ts` > `Exam Creation (SC-03)` > `Threshold & Panel validations` > `should revert InvalidThreshold if threshold <= holders.length / 2`
  - `contracts/test/ExamVault.test.ts` > `Exam Creation (SC-03)` > `Threshold & Panel validations` > `threshold boundary cases: n=3`
  - `contracts/test/ExamVault.test.ts` > `Exam Creation (SC-03)` > `Threshold & Panel validations` > `threshold boundary cases: n=4`
  - `contracts/test/ExamVault.test.ts` > `Exam Creation (SC-03)` > `Threshold & Panel validations` > `threshold boundary cases: n=5`
  - Shamir $(t, n)$ reconstruction validation: `Pending: Member 2, CR-04`

---

### 6. Key Custody: Rogue holder submits a fake share

- **Threat:** A rogue, corrupt, or compromised key holder deliberately submits an invalid or poisoned share upon release to sabotage the reconstruction process.
- **Control:** Verifiable secret sharing is enforced on-chain. Each holder commits their share hash `keccak256(abi.encode(examId, holder, share))` during the `Collecting` phase. Upon `submitShare`, `ExamVault` validates the submission against the stored commitment, rejecting poisoned shares with `InvalidShare`.
- **Residual Risk:** Zero risk of reconstruction poisoning; a rogue holder merely forfeits their contribution, which the $(n - t)$ redundancy tolerates.
- **Evidence:**
  - `contracts/test/ExamVault.test.ts` > `Threshold Release & Submit Share (SC-06)` > `Payload and Commitment validations` > `should revert InvalidShare if wrong share bytes are submitted`

---

### 7. Release: Officials try to release early

- **Threat:** Corrupt officials or key holders attempt to broadcast shares and release the exam before the authorized time window.
- **Control:** The contract enforces blockchain-verified time gates: `releaseOpensAt <= block.timestamp <= examEndsAt`. Calls to `submitShare` before `releaseOpensAt` revert with custom error `TooEarly`.
- **Residual Risk:** A collusion of $t$ holders pooling shares off-chain could decrypt early if they possess the ciphertext bank (production mitigation: drand/tlock).
- **Evidence:**
  - `contracts/test/ExamVault.test.ts` > `Threshold Release & Submit Share (SC-06)` > `Time boundary validations (1 second before and after each boundary)` > `should revert TooEarly exactly 1 second before releaseOpensAt`

---

### 8. Release: Holders unavailable

- **Threat:** Key holders experience power failure, connectivity loss, or key loss during the release window, threatening exam commencement.
- **Control:** $(n - t)$ redundancy ensures that any $t$ available holders suffice to release the paper. If catastrophic failure leaves fewer than $t$ holders available, the Authority can call `cancelExam` with an on-chain reason hash, cleanly aborting the exam and freeing holder locks.
- **Residual Risk:** Exam delay or rescheduling if fewer than $t$ holders submit their shares within the release window.
- **Evidence:**
  - `contracts/test/ExamVault.test.ts` > `Threshold Release & Submit Share (SC-06)` > `Threshold Release State Transitions and Seed Calculation` > `state changes to Released exactly at the t-th submission and computes exact canonical seed`
  - `contracts/test/ExamVault.test.ts` > `SC-07: Post-Release, Maintenance & Lifecycle` > `cancelExam` > `should cancel from Sealed state and decrement liveExamCount`

---

### 9. Randomness: Seed is biased

- **Threat:** A participating holder attempts to select or manipulate their randomness contribution to influence question selection or variant permutations.
- **Control:** A commit-reveal protocol is enforced: holders commit their randomness hash `keccak256(abi.encode(examId, holder, reveal))` during `Collecting`. At release, reveals are checked against commitments, and the canonical seed is derived by hashing reveals strictly ordered by original panel index (`keccak256(abi.encode(examId, reveals))`).
- **Residual Risk:** Last-revealer bias: the $t$-th submitter choosing whether to submit or withhold among multiple active holders has marginal influence over which subset of $t$ reveals is included (production upgrade: Chainlink VRF or drand).
- **Evidence:**
  - `contracts/test/ExamVault.test.ts` > `Threshold Release & Submit Share (SC-06)` > `Payload and Commitment validations` > `should revert InvalidReveal if wrong reveal bytes32 is submitted`
  - `contracts/test/ExamVault.test.ts` > `Threshold Release & Submit Share (SC-06)` > `Threshold Release State Transitions and Seed Calculation` > `state changes to Released exactly at the t-th submission and computes exact canonical seed`

---

### 10. Printing: Press or courier leaks the paper

- **Threat:** A commercial printing facility or physical transport courier copies or leaks physical examination papers ahead of exam day.
- **Control:** Physical printing presses and transport couriers are completely eliminated from the pre-exam custody chain. The question bank remains encrypted until the release window opens, and papers are decrypted, generated as unique structural variants, and printed locally at each examination centre immediately before the exam.
- **Residual Risk:** Malicious staff inside a local examination centre (addressed by per-centre variant tracing).
- **Evidence:**
  - Centre Paper station and local print pipeline: `Pending: Member 5, FB-04`

---

### 11. Centre: Paper is photographed and leaked

- **Threat:** An exam centre insider, proctor, or student photographs and leaks the paper during or immediately prior to the exam session.
- **Control:** Each exam centre is assigned a unique structural variant (distinct question order and option order) whose cryptographic fingerprint (`variantHash`) is registered on-chain via `registerCopy`. An auditor can input leaked text or images into the leak tracer to identify the matching centre variant and record a verifiable report via `reportLeak`.
- **Residual Risk:** Tracing identifies the specific examination centre variant and set code rather than a specific individual person.
- **Evidence:**
  - `contracts/test/ExamVault.test.ts` > `SC-07: Post-Release, Maintenance & Lifecycle` > `registerCopy` > `should allow registration between releaseOpensAt and examEndsAt (no lower bound at examStartsAt)`
  - `contracts/test/ExamVault.test.ts` > `SC-07: Post-Release, Maintenance & Lifecycle` > `reportLeak` > `(e) correct match succeeds and emits LeakReported`
  - Leak matching algorithm: `Pending: Member 2, CR-09`
  - Leak tracer interface: `Pending: Member 5, FB-05`

---

### 12. Identity: Impersonation of candidates

- **Threat:** Unauthorized individuals attempt to sit for the exam using fraudulent credentials or impersonation.
- **Control:** The Exam Authority can publish an immutable candidate roster Merkle root on-chain via `publishRoster`. At the exam centre, admit cards are cryptographically verified against the published Merkle root (P1), with zero-knowledge identity proofs planned for P2.
- **Residual Risk:** Cryptographic verification confirms admit card inclusion in the authorized roster, but does not perform physical biometric authentication in the prototype.
- **Evidence:**
  - `contracts/test/ExamVault.test.ts` > `SC-07: Post-Release, Maintenance & Lifecycle` > `publishRoster` > `should succeed in Draft state`
  - `contracts/test/ExamVault.test.ts` > `SC-07: Post-Release, Maintenance & Lifecycle` > `publishRoster` > `should succeed in Collecting state`
  - `contracts/test/ExamVault.test.ts` > `SC-07: Post-Release, Maintenance & Lifecycle` > `publishRoster` > `should succeed in Sealed state`
  - Candidate admit-card proof verification at centre: `Pending: Member 5, FB-08`

---

### 13. Governance: Admin abuses role changes

- **Threat:** An administrative account maliciously grants roles to unauthorized accounts or revokes legitimate officials to compromise an ongoing exam.
- **Control:** Every participant registration and revocation emits an immutable on-chain event (`ParticipantRegistered`, `ParticipantRevoked`). Furthermore, `ExamVault` enforces `HolderInLiveExam` invariants, preventing the Admin from revoking or changing keys for holders currently assigned to active exams (`Draft`, `Collecting`, `Sealed`).
- **Residual Risk:** In the prototype, governance is held by a single admin account; production systems would mandate a multi-signature wallet (e.g., Safe) or DAO timelock.
- **Evidence:**
  - `contracts/test/ExamVault.test.ts` > `Deployment & Configuration (SC-01)` > `should set deployer as DEFAULT_ADMIN_ROLE`
  - `contracts/test/ExamVault.test.ts` > `Participant Registry (SC-02)` > `should allow admin to register participants across all 5 roles`
  - `contracts/test/ExamVault.test.ts` > `Exam Creation (SC-03)` > `should prevent holder from revoking or changing key while in a live exam`

---

### 14. Frontend: XSS or malicious extension steals keys

- **Threat:** A cross-site scripting (XSS) payload or rogue browser extension attempts to extract holder private keys or passphrases.
- **Control:** Strict Content Security Policy (CSP), sanitised rendering (no `dangerouslySetInnerHTML`), PBKDF2/AES-GCM passphrase-encrypted keystore files, zero storage of raw private keys or passphrases in `localStorage` or cookies, and memory wiping after key ceremonies.
- **Residual Risk:** A fully compromised client device or browser runtime with debugger inspection can capture keystrokes or volatile memory.
- **Evidence:**
  - Keystore PBKDF2/AES-GCM encryption: `Pending: Member 2, CR-05`
  - CSP and Frontend security configuration: `Pending: Member 4, FA-01`
  - Key Holder keystore interface: `Pending: Member 4, FA-10`

---

### 15. Replay: A ciphertext or commitment reused across exams

- **Threat:** An adversary attempts to replay encrypted question batches, share commitments, or randomness reveals from one exam into another.
- **Control:** All cryptographic envelopes bind additional authenticated data (AAD) formatted as `SIGIL/v1:{examId}:{purpose}:{context}`. All contract commitments (`shareCommitment`, `randomnessCommitment`, `seed`) explicitly include `examId` and `msg.sender` in their hash preimage. Duplicate batch hashes in the same exam are rejected with `DuplicateEntry`.
- **Residual Risk:** None identified; domain separation and exam binding guarantee replay protection across exams and roles.
- **Evidence:**
  - `contracts/test/ExamVault.test.ts` > `Collection Phase (SC-04)` > `submitBatch` > `should revert DuplicateEntry if repeated ciphertextHash is submitted within the same exam`
  - `contracts/test/ExamVault.test.ts` > `Threshold Release & Submit Share (SC-06)` > `Payload and Commitment validations` > `should revert InvalidShare if wrong share bytes are submitted`
  - Domain-separated envelope AAD: `Pending: Member 2, CR-03`

---

### 16. Post-release: Outsider obtains ciphertext and public shares

- **Threat:** An unauthorized outsider downloads question batch ciphertexts and intercepts public shares broadcast on the ledger upon release, attempting to reconstruct the question paper.
- **Control:** The backend API gates batch ciphertext downloads (`GET /api/exams/:id/batches`) exclusively to authenticated and assigned exam centres and auditors once the exam is `Released`. Furthermore, the release window between release and exam commencement is tightly constrained (under 6 hours, typically 30–60 minutes).
- **Residual Risk:** Once shares are published on-chain, paper secrecy depends on backend access control and brevity of the release window. Production upgrade: re-encrypting shares to centre-specific public keys.
- **Evidence:**
  - Backend batch download access gating: `Pending: Member 3, BE-05`
  - Contract release state machine gate: `contracts/test/ExamVault.test.ts` > `Threshold Release & Submit Share (SC-06)` > `Threshold Release State Transitions and Seed Calculation` > `state changes to Released exactly at the t-th submission and computes exact canonical seed`
