import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mergeParticipantEvents, subscribeToParticipantsRefresh, useParticipants, useRegisterParticipant, useRevokeParticipant } from "./useParticipants";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("mergeParticipantEvents", () => {
  it("merges registrations and revocations by address and role", () => {
    const events = mergeParticipantEvents(
      [
        { payloadJson: { account: "0x1111111111111111111111111111111111111111", role: 1, profileHash: "0x" + "11".repeat(32) } },
        { payloadJson: { account: "0x1111111111111111111111111111111111111111", role: 2, profileHash: "0x" + "22".repeat(32) } },
        { payloadJson: { account: "0x2222222222222222222222222222222222222222", role: 3, profileHash: "0x" + "33".repeat(32) } },
      ],
      [
        { payloadJson: { account: "0x1111111111111111111111111111111111111111", role: 2 } },
      ],
    );

    expect(events).toHaveLength(2);
    expect(events[0].address).toBe("0x1111111111111111111111111111111111111111");
    expect(events[0].roles).toEqual(["AUTHORITY"]);
    expect(events[1].address).toBe("0x2222222222222222222222222222222222222222");
    expect(events[1].roles).toEqual(["HOLDER"]);
  });

  it("drops participants once all roles are revoked", () => {
    const events = mergeParticipantEvents(
      [
        { payloadJson: { account: "0x1234567890123456789012345678901234567890", role: 3, profileHash: "0x" + "aa".repeat(32) } },
      ],
      [
        { payloadJson: { account: "0x1234567890123456789012345678901234567890", role: 3 } },
      ],
    );

    expect(events).toEqual([]);
  });
});

describe("participant event pagination", () => {
  it("requests the backend limit cap, follows nextCursor across pages, and merges all participant roles", async () => {
    const registeredPage1 = [
      { payloadJson: { account: "0x1111111111111111111111111111111111111111", role: 1, profileHash: "0x" + "11".repeat(32) } },
      { payloadJson: { account: "0x2222222222222222222222222222222222222222", role: 2, profileHash: "0x" + "22".repeat(32) } },
    ];
    const registeredPage2 = [
      { payloadJson: { account: "0x1111111111111111111111111111111111111111", role: 2, profileHash: "0x" + "33".repeat(32) } },
      { payloadJson: { account: "0x3333333333333333333333333333333333333333", role: 3, profileHash: "0x" + "44".repeat(32) } },
    ];
    const revokedPage1 = [
      { payloadJson: { account: "0x1111111111111111111111111111111111111111", role: 1 } },
    ];
    const revokedPage2 = [
      { payloadJson: { account: "0x3333333333333333333333333333333333333333", role: 3 } },
    ];

    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      const type = url.searchParams.get("type");
      const cursor = url.searchParams.get("cursor");
      const limit = Number(url.searchParams.get("limit"));

      if (limit > 100) {
        throw new Error(`Unexpected limit: ${limit}`);
      }

      if (type === "ParticipantRegistered") {
        if (!cursor) {
          return {
            ok: true,
            json: async () => ({ events: registeredPage1, nextCursor: "registered-page-1" }),
          };
        }

        if (cursor === "registered-page-1") {
          return {
            ok: true,
            json: async () => ({ events: registeredPage2, nextCursor: null }),
          };
        }
      }

      if (type === "ParticipantRevoked") {
        if (!cursor) {
          return {
            ok: true,
            json: async () => ({ events: revokedPage1, nextCursor: "revoked-page-1" }),
          };
        }

        if (cursor === "revoked-page-1") {
          return {
            ok: true,
            json: async () => ({ events: revokedPage2, nextCursor: null }),
          };
        }
      }

      throw new Error(`Unexpected request: ${url.toString()}`);
    });

    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useParticipants({ enabled: true }));

    await waitFor(() => expect(result.current.participants).toHaveLength(2));

    expect(fetchSpy).toHaveBeenCalledTimes(4);
    for (const [input] of fetchSpy.mock.calls) {
      const url = new URL(String(input), "http://localhost");
      const limit = Number(url.searchParams.get("limit"));
      expect(limit).toBeLessThanOrEqual(100);
    }

    const registeredCalls = fetchSpy.mock.calls
      .map(([input]) => new URL(String(input), "http://localhost"))
      .filter((url) => url.searchParams.get("type") === "ParticipantRegistered");
    const revokedCalls = fetchSpy.mock.calls
      .map(([input]) => new URL(String(input), "http://localhost"))
      .filter((url) => url.searchParams.get("type") === "ParticipantRevoked");

    expect(registeredCalls).toHaveLength(2);
    expect(revokedCalls).toHaveLength(2);
    expect(registeredCalls[1].searchParams.get("cursor")).toBe("registered-page-1");
    expect(revokedCalls[1].searchParams.get("cursor")).toBe("revoked-page-1");

    expect(result.current.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          address: "0x1111111111111111111111111111111111111111",
          roles: ["SETTER"],
          profileHash: expect.stringMatching(/^0x[0-9a-f]{64}$/),
        }),
        expect.objectContaining({
          address: "0x2222222222222222222222222222222222222222",
          roles: ["SETTER"],
          profileHash: expect.stringMatching(/^0x[0-9a-f]{64}$/),
        }),
      ]),
    );
  });

  it("stops and throws when the backend repeats a cursor instead of looping forever", async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      const type = url.searchParams.get("type");
      const cursor = url.searchParams.get("cursor");

      if (type === "ParticipantRegistered") {
        if (!cursor) {
          return {
            ok: true,
            json: async () => ({ events: [{ payloadJson: { account: "0x1111111111111111111111111111111111111111", role: 1 } }], nextCursor: "repeat-me" }),
          };
        }

        if (cursor === "repeat-me") {
          return {
            ok: true,
            json: async () => ({ events: [{ payloadJson: { account: "0x2222222222222222222222222222222222222222", role: 2 } }], nextCursor: "repeat-me" }),
          };
        }
      }

      if (type === "ParticipantRevoked") {
        return {
          ok: true,
          json: async () => ({ events: [], nextCursor: null }),
        };
      }

      throw new Error(`Unexpected request: ${url.toString()}`);
    });

    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useParticipants({ enabled: true }));

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.error?.message).toContain("repeated cursor");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});

describe("participant mutation contract behavior", () => {
  it("rejects invalid addresses and invalid roles", async () => {
    const contract = {
      registerParticipant: vi.fn(),
      revokeParticipant: vi.fn(),
    };

    const { result } = renderHook(() => useRegisterParticipant({ contract }));

    await act(async () => {
      await expect(result.current.mutate({ address: "bad", role: "HOLDER" })).rejects.toThrow("Participant address is required");
    });

    await act(async () => {
      await expect(result.current.mutate({ address: "0x1111111111111111111111111111111111111111", role: "NOT_A_ROLE" as never })).rejects.toThrow("Participant role is invalid");
    });

    contract.registerParticipant.mockResolvedValue({ wait: async () => ({ status: 1 }) });

    await act(async () => {
      await expect(result.current.mutate({ address: "0x1111111111111111111111111111111111111111", role: "HOLDER" })).resolves.toMatchObject({
        address: "0x1111111111111111111111111111111111111111",
      });
    });
  });

  it("waits for a mined receipt and rejects failed transactions", async () => {
    const contract = {
      registerParticipant: vi.fn().mockResolvedValue({
        wait: vi.fn().mockResolvedValue({ status: 0, transactionHash: "0xabc" }),
      }),
      revokeParticipant: vi.fn(),
    };

    const { result } = renderHook(() => useRegisterParticipant({ contract }));

    await act(async () => {
      await expect(
        result.current.mutate({
          address: "0x1111111111111111111111111111111111111111",
          role: "SETTER",
        }),
      ).rejects.toThrow("Participant registration transaction was reverted or failed.");
    });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
  });

  it("tracks pending state and emits a refresh notification after a successful registration", async () => {
    const refreshSpy = vi.fn();
    const unsubscribe = subscribeToParticipantsRefresh(refreshSpy);
    const wait = vi.fn().mockResolvedValue({ status: 1, transactionHash: "0xdef" });
    const contract = {
      registerParticipant: vi.fn().mockResolvedValue({ wait }),
      revokeParticipant: vi.fn(),
    };

    const { result } = renderHook(() => useRegisterParticipant({ contract }));

    try {
      await act(async () => {
        await result.current.mutate({
          address: "0x2222222222222222222222222222222222222222",
          role: "CENTRE",
        });
      });

      await waitFor(() => expect(result.current.isPending).toBe(false));
      expect(refreshSpy).toHaveBeenCalledTimes(1);
      expect(wait).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it("rejects receipt failures for revocation and emits a refresh notification only on success", async () => {
    const refreshSpy = vi.fn();
    const unsubscribe = subscribeToParticipantsRefresh(refreshSpy);
    const contract = {
      registerParticipant: vi.fn(),
      revokeParticipant: vi
        .fn()
        .mockResolvedValueOnce({ wait: vi.fn().mockResolvedValue({ status: 0 }) })
        .mockResolvedValueOnce({ wait: vi.fn().mockResolvedValue({ status: 1 }) }),
    };

    const { result } = renderHook(() => useRevokeParticipant({ contract }));

    try {
      await act(async () => {
        await expect(result.current.mutate({ address: "0x3333333333333333333333333333333333333333", role: "HOLDER" })).rejects.toThrow("Participant revocation transaction was reverted or failed.");
      });

      await act(async () => {
        await expect(result.current.mutate({ address: "0x3333333333333333333333333333333333333333", role: "HOLDER" })).resolves.toMatchObject({
          address: "0x3333333333333333333333333333333333333333",
        });
      });

      await waitFor(() => expect(refreshSpy).toHaveBeenCalledTimes(1));
      expect(refreshSpy).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });
});
