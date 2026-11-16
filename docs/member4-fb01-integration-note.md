# Member 4 integration note: FB-01 hooks

## Scope and status

This note documents the FB-01 hook surface as implemented in code. It reflects the actual exported TypeScript interfaces in `frontend/src/hooks/` and the wallet-backed contract wiring expected by those hooks. It is intentionally limited to the data-access layer and does not claim page-level or design-system integration.

## Files in scope

- `frontend/src/hooks/useParticipants.ts`
- `frontend/src/hooks/useExams.ts`
- `frontend/src/hooks/index.ts`

## Hook exports

The barrel file exports the following names:

```ts
export * from "./useParticipants";
export * from "./useExams";
```

### `useParticipants`

Signature:

```ts
useParticipants(options: { enabled?: boolean; limit?: number } = {}): UseParticipantsResult
```

Options:

- `enabled?: boolean` - defaults to `true`
- `limit?: number` - defaults to `250`

Return value:

```ts
{
  participants: ParticipantRecord[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<ParticipantRecord[]>;
}
```

Related types:

```ts
export type ParticipantRole = "AUTHORITY" | "SETTER" | "HOLDER" | "CENTRE" | "AUDITOR";

export interface ParticipantRecord {
  address: string;
  roles: ParticipantRole[];
  displayName: string | null;
  organisation: string | null;
  profileHash: string | null;
}
```

Behavior:

- Reads participant state from the event stream, not from a dedicated participant REST endpoint.
- Calls:
  - `GET /api/events?type=ParticipantRegistered&limit=250`
  - `GET /api/events?type=ParticipantRevoked&limit=250`
- Merges the two event sets via `mergeParticipantEvents(...)`.
- Slices the final array to `limit` in `refetch()`.
- Responds to shared invalidation via `notifyParticipantsChanged()` and `subscribeToParticipantsRefresh(...)`.

### `useRegisterParticipant`

Signature:

```ts
useRegisterParticipant(
  options: UseRegisterParticipantOptions = {},
): UseParticipantMutationResult<ParticipantRegistrationInput>
```

Options:

```ts
export interface UseRegisterParticipantOptions {
  contract?: ParticipantRegistryContract | null;
  onSubmit?: (
    input: ParticipantRegistrationInput,
    contract: ParticipantRegistryContract | null,
  ) => Promise<ParticipantRecord | void>;
}
```

Input type:

```ts
export interface ParticipantRegistrationInput {
  address: string;
  role: ParticipantRole;
  profileHash?: string | null;
}
```

Return value:

```ts
{
  mutate: (input: ParticipantRegistrationInput) => Promise<ParticipantRecord>;
  isPending: boolean;
  error: Error | null;
}
```

Required contract interface for real on-chain writes:

```ts
export interface ParticipantRegistryContract {
  registerParticipant: (
    account: string,
    role: number,
    profileHash: string,
  ) => Promise<TransactionResponseLike>;
  revokeParticipant: (
    account: string,
    role: number,
  ) => Promise<TransactionResponseLike>;
}
```

Transaction response contract used by the hook:

```ts
export interface TransactionReceiptLike {
  status: number | null | undefined;
  blockNumber?: number | null;
  transactionHash?: string;
}

export interface TransactionResponseLike {
  wait: (confirmations?: number) => Promise<TransactionReceiptLike | null>;
}
```

Mutation behavior:

- Validates that `address` is a 40-byte hex address.
- Validates that `role` is a recognized `ParticipantRole`.
- Normalizes `profileHash` to a 32-byte hex string when present.
- When a real wallet-backed contract instance is supplied, the hook calls:
  - `contract.registerParticipant(address, roleToContractId(role), normalizedProfileHash)`
- The hook then calls `await tx.wait()` and rejects if the receipt is missing or has `status === 0`, `null`, or `undefined`.
- After a successful mined transaction, it calls `notifyParticipantsChanged()` so `useParticipants()` refreshes.
- The `onSubmit` callback is optional and is a custom submit path; it is not a substitute for the wallet-backed `tx.wait()` flow when using the real contract path.

### `useRevokeParticipant`

Signature:

```ts
useRevokeParticipant(
  options: UseRevokeParticipantOptions = {},
): UseParticipantMutationResult<ParticipantRevocationInput>
```

Options:

```ts
export interface UseRevokeParticipantOptions {
  contract?: ParticipantRegistryContract | null;
  onSubmit?: (
    input: ParticipantRevocationInput,
    contract: ParticipantRegistryContract | null,
  ) => Promise<ParticipantRecord | void>;
}
```

Input type:

```ts
export interface ParticipantRevocationInput {
  address: string;
  role: ParticipantRole;
}
```

Return value:

```ts
{
  mutate: (input: ParticipantRevocationInput) => Promise<ParticipantRecord>;
  isPending: boolean;
  error: Error | null;
}
```

Mutation behavior:

- Validates `address` and `role` before sending the request.
- When a real wallet-backed contract instance is supplied, the hook calls:
  - `contract.revokeParticipant(address, roleToContractId(role))`
- Requires `await tx.wait()` and rejects any failed or reverted receipt.
- Calls `notifyParticipantsChanged()` only after a successful mined receipt.

### `useExams`

Signature:

```ts
useExams(options: UseExamsOptions = {}): UseExamsResult
```

Options type:

```ts
export interface UseExamsOptions {
  enabled?: boolean;
  assignedOnly?: boolean;
  userAddress?: string | null;
  contract?: ExamPanelContract | null;
}
```

Return value:

```ts
export interface UseExamsResult {
  exams: ExamSummary[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<ExamSummary[]>;
}
```

Exam summary type:

```ts
export interface ExamSummary {
  examId: string;
  chainId: number;
  state: number;
  metaHash: string;
  releaseOpensAt: string;
  examStartsAt: string;
  examEndsAt: string;
  threshold: number;
  bankHash: string | null;
  seed: string | null;
}
```

Behavior:

- Reads `GET /api/exams` by default.
- With `assignedOnly: true`, the hook requires both `userAddress` and a wallet-backed `contract`.
- `assignedOnly` uses `contract.getPanel(examId)` to inspect holders, setters, and centres.
- It also falls back to `contract.getExam(examId)` and compares the `authority` field to the normalized user address.
- If neither condition matches, the exam is filtered out.

Required exam panel contract shape:

```ts
export interface ExamPanelContract {
  getExam: (examId: bigint) => Promise<{ authority?: string; state?: number }>;
  getPanel: (examId: bigint) => Promise<[string[], string[], string[]]>;
}
```

Important: `assignedOnly` is conditional. If `userAddress` or `contract` is missing, it throws an error instead of silently returning the full list.

### `useExamPanel`

Signature:

```ts
useExamPanel(
  examId: string | number | null | undefined,
  options: UseExamPanelOptions = {},
)
```

Options type:

```ts
export interface UseExamPanelOptions {
  contract?: ExamPanelContract | null;
}
```

Return value:

```ts
{
  holders: string[];
  setters: string[];
  centres: string[];
  totalMembers: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<{ holders: string[]; setters: string[]; centres: string[] }>;
}
```

Behavior:

- Accepts a nullable exam id.
- Requires `contract.getPanel(BigInt(normalizedExamId))` when a valid `examId` is present.
- Stores the values in the shape:

```ts
export interface ExamPanel {
  holders: string[];
  setters: string[];
  centres: string[];
}
```

## Contract and wallet wiring for Member 4

Member 4 should pass a wallet-backed contract instance into the mutation and exam hooks as `contract` when the screen needs live chain data or on-chain writes.

For participant registration and revocation, the expected contract object is:

```ts
const contract: ParticipantRegistryContract = {
  registerParticipant: async (account, role, profileHash) => {
    /* wallet-bound transaction object */
  },
  revokeParticipant: async (account, role) => {
    /* wallet-bound transaction object */
  },
};
```

The contract instance must return a transaction object exposing `wait(...)` and should be implemented against the repo's actual wallet/provider layer. The hook logic does not do any hidden wallet resolution; Member 4 is responsible for supplying the active wallet-backed contract instance.

For `assignedOnly` exam filtering, Member 4 must provide:

- `userAddress: string | null`
- `contract: ExamPanelContract | null`

The contract must implement:

- `getPanel(examId: bigint): Promise<[string[], string[], string[]]>`
- `getExam(examId: bigint): Promise<{ authority?: string; state?: number }>`

## Refresh behavior

`useParticipants()` listens for a shared invalidation signal. Successful participant mutation paths trigger:

```ts
notifyParticipantsChanged();
```

This is the mechanism that refreshes participant state after a confirmed mutation. Failed or reverted transactions do not trigger refreshes.

## Dependency note

The frontend package includes testing dependencies for the hook test environment. These were added to `frontend/package.json` and are used for Vitest, React Testing Library, jsdom, and jest-dom, not for the runtime app bundle itself.

Examples of the added testing/dev dependencies:

- `@testing-library/jest-dom`
- `@testing-library/react`
- `jsdom`
- `vitest`

This is a testing dependency addition and should be described as such rather than as a runtime dependency.

## Notes

- The hook layer is intentionally restricted to data access and mutation adapters.
- This note documents the current FB-01 API exactly as implemented in the code.
- No broader frontend integration claim is made beyond the actual hook contracts shown above.
