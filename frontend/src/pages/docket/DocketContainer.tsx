import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useExamPanel, useExams } from '../../hooks/useExams';
import type { ExamPanelContract, ExamSummary } from '../../hooks/useExams';
import { useAuthGuard } from '../../auth/useAuthGuard';
import { useExamVaultContract } from '../../contracts/useExamVaultContract';
import type { paths } from '../../api/generated';
import { DocketView } from './DocketView';
import { DocketExam } from './types';

type ExamDetailsResponse =
  paths['/api/exams/{id}']['get']['responses'][200]['content']['application/json'];

const apiOrigin = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:4000';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function titleFromDetails(details: ExamDetailsResponse): string | null {
  if (!isRecord(details)) {
    throw new Error('Exam details response is not an object.');
  }
  const metadata = details.metaJson;
  if (metadata === null || metadata === undefined) {
    return null;
  }
  if (!isRecord(metadata)) {
    throw new Error('Exam metadata response is not an object.');
  }
  return typeof metadata.title === 'string' && metadata.title.trim()
    ? metadata.title.trim()
    : null;
}

async function fetchExamTitle(examId: string): Promise<string | null> {
  const response = await fetch(`${apiOrigin}/api/exams/${encodeURIComponent(examId)}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const body: unknown = await response.json();
    const message =
      isRecord(body) &&
      isRecord(body.error) &&
      typeof body.error.message === 'string'
        ? body.error.message
        : `Exam details request failed with status ${response.status}.`;
    throw new Error(message);
  }
  const details: ExamDetailsResponse = await response.json();
  return titleFromDetails(details);
}

interface ExamPanelLoaderProps {
  examId: string;
  contract: ExamPanelContract | null;
  onLoaded: (examId: string, holderCount: number) => void;
  onError: (examId: string, error: Error) => void;
}

function ExamPanelLoader({ examId, contract, onLoaded, onError }: ExamPanelLoaderProps) {
  const panel = useExamPanel(contract ? examId : null, { contract });

  useEffect(() => {
    if (panel.error) {
      onError(examId, panel.error);
    } else if (!panel.isLoading && contract) {
      onLoaded(examId, panel.holders.length);
    }
  }, [contract, examId, onError, onLoaded, panel.error, panel.holders.length, panel.isLoading]);

  return null;
}

export const DocketContainer: React.FC = () => {
  const guard = useAuthGuard(['AUTHORITY']);
  const navigate = useNavigate();
  const contractState = useExamVaultContract();
  const rawContract = contractState.contract;

  const [stateFilter, setStateFilter] = useState<string | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [examTitles, setExamTitles] = useState<Record<string, string | null>>({});
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<Error | null>(null);
  const [panelCounts, setPanelCounts] = useState<Record<string, number>>({});
  const [panelErrors, setPanelErrors] = useState<Record<string, Error>>({});
  const [panelRetryVersion, setPanelRetryVersion] = useState(0);

  const { exams, isLoading, error, refetch } = useExams({
    enabled: guard.isAuthorized,
  });

  const panelContract = useMemo<ExamPanelContract | null>(() => {
    if (!rawContract) {
      return null;
    }

    return {
      getExam: async (examId) => {
        const result = await rawContract.getFunction('getExam')(examId);
        return {
          authority: String(result.authority ?? result[0]),
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

  useEffect(() => {
    if (!guard.isAuthorized || isLoading || error || exams.length === 0) {
      setExamTitles({});
      setIsLoadingDetails(false);
      setDetailsError(null);
      return;
    }

    let isCancelled = false;
    setIsLoadingDetails(true);
    setDetailsError(null);

    void Promise.all(
      exams.map(async (exam) => [exam.examId, await fetchExamTitle(exam.examId)] as const),
    )
      .then((entries) => {
        if (!isCancelled) {
          setExamTitles(Object.fromEntries(entries));
        }
      })
      .catch((thrownError: unknown) => {
        if (!isCancelled) {
          setDetailsError(
            thrownError instanceof Error ? thrownError : new Error('Failed to load exam titles.'),
          );
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingDetails(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [error, exams, guard.isAuthorized, isLoading]);

  const handlePanelLoaded = useCallback((examId: string, holderCount: number) => {
    setPanelCounts((current) =>
      current[examId] === holderCount ? current : { ...current, [examId]: holderCount },
    );
    setPanelErrors((current) => {
      if (!current[examId]) {
        return current;
      }
      const next = { ...current };
      delete next[examId];
      return next;
    });
  }, []);

  const handlePanelError = useCallback((examId: string, panelError: Error) => {
    setPanelErrors((current) =>
      current[examId]?.message === panelError.message
        ? current
        : { ...current, [examId]: panelError },
    );
  }, []);

  const docketExams: DocketExam[] = exams.map((exam: ExamSummary) => {
    const holderCount = panelCounts[exam.examId];
    if (holderCount === undefined) {
      return {
        ...exam,
        serialSort: exam.examId.padStart(78, '0'),
        title: examTitles[exam.examId] ?? null,
        holderCount: 0,
      };
    }
    return {
      ...exam,
      serialSort: exam.examId.padStart(78, '0'),
      title: examTitles[exam.examId] ?? null,
      holderCount,
    };
  });
  const panelError = Object.values(panelErrors)[0] ?? null;
  const isLoadingPanels = exams.some((exam) => panelCounts[exam.examId] === undefined);
  const pageError = error ?? detailsError ?? contractState.error ?? panelError;
  const retry = useCallback(async () => {
    setExamTitles({});
    setPanelCounts({});
    setPanelErrors({});
    setPanelRetryVersion((current) => current + 1);
    await refetch();
  }, [refetch]);

  const isPermissionDenied = guard.guardState === 'no-role';

  return (
    <>
      {exams.map((exam) => (
        <ExamPanelLoader
          key={`${exam.examId}:${panelRetryVersion}`}
          examId={exam.examId}
          contract={panelContract}
          onLoaded={handlePanelLoaded}
          onError={handlePanelError}
        />
      ))}
    <DocketView
      exams={docketExams}
      isLoading={
        isLoading ||
        isLoadingDetails ||
        (exams.length > 0 && contractState.isLoading) ||
        isLoadingPanels
      }
      error={pageError}
      permissionDenied={isPermissionDenied}
      stateFilter={stateFilter}
      onStateFilterChange={setStateFilter}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onCreateExam={() => navigate('/authority/create')}
      onRowClick={(exam) => navigate(`/authority/exams/${exam.examId}`)}
      onRetry={() => void retry()}
    />
    </>
  );
};
