import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useExamPanel, useExams } from "./useExams";

const examList = [
  { examId: "7", chainId: 31337, state: 1, metaHash: "0x" + "11".repeat(32), releaseOpensAt: "100", examStartsAt: "200", examEndsAt: "300", threshold: 2, bankHash: null, seed: null },
  { examId: "8", chainId: 31337, state: 2, metaHash: "0x" + "22".repeat(32), releaseOpensAt: "400", examStartsAt: "500", examEndsAt: "600", threshold: 3, bankHash: null, seed: null },
] as const;

describe("useExams", () => {
  it("returns exam summaries from the backend and respects assignedOnly when a contract is supplied", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => examList,
    } as Response);

    const contract = {
      getExam: vi.fn(async () => ({ authority: "0x0000000000000000000000000000000000000000" })),
      getPanel: vi.fn(async (id: bigint): Promise<[string[], string[], string[]]> => {
        if (id === 7n) return [["0x1111111111111111111111111111111111111111"], [], []];
        return [[], [], ["0x2222222222222222222222222222222222222222"]];
      }),
    };

    const { result } = renderHook(() => useExams({ assignedOnly: true, userAddress: "0x1111111111111111111111111111111111111111", contract }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.exams).toHaveLength(1);
    expect(result.current.exams[0].examId).toBe("7");
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:4000/api/exams", expect.objectContaining({ credentials: "include" }));
  });
});

describe("useExamPanel", () => {
  it("reads panel membership from the wallet contract getPanel result", async () => {
    const contract = {
      getExam: vi.fn(),
      getPanel: vi.fn(async (): Promise<[string[], string[], string[]]> => [
        ["0x1111111111111111111111111111111111111111"],
        ["0x2222222222222222222222222222222222222222"],
        ["0x3333333333333333333333333333333333333333"],
      ]),
    };

    const { result } = renderHook(() => useExamPanel("42", { contract }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.holders).toEqual(["0x1111111111111111111111111111111111111111"]);
    expect(result.current.setters).toEqual(["0x2222222222222222222222222222222222222222"]);
    expect(result.current.centres).toEqual(["0x3333333333333333333333333333333333333333"]);
  });
});
