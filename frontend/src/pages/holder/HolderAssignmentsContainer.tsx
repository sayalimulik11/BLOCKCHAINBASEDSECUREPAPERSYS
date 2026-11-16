import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthGuard } from '../../auth/useAuthGuard';
import { useExamVaultContract } from '../../contracts/useExamVaultContract';
import { useExams, type ExamPanelContract } from '../../hooks/useExams';
import { examStateFromChain, selectRosetteHash } from '../command-centre/logic';
import { fetchExamMetadata } from './api';
import { HolderAssignmentsView } from './HolderAssignmentsView';
import type { HolderExamAssignment } from './types';

const EMPTY_BYTES32 = `0x${'0'.repeat(64)}`;

export function HolderAssignmentsContainer() {
  const guard = useAuthGuard(['HOLDER']);
  const navigate = useNavigate();
  const contractState = useExamVaultContract();
  const rawContract = contractState.contract;
  const panelContract = useMemo<ExamPanelContract | null>(() => {
    if (!rawContract) return null;
    return {
      getExam: async (id) => {
        const result = await rawContract.getFunction('getExam')(id);
        return { authority: String(result.authority ?? result[2]), state: Number(result.state ?? result[1]) };
      },
      getPanel: async (id) => {
        const result = await rawContract.getFunction('getPanel')(id);
        return [
          Array.from(result[0], (address: unknown) => String(address)),
          Array.from(result[1], (address: unknown) => String(address)),
          Array.from(result[2], (address: unknown) => String(address)),
        ];
      },
    };
  }, [rawContract]);
  const exams = useExams({
    enabled: guard.isAuthorized && panelContract !== null,
    assignedOnly: true,
    userAddress: guard.account,
    contract: panelContract,
  });
  const [assignments, setAssignments] = useState<HolderExamAssignment[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [readError, setReadError] = useState<Error | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const loadAssignments = useCallback(async () => {
    if (!guard.isAuthorized || !guard.account) {
      setAssignments([]);
      setIsReading(false);
      setReadError(null);
      return;
    }
    if (exams.error) {
      setReadError(exams.error);
      setAssignments([]);
      return;
    }
    if (!rawContract) {
      setReadError(contractState.error ?? new Error('A connected wallet is required to read holder assignments.'));
      setAssignments([]);
      return;
    }

    setIsReading(true);
    setReadError(null);
    try {
      const candidates = await Promise.all(exams.exams.map(async (summary) => {
        const panel = await rawContract.getFunction('getPanel')(BigInt(summary.examId));
        const holders = Array.from(panel[0], (address: unknown) => String(address));
        return holders.some((address) => address.toLowerCase() === guard.account?.toLowerCase())
          ? { summary, holders }
          : null;
      }));
      const holderCandidates = candidates.filter(
        (item): item is { summary: typeof exams.exams[number]; holders: string[] } => item !== null,
      );
      const assigned = await Promise.all(holderCandidates.map(async ({ summary, holders }) => {
        const metadataResponse = await fetchExamMetadata(summary.examId);
        const state = examStateFromChain(summary.state);
        if (!state) throw new Error(`Exam No. ${summary.examId.padStart(4, '0')} has an unknown chain state.`);
        const bankHash = summary.bankHash ?? EMPTY_BYTES32;
        return {
          examId: summary.examId,
          title: metadataResponse.title,
          state,
          rosetteHash: selectRosetteHash(state, summary.metaHash, bankHash),
          releaseOpensAt: Number(summary.releaseOpensAt),
          examStartsAt: Number(summary.examStartsAt),
          examEndsAt: Number(summary.examEndsAt),
          threshold: summary.threshold,
          holderCount: holders.length,
          sections: metadataResponse.sections.map(({ name, quota }) => ({ name, quota })),
        } satisfies HolderExamAssignment;
      }));
      setAssignments(assigned);
    } catch (thrownError) {
      setAssignments([]);
      setReadError(thrownError instanceof Error ? thrownError : new Error('Holder assignments could not be loaded.'));
    } finally {
      setIsReading(false);
    }
  }, [contractState.error, exams.error, exams.exams, guard.account, guard.isAuthorized, rawContract]);

  useEffect(() => {
    if (exams.isLoading || contractState.isLoading) return;
    void loadAssignments();
  }, [contractState.isLoading, exams.isLoading, loadAssignments, refreshVersion]);

  const retry = useCallback(async () => {
    setReadError(null);
    try {
      await exams.refetch();
      setRefreshVersion((version) => version + 1);
    } catch (thrownError) {
      setReadError(thrownError instanceof Error ? thrownError : new Error('Holder assignments could not be refreshed.'));
    }
  }, [exams.refetch]);

  const pageState = !guard.isAuthorized
    ? 'permission'
    : exams.isLoading || contractState.isLoading || isReading
      ? 'loading'
      : readError || contractState.error
        ? 'error'
        : assignments.length === 0
          ? 'empty'
          : 'ready';

  return (
    <HolderAssignmentsView
      pageState={pageState}
      assignments={assignments}
      error={readError ?? contractState.error}
      onRetry={() => void retry()}
      onOpenExam={(examId) => navigate(`/holder/exams/${examId}`)}
    />
  );
}
