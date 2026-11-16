import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ethers } from 'ethers';
import { keccakJson } from '@sigil/core/canonical';
import { ExamMetaSchema } from '@sigil/core/schemas';
import { useAuthGuard } from '../../auth/useAuthGuard';
import { useExamVaultContract } from '../../contracts/useExamVaultContract';
import { useExamPanel } from '../../hooks/useExams';
import type { ExamPanelContract } from '../../hooks/useExams';
import { useTransaction } from '../../shell/AppShell';
import { decodeContractError } from '../../utils/errors';
import type { paths } from '../../api/generated';
import { CommandCentreView } from './CommandCentreView';
import {
  concludeDisabledReason,
  examStateFromChain,
  sealDisabledReason,
  selectRosetteHash,
} from './logic';
import type {
  CommandCentreExam,
  CommandCentreReadinessRow,
  ReadinessCell,
  SectionQuestionCount,
} from './types';

type ExamDetailsResponse =
  paths['/api/exams/{id}']['get']['responses'][200]['content']['application/json'];
type ReadinessResponse =
  paths['/api/stats/exams/{id}/readiness']['get']['responses'][200]['content']['application/json'];

const apiOrigin = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:4000';
const EMPTY_BYTES32 = `0x${'0'.repeat(64)}`;

interface ApiReadinessEntry {
  address: string;
  steps: {
    keyRegistered?: boolean;
    randomnessCommitted?: boolean;
    batchesSubmitted?: boolean;
    batchCount?: number;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function apiErrorMessage(payload: unknown, fallback: string): string {
  if (
    isRecord(payload) &&
    isRecord(payload.error) &&
    typeof payload.error.message === 'string'
  ) {
    return payload.error.message;
  }
  return fallback;
}

async function getApiJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiOrigin}${path}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Request failed with HTTP ${response.status}.`);
    }
    throw new Error(apiErrorMessage(payload, `Request failed with HTTP ${response.status}.`));
  }
  return response.json() as Promise<T>;
}

function readinessEntries(
  entries: readonly ApiReadinessEntry[],
): Map<string, ApiReadinessEntry> {
  return new Map(entries.map((entry) => [entry.address.toLowerCase(), entry]));
}

function status(value: boolean | undefined): ReadinessCell {
  if (value === undefined) {
    return 'unknown';
  }
  return value ? 'complete' : 'pending';
}

function encodeBytes32(value: unknown, name: string): string {
  const normalized = String(value);
  if (!/^0x[0-9a-f]{64}$/i.test(normalized)) {
    throw new Error(`The on-chain ${name} is not a bytes32 value.`);
  }
  return normalized;
}

export function CommandCentreContainer() {
  const { examId = '' } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const guard = useAuthGuard(['AUTHORITY']);
  const contractState = useExamVaultContract();
  const tx = useTransaction();
  const rawContract = contractState.contract;
  const validExamId = /^\d+$/.test(examId) && BigInt(examId || '0') > 0n;

  const panelContract = useMemo<ExamPanelContract | null>(() => {
    if (!rawContract) {
      return null;
    }
    return {
      getExam: async (id) => {
        const result = await rawContract.getFunction('getExam')(id);
        return {
          authority: String(result.authority ?? result[2]),
          state: Number(result.state ?? result[1]),
        };
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

  const panel = useExamPanel(
    guard.isAuthorized && validExamId && rawContract ? examId : null,
    { contract: panelContract },
  );

  const [exam, setExam] = useState<CommandCentreExam | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [chainTime, setChainTime] = useState<number | null>(null);
  const [estimatedChainTime, setEstimatedChainTime] = useState<number | null>(null);
  const [readinessRows, setReadinessRows] = useState<CommandCentreReadinessRow[]>([]);
  const [sectionCounts, setSectionCounts] = useState<SectionQuestionCount[]>([]);
  const [readError, setReadError] = useState<Error | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const loadExam = useCallback(async (isCancelled: () => boolean = () => false) => {
    if (!guard.isAuthorized) {
      setExam(null);
      setChainTime(null);
      setEstimatedChainTime(null);
      setReadinessRows([]);
      setSectionCounts([]);
      setNotFound(false);
      setReadError(null);
      setIsReading(false);
      return;
    }
    if (!validExamId) {
      setExam(null);
      setChainTime(null);
      setEstimatedChainTime(null);
      setReadinessRows([]);
      setSectionCounts([]);
      setNotFound(true);
      setReadError(null);
      setIsReading(false);
      return;
    }
    if (!rawContract || panel.isLoading) {
      setExam(null);
      setChainTime(null);
      setEstimatedChainTime(null);
      setReadinessRows([]);
      setSectionCounts([]);
      setNotFound(false);
      setReadError(null);
      setIsReading(false);
      return;
    }

    setIsReading(true);
    setReadError(null);
    try {
      const runner = rawContract.runner;
      const provider = runner && 'provider' in runner ? runner.provider : null;
      if (!provider) {
        throw new Error('The connected wallet has no readable chain provider.');
      }

      let chainExam;
      try {
        chainExam = await rawContract.getFunction('getExam')(BigInt(examId));
      } catch (thrownError) {
        if (decodeContractError(thrownError).name === 'ExamNotFound') {
          if (!isCancelled()) {
            setExam(null);
            setReadinessRows([]);
            setSectionCounts([]);
            setNotFound(true);
          }
          return;
        }
        throw thrownError;
      }
      if (panel.error) {
        throw panel.error;
      }
      const [block, details, readiness] = await Promise.all([
        provider.getBlock('latest'),
        getApiJson<ExamDetailsResponse>(`/api/exams/${encodeURIComponent(examId)}`),
        getApiJson<ReadinessResponse>(
          `/api/stats/exams/${encodeURIComponent(examId)}/readiness`,
        ),
      ]);
      if (!block) {
        throw new Error('The latest chain block could not be read.');
      }
      if (!isRecord(details) || !('metaJson' in details)) {
        throw new Error('Exam details did not include persisted metadata.');
      }
      const metadata = ExamMetaSchema.safeParse(details.metaJson);
      if (!metadata.success) {
        throw new Error('Persisted exam metadata is invalid or incomplete.');
      }

      const metaHash = encodeBytes32(chainExam.metaHash ?? chainExam[3], 'metadata hash');
      if (keccakJson(metadata.data).toLowerCase() !== metaHash.toLowerCase()) {
        throw new Error('Persisted exam metadata does not match the on-chain metadata hash.');
      }
      const stateNumber = Number(chainExam.state ?? chainExam[1]);
      const chainState = examStateFromChain(stateNumber);
      if (!chainState) {
        throw new Error(`The contract returned an unknown exam state (${stateNumber}).`);
      }

      const rawBankHash = encodeBytes32(chainExam.bankHash ?? chainExam[9], 'bank hash');
      const bankHash = rawBankHash.toLowerCase() === EMPTY_BYTES32 ? null : rawBankHash;
      if (
        ['Sealed', 'Released', 'Concluded'].includes(chainState) &&
        !bankHash
      ) {
        throw new Error('The sealed exam does not have an on-chain bank hash.');
      }
      const title = metadata.data.title;
      const nextExam: CommandCentreExam = {
        examId,
        title,
        state: chainState,
        metaHash,
        bankHash,
        rosetteHash: selectRosetteHash(chainState, metaHash, rawBankHash),
        releaseOpensAt: Number(chainExam.releaseOpensAt ?? chainExam[4]),
        examStartsAt: Number(chainExam.examStartsAt ?? chainExam[5]),
        examEndsAt: Number(chainExam.examEndsAt ?? chainExam[6]),
        threshold: Number(chainExam.threshold ?? chainExam[7]),
        holderCount: panel.holders.length,
      };

      const [questions, holderStatuses] = await Promise.all([
        Promise.all(
          metadata.data.sections.map(async (section, sectionId) => ({
            name: section.name,
            quota: section.quota,
            questionCount: Number(
              await rawContract.getFunction('getSectionQuestionCount')(
                BigInt(examId),
                sectionId,
              ),
            ),
          })),
        ),
        Promise.all(
          panel.holders.map(async (address) => {
            const [keyValue, committed] = await Promise.all([
              rawContract.getFunction('encryptionKeys')(address),
              rawContract.getFunction('hasCommittedRandomness')(BigInt(examId), address),
            ]);
            const key = typeof keyValue === 'string' ? keyValue : ethers.hexlify(keyValue);
            return {
              address,
              keyRegistered: ethers.getBytes(key).length === 65,
              randomnessCommitted: Boolean(committed),
            };
          }),
        ),
      ]);

      const setterReadiness = readinessEntries(
        readiness.setters,
      );
      const nextRows: CommandCentreReadinessRow[] = [
        ...holderStatuses.map((holder) => ({
          address: holder.address,
          role: 'Holder' as const,
          keyRegistered: status(holder.keyRegistered),
          shareVerified: readiness.notTrackedByServer.includes('shareVerified')
            ? 'not-tracked' as const
            : 'unknown' as const,
          randomnessCommitted: status(holder.randomnessCommitted),
          batchesSubmitted: 'not-applicable' as const,
          batchCount: null,
        })),
        ...panel.setters.map((address) => {
          const entry = setterReadiness.get(address.toLowerCase());
          return {
            address,
            role: 'Setter' as const,
            keyRegistered: 'not-applicable' as const,
            shareVerified: 'not-applicable' as const,
            randomnessCommitted: 'not-applicable' as const,
            batchesSubmitted: status(entry?.steps.batchesSubmitted),
            batchCount: typeof entry?.steps.batchCount === 'number'
              ? entry.steps.batchCount
              : null,
          };
        }),
      ];

      if (!isCancelled()) {
        setExam(nextExam);
        setNotFound(false);
        setChainTime(block.timestamp);
        setEstimatedChainTime(block.timestamp);
        setReadinessRows(nextRows);
        setSectionCounts(questions);
      }
    } catch (thrownError) {
      if (!isCancelled()) {
        setExam(null);
        setReadinessRows([]);
        setSectionCounts([]);
        setNotFound(false);
        setReadError(
          thrownError instanceof Error
            ? thrownError
            : new Error('Failed to read the exam command centre.'),
        );
      }
    } finally {
      if (!isCancelled()) {
        setIsReading(false);
      }
    }
  }, [
    examId,
    panel.error,
    panel.holders,
    panel.isLoading,
    panel.setters,
    guard.isAuthorized,
    rawContract,
    refreshVersion,
    validExamId,
  ]);

  useEffect(() => {
    let cancelled = false;
    void loadExam(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadExam]);

  useEffect(() => {
    if (chainTime === null) {
      setEstimatedChainTime(null);
      return;
    }
    const startedAt = Date.now();
    setEstimatedChainTime(chainTime);
    const timer = window.setInterval(() => {
      setEstimatedChainTime(chainTime + Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [chainTime]);

  const allHoldersCommittedRandomness =
    readinessRows.some((row) => row.role === 'Holder') &&
    readinessRows
      .filter((row) => row.role === 'Holder')
      .every((row) => row.randomnessCommitted === 'complete');
  const sealReason = exam
    ? sealDisabledReason(exam.state, sectionCounts, allHoldersCommittedRandomness)
    : 'Exam data is unavailable.';
  const chainTimestamp = estimatedChainTime ?? chainTime ?? 0;
  const concludeReason = exam
    ? concludeDisabledReason(exam.state, chainTimestamp, exam.examEndsAt)
    : 'Exam data is unavailable.';
  const countdownTime = exam
    ? (exam.state === 'Released' ? exam.examEndsAt : exam.releaseOpensAt)
    : 0;
  const countdownTarget = chainTimestamp === 0
    ? countdownTime
    : countdownTime - chainTimestamp + Math.floor(Date.now() / 1000);

  const refreshPage = useCallback(async () => {
    setReadError(null);
    try {
      await panel.refetch();
      setRefreshVersion((current) => current + 1);
    } catch (thrownError) {
      setReadError(
        thrownError instanceof Error
          ? thrownError
          : new Error('Failed to refresh command centre data.'),
      );
    }
  }, [panel.refetch]);

  const runTransaction = useCallback(async (
    title: string,
    submit: () => Promise<ethers.ContractTransactionResponse>,
  ) => {
    if (!rawContract || !validExamId || isActionPending) {
      return;
    }
    setIsActionPending(true);
    setActionError(null);
    tx.startTx(title);
    tx.setTxAwaitingSignature();

    let pending = false;
    let transactionHash = '';
    try {
      const response = await submit();
      transactionHash = response.hash;
      tx.setTxPending(transactionHash);
      pending = true;
      const receipt = await response.wait(1);
      if (!receipt || receipt.status !== 1) {
        throw new Error(`${title} was not confirmed successfully.`);
      }
    } catch (thrownError) {
      const decoded = decodeContractError(thrownError);
      if (pending) {
        tx.setTxFailed(decoded.formatted);
      } else {
        tx.setActiveTx({ status: 'failed', title, errorMessage: decoded.formatted });
      }
      setActionError(decoded.formatted);
      setIsActionPending(false);
      return;
    }

    tx.setTxConfirmed(transactionHash);
    setIsActionPending(false);
    await refreshPage();
  }, [isActionPending, rawContract, refreshPage, tx, validExamId]);

  const onSeal = useCallback(() => {
    if (!rawContract || !exam || sealReason) {
      return;
    }
    return runTransaction('Seal exam', () =>
      rawContract.getFunction('sealExam')(BigInt(examId)),
    );
  }, [exam, examId, rawContract, runTransaction, sealReason]);

  const onConclude = useCallback(() => {
    if (!rawContract || !exam || concludeReason) {
      return;
    }
    return runTransaction('Conclude exam', () =>
      rawContract.getFunction('concludeExam')(BigInt(examId)),
    );
  }, [concludeReason, exam, examId, rawContract, runTransaction]);

  const onCancel = useCallback(() => {
    if (!rawContract || !exam || exam.state === 'Cancelled') {
      return;
    }
    const serial = `No. ${examId.padStart(4, '0')}`;
    const reasonHash = ethers.keccak256(ethers.toUtf8Bytes(`Authority confirmed cancellation of ${serial}`));
    return runTransaction('Cancel exam', () =>
      rawContract.getFunction('cancelExam')(BigInt(examId), reasonHash),
    );
  }, [exam, examId, rawContract, runTransaction]);

  const permissionDenied = guard.guardState === 'no-role';
  const pageError = readError ?? (notFound ? null : panel.error) ?? contractState.error;
  const isLoading =
    contractState.isLoading ||
    panel.isLoading ||
    isReading;
  const pageState = permissionDenied
    ? 'permission'
    : isLoading
      ? 'loading'
      : pageError
        ? 'error'
        : notFound
          ? 'empty'
          : exam
            ? 'ready'
            : 'loading';

  return (
    <CommandCentreView
      pageState={pageState}
      error={pageError}
      exam={exam}
      countdownTarget={countdownTarget}
      readinessRows={readinessRows}
      sectionCounts={sectionCounts}
      sealDisabledReason={sealReason}
      concludeDisabledReason={concludeReason}
      actionError={actionError}
      isActionPending={isActionPending}
      onRetry={() => void refreshPage()}
      onBackToDocket={() => navigate('/authority/docket')}
      onSeal={() => void onSeal()}
      onConclude={() => void onConclude()}
      onCancel={() => void onCancel()}
    />
  );
}
