import { useCallback, useEffect, useState } from "react";

export const PARTICIPANT_ROLES = ["AUTHORITY", "SETTER", "HOLDER", "CENTRE", "AUDITOR"] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

export interface TransactionReceiptLike {
  status: number | null | undefined;
  blockNumber?: number | null;
  transactionHash?: string;
}

export interface TransactionResponseLike {
  wait: (confirmations?: number) => Promise<TransactionReceiptLike | null>;
}

export interface ParticipantRecord {
  address: string;
  roles: ParticipantRole[];
  displayName: string | null;
  organisation: string | null;
  profileHash: string | null;
}

export interface ParticipantRegistrationInput {
  address: string;
  role: ParticipantRole;
  profileHash?: string | null;
}

export interface ParticipantRevocationInput {
  address: string;
  role: ParticipantRole;
}

export interface ParticipantRegistryContract {
  registerParticipant: (account: string, role: number, profileHash: string) => Promise<TransactionResponseLike>;
  revokeParticipant: (account: string, role: number) => Promise<TransactionResponseLike>;
}

export interface UseParticipantsResult {
  participants: ParticipantRecord[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<ParticipantRecord[]>;
}

export interface UseParticipantMutationResult<TInput> {
  mutate: (input: TInput) => Promise<ParticipantRecord>;
  isPending: boolean;
  error: Error | null;
}

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "http://localhost:4000";
const EVENT_PAGE_LIMIT = 100;
const participantsRefreshListeners = new Set<() => void>();

interface EventPageResponse {
  events?: Array<{ payloadJson?: Record<string, unknown> }>;
  nextCursor?: string | null;
}

export function notifyParticipantsChanged(): void {
  for (const listener of participantsRefreshListeners) {
    listener();
  }
}

export function subscribeToParticipantsRefresh(listener: () => void): () => void {
  participantsRefreshListeners.add(listener);
  return () => {
    participantsRefreshListeners.delete(listener);
  };
}

function normalizeAddress(value: string): string {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    return "";
  }

  return trimmed.toLowerCase();
}

function toParticipantRole(value: unknown): ParticipantRole | null {
  if (typeof value === "number") {
    switch (value) {
      case 1:
        return "AUTHORITY";
      case 2:
        return "SETTER";
      case 3:
        return "HOLDER";
      case 4:
        return "CENTRE";
      case 5:
        return "AUDITOR";
      default:
        return null;
    }
  }

  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();
    return PARTICIPANT_ROLES.includes(normalized as ParticipantRole)
      ? (normalized as ParticipantRole)
      : null;
  }

  return null;
}

function roleToContractId(role: ParticipantRole): number {
  switch (role) {
    case "AUTHORITY":
      return 1;
    case "SETTER":
      return 2;
    case "HOLDER":
      return 3;
    case "CENTRE":
      return 4;
    case "AUDITOR":
      return 5;
    default:
      return 0;
  }
}

function normalizeProfileHash(value?: string | null): string {
  if (typeof value !== "string") {
    return "0x" + "00".repeat(32);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "0x" + "00".repeat(32);
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new Error("profileHash must be a 32-byte hex string");
  }

  return trimmed.toLowerCase();
}

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      typeof payload?.error?.message === "string"
        ? payload.error.message
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return (await response.json()) as T;
}

async function fetchEventsPage(
  type: "ParticipantRegistered" | "ParticipantRevoked",
  cursor?: string,
): Promise<EventPageResponse> {
  const searchParams = new URLSearchParams({
    type,
    limit: String(EVENT_PAGE_LIMIT),
  });

  if (cursor) {
    searchParams.set("cursor", cursor);
  }

  return requestJson<EventPageResponse>(`/api/events?${searchParams.toString()}`);
}

async function fetchAllEventsByType(
  type: "ParticipantRegistered" | "ParticipantRevoked",
): Promise<Array<{ payloadJson?: Record<string, unknown> }>> {
  const allEvents: Array<{ payloadJson?: Record<string, unknown> }> = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  while (true) {
    const response = await fetchEventsPage(type, cursor);
    const events = response.events ?? [];
    allEvents.push(...events);

    const nextCursor = response.nextCursor ?? null;
    if (!nextCursor) {
      break;
    }

    if (seenCursors.has(nextCursor)) {
      throw new Error(`Event pagination for ${type} repeated cursor: ${nextCursor}. Aborting to prevent an infinite loop.`);
    }

    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return allEvents;
}

async function awaitTransactionConfirmation(
  tx: TransactionResponseLike | null | undefined,
  label: string,
): Promise<TransactionReceiptLike> {
  if (!tx || typeof tx.wait !== "function") {
    throw new Error(`${label} transaction response is missing.`);
  }

  const receipt = await tx.wait();
  if (!receipt || receipt.status === null || receipt.status === undefined || receipt.status === 0) {
    throw new Error(`${label} transaction was reverted or failed.`);
  }

  return receipt;
}

export function mergeParticipantEvents(
  registeredEvents: Array<{ payloadJson?: Record<string, unknown> }>,
  revokedEvents: Array<{ payloadJson?: Record<string, unknown> }>,
): ParticipantRecord[] {
  const participants = new Map<string, ParticipantRecord>();

  const upsertRole = (address: string, role: ParticipantRole, profileHash?: string | null) => {
    const key = normalizeAddress(address);
    if (!key || !role) {
      return;
    }

    const current = participants.get(key) ?? {
      address: key,
      roles: [],
      displayName: null,
      organisation: null,
      profileHash: null,
    };

    const nextRoles = new Set(current.roles);
    nextRoles.add(role);

    participants.set(key, {
      ...current,
      roles: Array.from(nextRoles).sort((left, right) => left.localeCompare(right)),
      profileHash: profileHash ?? current.profileHash,
    });
  };

  const removeRole = (address: string, role: ParticipantRole) => {
    const key = normalizeAddress(address);
    if (!key || !role) {
      return;
    }

    const current = participants.get(key);
    if (!current) {
      return;
    }

    const nextRoles = current.roles.filter((existingRole) => existingRole !== role);
    if (nextRoles.length === 0) {
      participants.delete(key);
      return;
    }

    participants.set(key, {
      ...current,
      roles: nextRoles,
    });
  };

  for (const event of registeredEvents) {
    const payload = event.payloadJson ?? {};
    const account = typeof payload.account === "string" ? payload.account : "";
    const role = toParticipantRole(payload.role);
    const profileHash = typeof payload.profileHash === "string" ? payload.profileHash : null;

    if (role) {
      upsertRole(account, role, profileHash);
    }
  }

  for (const event of revokedEvents) {
    const payload = event.payloadJson ?? {};
    const account = typeof payload.account === "string" ? payload.account : "";
    const role = toParticipantRole(payload.role);

    if (role) {
      removeRole(account, role);
    }
  }

  return Array.from(participants.values()).sort((left, right) => left.address.localeCompare(right.address));
}

async function fetchParticipantsFromEvents(): Promise<ParticipantRecord[]> {
  const [registeredEvents, revokedEvents] = await Promise.all([
    fetchAllEventsByType("ParticipantRegistered"),
    fetchAllEventsByType("ParticipantRevoked"),
  ]);

  return mergeParticipantEvents(registeredEvents, revokedEvents);
}

export function useParticipants(options: { enabled?: boolean; limit?: number } = {}): UseParticipantsResult {
  const enabled = options.enabled ?? true;
  const limit = options.limit ?? 100;

  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeToParticipantsRefresh(() => {
      setRefreshVersion((current) => current + 1);
    });

    return unsubscribe;
  }, []);

  const refetch = useCallback(async () => {
    const nextParticipants = await fetchParticipantsFromEvents();
    const sliced = nextParticipants.slice(0, limit);
    setParticipants(sliced);
    return sliced;
  }, [limit]);

  useEffect(() => {
    if (!enabled) {
      setParticipants([]);
      setIsLoading(false);
      return;
    }

    let isCancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const nextParticipants = await refetch();
        if (!isCancelled) {
          setParticipants(nextParticipants);
        }
      } catch (thrownError) {
        if (!isCancelled) {
          setError(thrownError instanceof Error ? thrownError : new Error("Failed to load participants"));
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      isCancelled = true;
    };
  }, [enabled, refreshVersion, refetch]);

  return { participants, isLoading, error, refetch };
}

export interface UseRegisterParticipantOptions {
  contract?: ParticipantRegistryContract | null;
  onSubmit?: (
    input: ParticipantRegistrationInput,
    contract: ParticipantRegistryContract | null,
  ) => Promise<ParticipantRecord | void>;
}

export function useRegisterParticipant(
  options: UseRegisterParticipantOptions = {},
): UseParticipantMutationResult<ParticipantRegistrationInput> {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (input: ParticipantRegistrationInput): Promise<ParticipantRecord> => {
      setIsPending(true);
      setError(null);

      try {
        const address = normalizeAddress(input.address);
        if (!address) {
          throw new Error("Participant address is required");
        }

        const role = toParticipantRole(input.role);
        if (!role) {
          throw new Error("Participant role is invalid");
        }

        const normalizedProfileHash = normalizeProfileHash(input.profileHash ?? null);
        const prepared: ParticipantRecord = {
          address,
          roles: [role],
          displayName: null,
          organisation: null,
          profileHash: normalizedProfileHash,
        };

        if (options.contract) {
          const tx = await options.contract.registerParticipant(address, roleToContractId(role), normalizedProfileHash);
          await awaitTransactionConfirmation(tx, "Participant registration");
          notifyParticipantsChanged();
          return prepared;
        }

        if (options.onSubmit) {
          const nextValue = await options.onSubmit(input, options.contract ?? null);
          const nextRecord = nextValue ?? prepared;
          notifyParticipantsChanged();
          return nextRecord;
        }

        throw new Error("No participant registry contract provided. Supply a wallet-backed contract with registerParticipant(...) for actual on-chain writes.");
      } catch (thrownError) {
        const nextError =
          thrownError instanceof Error ? thrownError : new Error("Failed to register participant");
        setError(nextError);
        throw nextError;
      } finally {
        setIsPending(false);
      }
    },
    [options],
  );

  return { mutate, isPending, error };
}

export interface UseRevokeParticipantOptions {
  contract?: ParticipantRegistryContract | null;
  onSubmit?: (
    input: ParticipantRevocationInput,
    contract: ParticipantRegistryContract | null,
  ) => Promise<ParticipantRecord | void>;
}

export function useRevokeParticipant(
  options: UseRevokeParticipantOptions = {},
): UseParticipantMutationResult<ParticipantRevocationInput> {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (input: ParticipantRevocationInput): Promise<ParticipantRecord> => {
      setIsPending(true);
      setError(null);

      try {
        const address = normalizeAddress(input.address);
        if (!address) {
          throw new Error("Participant address is required");
        }

        const role = toParticipantRole(input.role);
        if (!role) {
          throw new Error("Participant role is invalid");
        }

        const prepared: ParticipantRecord = {
          address,
          roles: [],
          displayName: null,
          organisation: null,
          profileHash: null,
        };

        if (options.contract) {
          const tx = await options.contract.revokeParticipant(address, roleToContractId(role));
          await awaitTransactionConfirmation(tx, "Participant revocation");
          notifyParticipantsChanged();
          return prepared;
        }

        if (options.onSubmit) {
          const nextValue = await options.onSubmit(input, options.contract ?? null);
          const nextRecord = nextValue ?? prepared;
          notifyParticipantsChanged();
          return nextRecord;
        }

        throw new Error("No participant registry contract provided. Supply a wallet-backed contract with revokeParticipant(...) for actual on-chain writes.");
      } catch (thrownError) {
        const nextError =
          thrownError instanceof Error ? thrownError : new Error("Failed to revoke participant");
        setError(nextError);
        throw nextError;
      } finally {
        setIsPending(false);
      }
    },
    [options],
  );

  return { mutate, isPending, error };
}
