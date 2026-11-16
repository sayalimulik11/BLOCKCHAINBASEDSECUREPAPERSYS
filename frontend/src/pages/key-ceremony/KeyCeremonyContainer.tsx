import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { runCeremony } from '@sigil/core/ceremony';
import { ethers } from 'ethers';
import type { ExamPanelContract } from '../../hooks/useExams';
import { useExamPanel, useExams } from '../../hooks/useExams';
import { useAuthGuard } from '../../auth/useAuthGuard';
import { useExamVaultContract } from '../../contracts/useExamVaultContract';
import { useTransaction } from '../../shell/AppShell';
import { decodeContractError } from '../../utils/errors';
import type { paths } from '../../api/generated';
import { KeyCeremonyView } from './KeyCeremonyView';
import type { CeremonyStepStatus, PreparedCeremony } from './workflow';
import { runCeremonyWorkflow } from './workflow';

type ShareUpload =
  paths['/api/exams/{id}/shares']['put']['requestBody']['content']['application/json'];

const apiOrigin = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:4000';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(payload: unknown, fallback: string): string {
  if (
    isRecord(payload) &&
    isRecord(payload.error) &&
    typeof payload.error.message === 'string'
  ) {
    return payload.error.message;
  }
  return fallback;
}

async function uploadEncryptedShares(examId: string, shares: ShareUpload): Promise<void> {
  const response = await fetch(`${apiOrigin}/api/exams/${encodeURIComponent(examId)}/shares`, {
    method: 'PUT',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(shares),
  });
  if (!response.ok) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Encrypted shares could not be uploaded (HTTP ${response.status}).`);
    }
    throw new Error(errorMessage(payload, `Encrypted shares could not be uploaded (HTTP ${response.status}).`));
  }
}

function blankStatuses(): CeremonyStepStatus[] {
  return Array.from({ length: 6 }, () => 'pending');
}

export function KeyCeremonyContainer() {
  const { examId = '' } = useParams<{ examId: string }>();
  const guard = useAuthGuard(['AUTHORITY']);
  const tx = useTransaction();
  const contractState = useExamVaultContract();
  const rawContract = contractState.contract;
  const { exams, isLoading: examsLoading, error: examsError, refetch } = useExams({
    enabled: guard.isAuthorized,
  });
  const [onChainState, setOnChainState] = useState<number | null>(null);
  const [chainTime, setChainTime] = useState<number | null>(null);
  const [holderKeys, setHolderKeys] = useState<Record<string, boolean>>({});
  const [readError, setReadError] = useState<Error | null>(null);
  const [isReadingExam, setIsReadingExam] = useState(false);
  const [stepStatuses, setStepStatuses] = useState<CeremonyStepStatus[]>(blankStatuses);
  const [prepared, setPrepared] = useState<PreparedCeremony | null>(null);
  const [sharesUploaded, setSharesUploaded] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const activeTransactionHash = useRef<string | null>(null);

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
  const panel = useExamPanel(examId || null, { contract: panelContract });
  const summary = exams.find((exam) => exam.examId === examId);

  const refreshOnChainState = useCallback(async () => {
    if (!rawContract || !examId || !/^\d+$/.test(examId)) {
      setOnChainState(null);
      setChainTime(null);
      setHolderKeys({});
      return;
    }
    setIsReadingExam(true);
    setReadError(null);
    try {
      const runner = rawContract.runner;
      const provider = runner && 'provider' in runner ? runner.provider : null;
      if (!provider) {
        throw new Error('The connected wallet has no readable chain provider.');
      }
      const [exam, block] = await Promise.all([
        rawContract.getFunction('getExam')(BigInt(examId)),
        provider.getBlock('latest'),
      ]);
      if (!block) {
        throw new Error('The latest chain block could not be read.');
      }
      setOnChainState(Number(exam.state ?? exam[1]));
      setChainTime(block.timestamp);
      if (panel.holders.length === 0) {
        setHolderKeys({});
        return;
      }
      const entries = await Promise.all(
        panel.holders.map(async (address) => {
          const value = await rawContract.getFunction('encryptionKeys')(address);
          const key = typeof value === 'string' ? value : ethers.hexlify(value);
          return [address.toLowerCase(), ethers.getBytes(key).length === 65] as const;
        }),
      );
      setHolderKeys(Object.fromEntries(entries));
    } catch (thrownError) {
      setReadError(
        thrownError instanceof Error
          ? thrownError
          : new Error('Failed to read the exam state and holder keys.'),
      );
      setChainTime(null);
      setHolderKeys({});
    } finally {
      setIsReadingExam(false);
    }
  }, [examId, panel.holders, rawContract]);

  useEffect(() => {
    if (guard.isAuthorized && summary && !panel.isLoading) {
      void refreshOnChainState();
    }
  }, [guard.isAuthorized, panel.isLoading, refreshOnChainState, summary]);

  const retryRead = useCallback(async () => {
    setReadError(null);
    try {
      await refetch();
      await panel.refetch();
    } catch (thrownError) {
      setReadError(thrownError instanceof Error ? thrownError : new Error('Exam data refresh failed.'));
    }
    await refreshOnChainState();
  }, [panel.refetch, refetch, refreshOnChainState]);

  const holders = panel.holders.map((address) => ({
    address,
    keyRegistered: holderKeys[address.toLowerCase()] === true,
  }));
  const allKeysReady = holders.length >= 3 && holders.every((holder) => holder.keyRegistered);
  const disabledReason = !summary
    ? 'Exam metadata is not available from the authenticated exam list.'
    : onChainState !== null && onChainState !== 0
      ? 'The key ceremony can only open collection for an exam in Draft state.'
      : !allKeysReady
        ? 'Every assigned holder must have a registered encryption key.'
        : chainTime === null
          ? 'Current chain time is unavailable.'
          : summary.releaseOpensAt && Number(summary.releaseOpensAt) <= chainTime
          ? 'The release window has already opened; collection can no longer be started.'
          : null;

  const openCollection = useCallback(async (examPublicKey: Uint8Array) => {
    if (!rawContract) {
      throw new Error('A wallet-backed contract is required to open collection.');
    }
    activeTransactionHash.current = null;
    tx.startTx('Open collection');
    tx.setTxAwaitingSignature();
    try {
      const response = await rawContract.getFunction('openCollection')(
        BigInt(examId),
        ethers.hexlify(examPublicKey),
      );
      activeTransactionHash.current = response.hash;
      tx.setTxPending(response.hash);
      const receipt = await response.wait(1);
      if (!receipt || receipt.status !== 1) {
        throw new Error('The open collection transaction was not confirmed successfully.');
      }
      tx.setTxConfirmed(response.hash);
    } catch (thrownError) {
      const decoded = decodeContractError(thrownError);
      if (activeTransactionHash.current) {
        tx.setTxFailed(decoded.formatted);
      } else {
        tx.setActiveTx({
          status: 'failed',
          title: 'Open collection',
          errorMessage: decoded.formatted,
        });
      }
      throw new Error(decoded.formatted);
    }
  }, [examId, rawContract, tx]);

  const run = useCallback(async () => {
    if (!rawContract || !summary || !allKeysReady || isRunning || isComplete) {
      return;
    }
    setIsRunning(true);
    setFailureMessage(null);
    setStepStatuses(blankStatuses());
    let failingStep = 0;

    const updateStep = (index: number, status: CeremonyStepStatus) => {
      if (status === 'active') {
        failingStep = index;
      }
      setStepStatuses((current) => {
        const next = current.slice();
        next[index] = status;
        return next;
      });
    };

    try {
      await runCeremonyWorkflow({
        prepared,
        uploaded: sharesUploaded,
        prepare: async () => {
          const inputs = await Promise.all(
            panel.holders.map(async (holder) => {
              const publicKey = await rawContract.getFunction('encryptionKeys')(holder);
              return {
                address: ethers.getAddress(holder) as `0x${string}`,
                pubKey: ethers.getBytes(publicKey),
              };
            }),
          );
          const result = await runCeremony({
            examId: BigInt(examId),
            holders: inputs,
            threshold: summary.threshold,
          });
          return {
            examPublicKey: result.examPublicKey,
            encryptedShares: result.encryptedShares,
          };
        },
        upload: async (result) => {
          const shares: ShareUpload = {
            shares: result.encryptedShares.map(({ holder, envelope }) => ({
              holder,
              envelope: ethers.hexlify(envelope),
            })),
          };
          await uploadEncryptedShares(examId, shares);
        },
        openCollection,
        onPrepared: setPrepared,
        onUploaded: () => setSharesUploaded(true),
        onStep: updateStep,
      });
      setIsComplete(true);
      setPrepared(null);
      setSharesUploaded(false);
    } catch (thrownError) {
      setStepStatuses((current) => {
        const next = current.slice();
        next[failingStep] = 'error';
        return next;
      });
      setFailureMessage(
        thrownError instanceof Error
          ? thrownError.message
          : 'The ceremony failed. Retry the failed step.',
      );
    } finally {
      setIsRunning(false);
      await refreshOnChainState();
    }
  }, [
    allKeysReady,
    examId,
    isComplete,
    isRunning,
    openCollection,
    panel.holders,
    prepared,
    rawContract,
    refreshOnChainState,
    sharesUploaded,
    summary,
    chainTime,
  ]);

  const pageState = !guard.isAuthorized
    ? guard.guardState === 'no-role' ? 'permission' : 'loading'
    : examsLoading || contractState.isLoading || panel.isLoading || isReadingExam
      ? 'loading'
      : examsError || panel.error || contractState.error || readError
        ? 'error'
        : !summary
          ? 'empty'
          : 'ready';

  const ceremonyError = examsError ?? panel.error ?? contractState.error ?? readError;

  return (
    <KeyCeremonyView
      pageState={pageState}
      error={ceremonyError}
      retryRead={() => void retryRead()}
      examId={examId}
      threshold={summary?.threshold ?? 0}
      holders={holders}
      stepStatuses={stepStatuses}
      isRunning={isRunning}
      isComplete={isComplete}
      failureMessage={failureMessage}
      disabledReason={disabledReason}
      onRun={() => void run()}
    />
  );
}
