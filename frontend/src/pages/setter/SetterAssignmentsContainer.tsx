import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExamMetaSchema } from '@sigil/core/schemas';
import { useAuthGuard } from '../../auth/useAuthGuard';
import { useExamVaultContract } from '../../contracts/useExamVaultContract';
import { useExams } from '../../hooks/useExams';
import type { ExamPanelContract } from '../../hooks/useExams';
import type { paths } from '../../api/generated';
import { SetterAssignmentsView } from './SetterAssignmentsView';
import type { SetterAssignment, SetterSection } from './types';

type ExamDetailsResponse =
  paths['/api/exams/{id}']['get']['responses'][200]['content']['application/json'];

const apiOrigin = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:4000';
const EXAM_STATES = ['Draft', 'Collecting', 'Sealed', 'Released', 'Concluded', 'Cancelled'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function getExamDetails(examId: string): Promise<ExamDetailsResponse> {
  const response = await fetch(`${apiOrigin}/api/exams/${encodeURIComponent(examId)}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    let message = `Exam metadata request failed with HTTP ${response.status}.`;
    try {
      const payload: unknown = await response.json();
      if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === 'string') {
        message = payload.error.message;
      }
    } catch {
      // The response status remains an explicit error when the body is not JSON.
    }
    throw new Error(message);
  }
  return response.json() as Promise<ExamDetailsResponse>;
}

export function SetterAssignmentsContainer() {
  const navigate = useNavigate();
  const guard = useAuthGuard(['SETTER']);
  const contractState = useExamVaultContract();
  const rawContract = contractState.contract;
  const panelContract = useMemo<ExamPanelContract | null>(() => {
    if (!rawContract) return null;
    return {
      getExam: async (examId) => {
        const result = await rawContract.getFunction('getExam')(examId);
        return {
          authority: String(result.authority ?? result[2]),
          state: Number(result.state ?? result[1]),
        };
      },
      getPanel: async (examId) => {
        const result = await rawContract.getFunction('getPanel')(examId);
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
  const [assignments, setAssignments] = useState<SetterAssignment[]>([]);
  const [readError, setReadError] = useState<Error | null>(null);
  const [isReading, setIsReading] = useState(false);

  const loadAssignments = useCallback(async () => {
    if (!guard.isAuthorized || !guard.account || !rawContract) {
      setAssignments([]);
      return;
    }
    setIsReading(true);
    setReadError(null);
    try {
      const wallet = guard.account.toLowerCase();
      const next = await Promise.all(exams.exams.map(async (summary) => {
        const panel = await rawContract.getFunction('getPanel')(BigInt(summary.examId));
        const setters = Array.from(panel[1], (address: unknown) => String(address).toLowerCase());
        if (!setters.includes(wallet)) return null;

        const [detailsResponse, totalsResponse] = await Promise.all([
          getExamDetails(summary.examId),
          rawContract.getFunction('getSectionTotals')(BigInt(summary.examId)),
        ]);
        if (!isRecord(detailsResponse) || !('metaJson' in detailsResponse)) {
          throw new Error(`Exam No. ${summary.examId.padStart(4, '0')} has no persisted metadata.`);
        }
        let metadata: unknown = detailsResponse.metaJson;
        if (typeof metadata === 'string') {
          try {
            metadata = JSON.parse(metadata);
          } catch {
            throw new Error(`Exam No. ${summary.examId.padStart(4, '0')} metadata is not valid JSON.`);
          }
        }
        const parsedMetadata = ExamMetaSchema.safeParse(metadata);
        if (!parsedMetadata.success) {
          throw new Error(`Exam No. ${summary.examId.padStart(4, '0')} metadata does not match the exam schema.`);
        }
        const totals = Array.from(totalsResponse, (value: unknown) => Number(value));
        const sections: SetterSection[] = parsedMetadata.data.sections.map((section, index) => ({
          sectionId: index,
          name: section.name,
          quota: section.quota,
          submitted: totals[index] ?? 0,
        }));
        return {
          examId: summary.examId,
          title: parsedMetadata.data.title,
          state: EXAM_STATES[summary.state] ?? 'Unknown',
          sections,
        };
      }));
      const assigned: SetterAssignment[] = [];
      for (const assignment of next) {
        if (assignment) assigned.push(assignment);
      }
      setAssignments(assigned);
    } catch (thrownError) {
      setReadError(thrownError instanceof Error ? thrownError : new Error('Setter assignment data could not be loaded.'));
      setAssignments([]);
    } finally {
      setIsReading(false);
    }
  }, [exams.exams, guard.account, guard.isAuthorized, rawContract]);

  useEffect(() => {
    if (!exams.isLoading && !exams.error && !contractState.isLoading) {
      void loadAssignments();
    }
  }, [contractState.isLoading, exams.error, exams.isLoading, loadAssignments]);

  const retry = useCallback(async () => {
    setReadError(null);
    try {
      await exams.refetch();
    } catch (thrownError) {
      setReadError(thrownError instanceof Error ? thrownError : new Error('Setter assignments could not be refreshed.'));
    }
    await loadAssignments();
  }, [exams.refetch, loadAssignments]);

  const pageState = !guard.isAuthorized
    ? guard.guardState === 'no-role' ? 'permission' : 'loading'
    : contractState.isLoading || exams.isLoading || isReading
      ? 'loading'
      : contractState.error || exams.error || readError
        ? 'error'
        : assignments.length === 0
          ? 'empty'
          : 'ready';

  return (
    <SetterAssignmentsView
      pageState={pageState}
      assignments={assignments}
      error={readError ?? exams.error ?? contractState.error}
      onRetry={() => void retry()}
      onOpenQuestions={(examId) => navigate(`/setter/exams/${examId}/questions`)}
    />
  );
}
