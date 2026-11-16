import { useCallback, useEffect, useMemo, useState } from "react";

export type ExamState = "draft" | "collecting" | "sealed" | "released" | "concluded" | "cancelled";

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

export interface ExamDetail extends ExamSummary {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  createdAtDate?: Date;
  updatedAtDate?: Date;
}

export interface ExamPanelContract {
  getExam: (examId: bigint) => Promise<{ authority?: string; state?: number }>; 
  getPanel: (examId: bigint) => Promise<[string[], string[], string[]]>;
}

export interface UseExamsOptions {
  enabled?: boolean;
  assignedOnly?: boolean;
  userAddress?: string | null;
  contract?: ExamPanelContract | null;
}

export interface UseExamsResult {
  exams: ExamSummary[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<ExamSummary[]>;
}

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "http://localhost:4000";

function normalizeAddress(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  return /^0x[0-9a-fA-F]{40}$/.test(trimmed) ? trimmed.toLowerCase() : "";
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    credentials: "include",
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    ...init,
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

async function filterAssignedExams(
  exams: ExamSummary[],
  userAddress: string | null | undefined,
  contract: ExamPanelContract | null | undefined,
): Promise<ExamSummary[]> {
  const normalized = normalizeAddress(userAddress);
  if (!normalized || !contract) {
    throw new Error("assignedOnly requires a userAddress and a wallet-backed exam contract");
  }

  const filtered: ExamSummary[] = [];
  for (const exam of exams) {
    const examId = BigInt(exam.examId);
    const [holders, setters, centres] = await contract.getPanel(examId);
    const members = [
      ...holders.map((item) => normalizeAddress(item)),
      ...setters.map((item) => normalizeAddress(item)),
      ...centres.map((item) => normalizeAddress(item)),
    ];

    if (members.includes(normalized)) {
      filtered.push(exam);
      continue;
    }

    const examDetail = await contract.getExam(examId);
    const authority = normalizeAddress(examDetail.authority ?? "");
    if (authority === normalized) {
      filtered.push(exam);
    }
  }

  return filtered;
}

export function useExams(options: UseExamsOptions = {}): UseExamsResult {
  const enabled = options.enabled ?? true;
  const assignedOnly = options.assignedOnly ?? false;
  const userAddress = options.userAddress ?? null;
  const contract = options.contract ?? null;

  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    const nextExams = await requestJson<ExamSummary[]>("/api/exams");
    const filtered = assignedOnly ? await filterAssignedExams(nextExams, userAddress, contract) : nextExams;
    setExams(filtered);
    return filtered;
  }, [assignedOnly, userAddress, contract]);

  useEffect(() => {
    if (!enabled) {
      setExams([]);
      setIsLoading(false);
      return;
    }

    let isCancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const nextExams = await refetch();
        if (!isCancelled) {
          setExams(nextExams);
        }
      } catch (thrownError) {
        if (!isCancelled) {
          setError(thrownError instanceof Error ? thrownError : new Error("Failed to load exams"));
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
  }, [enabled, refetch]);

  return { exams, isLoading, error, refetch };
}

export interface ExamPanel {
  holders: string[];
  setters: string[];
  centres: string[];
}

export interface UseExamPanelOptions {
  contract?: ExamPanelContract | null;
}

export function useExamPanel(
  examId: string | number | null | undefined,
  options: UseExamPanelOptions = {},
) {
  const normalizedExamId = examId == null || examId === "" ? null : String(examId);
  const contract = options.contract ?? null;

  const [panel, setPanel] = useState<ExamPanel>({ holders: [], setters: [], centres: [] });
  const [isLoading, setIsLoading] = useState(Boolean(normalizedExamId));
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!normalizedExamId) {
      setPanel({ holders: [], setters: [], centres: [] });
      return { holders: [], setters: [], centres: [] };
    }

    if (!contract) {
      throw new Error("Panel retrieval requires a wallet-backed contract with getPanel(examId)");
    }

    const [holders, setters, centres] = await contract.getPanel(BigInt(normalizedExamId));
    const nextPanel = {
      holders: Array.isArray(holders) ? holders : [],
      setters: Array.isArray(setters) ? setters : [],
      centres: Array.isArray(centres) ? centres : [],
    };

    setPanel(nextPanel);
    return nextPanel;
  }, [contract, normalizedExamId]);

  useEffect(() => {
    if (!normalizedExamId) {
      setPanel({ holders: [], setters: [], centres: [] });
      setIsLoading(false);
      return;
    }

    let isCancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const nextPanel = await refetch();
        if (!isCancelled) {
          setPanel(nextPanel);
        }
      } catch (thrownError) {
        if (!isCancelled) {
          setError(thrownError instanceof Error ? thrownError : new Error("Failed to load exam panel"));
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
  }, [normalizedExamId, refetch]);

  const summary = useMemo(
    () => ({
      holders: panel.holders,
      setters: panel.setters,
      centres: panel.centres,
      totalMembers: panel.holders.length + panel.setters.length + panel.centres.length,
    }),
    [panel],
  );

  return { ...summary, isLoading, error, refetch };
}
