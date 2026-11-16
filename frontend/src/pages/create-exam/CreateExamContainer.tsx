import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keccakJson } from '@sigil/core/canonical';
import type { ExamConfig } from '../../../../packages/contracts-types/src/index';
import { ethers, type InterfaceAbi } from 'ethers';
import ExamVaultArtifact from '../../../../packages/contracts-types/abi/ExamVault.json';
import { useAuthGuard } from '../../auth/useAuthGuard';
import { useParticipants } from '../../hooks/useParticipants';
import type { ParticipantRecord } from '../../hooks/useParticipants';
import { useExamVaultContract } from '../../contracts/useExamVaultContract';
import { useTransaction } from '../../shell/AppShell';
import { decodeContractError } from '../../utils/errors';
import type { paths } from '../../api/generated';
import { CreateExamView } from './CreateExamView';
import type { ExamMetadata, ExamMetadataConfig, ExamWizardContext } from './types';

type MetadataRequest =
  paths['/api/exams/{id}/meta']['post']['requestBody']['content']['application/json'];

const apiOrigin = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:4000';
const contractInterface = new ethers.Interface(ExamVaultArtifact as InterfaceAbi);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readApiError(payload: unknown, fallback: string): string {
  if (
    isRecord(payload) &&
    isRecord(payload.error) &&
    typeof payload.error.message === 'string'
  ) {
    return payload.error.message;
  }
  return fallback;
}

async function storeExamMetadata(examId: string, metadata: MetadataRequest): Promise<void> {
  const response = await fetch(`${apiOrigin}/api/exams/${encodeURIComponent(examId)}/meta`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  });
  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Metadata storage failed with HTTP ${response.status}.`);
    }
    throw new Error(readApiError(payload, `Metadata storage failed with HTTP ${response.status}.`));
  }
}

function examIdFromReceipt(receipt: ethers.TransactionReceipt): string {
  for (const log of receipt.logs) {
    try {
      const parsed = contractInterface.parseLog(log);
      if (parsed?.name === 'ExamCreated') {
        return String(parsed.args.examId ?? parsed.args[0]);
      }
    } catch {
      continue;
    }
  }
  throw new Error('The confirmed transaction did not include an ExamCreated event.');
}

export function CreateExamContainer() {
  const guard = useAuthGuard(['AUTHORITY']);
  const navigate = useNavigate();
  const tx = useTransaction();
  const contractState = useExamVaultContract();
  const rawContract = contractState.contract;
  const {
    participants,
    isLoading: participantsLoading,
    error: participantsError,
    refetch,
  } = useParticipants({ enabled: guard.isAuthorized });
  const [encryptionKeys, setEncryptionKeys] = useState<Record<string, boolean>>({});
  const [chainTime, setChainTime] = useState<number | null>(null);
  const [minLeadSeconds, setMinLeadSeconds] = useState<number | null>(null);
  const [readError, setReadError] = useState<Error | null>(null);
  const [isReadingChain, setIsReadingChain] = useState(false);
  const [createdExamId, setCreatedExamId] = useState<string | null>(null);
  const [createdMetadata, setCreatedMetadata] = useState<ExamMetadata | null>(null);
  const [metadataStored, setMetadataStored] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittedHash = useRef<string | null>(null);

  const holders = useMemo(
    () => participants.filter((participant: ParticipantRecord) =>
      participant.roles.includes('HOLDER'),
    ),
    [participants],
  );

  const refreshChainData = useCallback(async () => {
    if (!rawContract) {
      setEncryptionKeys({});
      setChainTime(null);
      setMinLeadSeconds(null);
      return;
    }

    setIsReadingChain(true);
    setReadError(null);
    try {
      const runner = rawContract.runner;
      const provider = runner && 'provider' in runner ? runner.provider : null;
      if (!provider) {
        throw new Error('The connected wallet has no readable chain provider.');
      }
      const [block, minimum] = await Promise.all([
        provider.getBlock('latest'),
        rawContract.getFunction('minLeadSeconds')(),
      ]);
      if (!block) {
        throw new Error('The latest chain block could not be read.');
      }
      const nextKeys = await Promise.all(
        holders.map(async (holder) => {
          const value = await rawContract.getFunction('encryptionKeys')(holder.address);
          const key = typeof value === 'string' ? value : ethers.hexlify(value);
          return [holder.address.toLowerCase(), ethers.getBytes(key).length === 65] as const;
        }),
      );
      setEncryptionKeys(Object.fromEntries(nextKeys));
      setChainTime(block.timestamp);
      setMinLeadSeconds(Number(minimum));
    } catch (thrownError) {
      setReadError(
        thrownError instanceof Error
          ? thrownError
          : new Error('Failed to read holder keys and chain schedule.'),
      );
      setEncryptionKeys({});
      setChainTime(null);
      setMinLeadSeconds(null);
    } finally {
      setIsReadingChain(false);
    }
  }, [holders, rawContract]);

  useEffect(() => {
    if (guard.isAuthorized) {
      void refreshChainData();
    } else {
      setEncryptionKeys({});
      setChainTime(null);
      setMinLeadSeconds(null);
    }
  }, [guard.isAuthorized, refreshChainData]);

  const retry = useCallback(async () => {
    setReadError(null);
    try {
      await refetch();
    } catch (thrownError) {
      setReadError(thrownError instanceof Error ? thrownError : new Error('Participant refresh failed.'));
    }
    await refreshChainData();
  }, [refetch, refreshChainData]);

  const context: ExamWizardContext = {
    participants: participants.map((participant) => ({
      address: participant.address,
      roles: participant.roles,
    })),
    encryptionKeys,
    chainTime,
    minLeadSeconds,
  };

  const persistCreatedMetadata = useCallback(async () => {
    if (!createdExamId || !createdMetadata) {
      return;
    }
    setMetadataError(null);
    try {
      await storeExamMetadata(createdExamId, createdMetadata);
      setMetadataStored(true);
    } catch (thrownError) {
      setMetadataError(
        `Exam No. ${createdExamId.padStart(4, '0')} was created on-chain, but its metadata was not stored. ${
          thrownError instanceof Error ? thrownError.message : 'Retry metadata storage.'
        }`,
      );
    }
  }, [createdExamId, createdMetadata]);

  const handleCreate = useCallback(async (
    metadata: ExamMetadata,
    config: ExamMetadataConfig,
  ) => {
    if (!rawContract || createdExamId) {
      setMetadataError('A contract connection is required, or this exam is already created. Retry metadata storage instead.');
      return;
    }
    setIsSubmitting(true);
    submittedHash.current = null;
    setMetadataError(null);
    const title = 'Create exam';
    tx.startTx(title);
    tx.setTxAwaitingSignature();

    let transactionConfirmed = false;
    try {
      const metaHash = keccakJson(metadata);
      const contractConfig: ExamConfig = { metaHash, ...config };
      const response = await rawContract.getFunction('createExam')(contractConfig);
      submittedHash.current = response.hash;
      tx.setTxPending(response.hash);
      const receipt = await response.wait(1);
      if (!receipt || receipt.status !== 1) {
        throw new Error('The create exam transaction was not confirmed successfully.');
      }
      tx.setTxConfirmed(response.hash);
      transactionConfirmed = true;
      const examId = examIdFromReceipt(receipt);
      setCreatedExamId(examId);
      setCreatedMetadata(metadata);

      try {
        await storeExamMetadata(examId, metadata);
        setMetadataStored(true);
      } catch (thrownError) {
        setMetadataError(
          `Exam No. ${examId.padStart(4, '0')} was created on-chain, but its metadata was not stored. ${
            thrownError instanceof Error ? thrownError.message : 'Retry metadata storage.'
          }`,
        );
      }
    } catch (thrownError) {
      if (transactionConfirmed) {
        setMetadataError(
          thrownError instanceof Error
            ? `The transaction is confirmed, but the created exam could not be loaded: ${thrownError.message}`
            : 'The transaction is confirmed, but the created exam could not be loaded.',
        );
        return;
      }
      const decoded = decodeContractError(thrownError);
      if (submittedHash.current) {
        tx.setTxFailed(decoded.formatted);
      } else {
        tx.setActiveTx({
          status: 'failed',
          title,
          errorMessage: decoded.formatted,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [createdExamId, rawContract, tx]);

  const pageState = !guard.isAuthorized
    ? guard.guardState === 'no-role' ? 'permission' : 'loading'
    : participantsLoading || contractState.isLoading || isReadingChain
      ? 'loading'
      : participantsError || contractState.error || readError
        ? 'error'
        : participants.length === 0
          ? 'empty'
          : 'ready';

  return (
    <CreateExamView
      pageState={pageState}
      error={participantsError ?? contractState.error ?? readError}
      retry={() => void retry()}
      context={context}
      isSubmitting={isSubmitting}
      createdExamId={createdExamId}
      metadataStored={metadataStored}
      metadataError={metadataError}
      onCreate={(metadata, config) => void handleCreate(metadata, config)}
      onRetryMetadata={() => void persistCreatedMetadata()}
      onStartCeremony={(examId) => navigate(`/authority/exams/${examId}/ceremony`)}
    />
  );
}
