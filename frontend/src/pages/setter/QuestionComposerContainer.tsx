import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ethers } from 'ethers';
import { encryptBatch } from '@sigil/core/batch';
import { keccakJson } from '@sigil/core/canonical';
import { AddressSchema, ExamMetaSchema } from '@sigil/core/schemas';
import type { Address, BatchPlain, QuestionPlain } from '@sigil/core/types';
import { useAuthGuard } from '../../auth/useAuthGuard';
import { useExamVaultContract } from '../../contracts/useExamVaultContract';
import { useExams } from '../../hooks/useExams';
import type { ExamPanelContract } from '../../hooks/useExams';
import { useExamPanel } from '../../hooks/useExams';
import { useTransaction } from '../../shell/AppShell';
import { decodeContractError } from '../../utils/errors';
import type { paths } from '../../api/generated';
import { parseQuestionImport } from './question-import';
import { QuestionComposerView } from './QuestionComposerView';
import { runSetterSubmissionWorkflow } from './workflow';
import type {
  SetterAssignment,
  SetterSection,
  SetterSubmission,
  SubmissionProgress,
} from './types';
import type { PreparedSetterBatch } from './workflow';

type ExamDetailsResponse =
  paths['/api/exams/{id}']['get']['responses'][200]['content']['application/json'];
type BatchEventResponse =
  paths['/api/events']['get']['responses'][200]['content']['application/json'];
type BatchUploadRequest =
  paths['/api/exams/{id}/batches']['post']['requestBody']['content']['multipart/form-data'];

const apiOrigin = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:4000';
const EMPTY_PROGRESS: SubmissionProgress = {
  encrypt: 'pending',
  upload: 'pending',
  sign: 'pending',
  confirm: 'pending',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function apiError(payload: unknown, fallback: string): string {
  if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === 'string') {
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
    throw new Error(apiError(payload, `Request failed with HTTP ${response.status}.`));
  }
  return response.json() as Promise<T>;
}

async function uploadEncryptedBatch(
  examId: string,
  file: File,
  request: Omit<BatchUploadRequest, 'file'>,
): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  form.append('sectionId', request.sectionId);
  form.append('questionCount', request.questionCount);
  const response = await fetch(`${apiOrigin}/api/exams/${encodeURIComponent(examId)}/batches`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    body: form,
  });
  if (!response.ok) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Encrypted batch upload failed with HTTP ${response.status}.`);
    }
    throw new Error(apiError(payload, `Encrypted batch upload failed with HTTP ${response.status}.`));
  }
}

function stateName(state: number): string {
  return ['Draft', 'Collecting', 'Sealed', 'Released', 'Concluded', 'Cancelled'][state] ?? 'Unknown';
}

function metadataFromResponse(details: ExamDetailsResponse, examId: string) {
  if (!isRecord(details) || !('metaJson' in details)) {
    throw new Error(`Exam No. ${examId.padStart(4, '0')} has no persisted metadata.`);
  }
  let value: unknown = details.metaJson;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error(`Exam No. ${examId.padStart(4, '0')} metadata is not valid JSON.`);
    }
  }
  const parsed = ExamMetaSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Exam No. ${examId.padStart(4, '0')} metadata does not match the exam schema.`);
  }
  return parsed.data;
}

function eventSubmissions(response: BatchEventResponse, account: string): SetterSubmission[] {
  return response.events
    .filter((event) => event.type === 'BatchSubmitted' && event.actor?.toLowerCase() === account.toLowerCase())
    .flatMap((event) => {
      if (!isRecord(event.payloadJson)) return [];
      const sectionId = Number(event.payloadJson.sectionId);
      const questionCount = Number(event.payloadJson.questionCount);
      const hash = String(event.payloadJson.ciphertextHash ?? '');
      if (
        !Number.isInteger(sectionId) ||
        sectionId < 0 ||
        !Number.isInteger(questionCount) ||
        questionCount < 1 ||
        !/^0x[0-9a-f]{64}$/i.test(hash)
      ) {
        return [];
      }
      return [{
        id: event.id,
        sectionId,
        questionCount,
        hash,
        transactionHash: event.txHash,
        status: 'confirmed' as const,
        submittedAt: event.blockTimestamp,
      }];
    });
}

function createBatchFile(envelope: Uint8Array, examId: string, sectionId: number): File {
  const bytes = new ArrayBuffer(envelope.byteLength);
  new Uint8Array(bytes).set(envelope);
  return new File([bytes], `exam-${examId}-section-${sectionId}.sigilbatch`, {
    type: 'application/octet-stream',
  });
}

export function QuestionComposerContainer() {
  const { examId = '' } = useParams<{ examId: string }>();
  const guard = useAuthGuard(['SETTER']);
  const contractState = useExamVaultContract();
  const rawContract = contractState.contract;
  const tx = useTransaction();
  const assignedContract = useMemo<ExamPanelContract | null>(() => {
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
    enabled: guard.isAuthorized && assignedContract !== null,
    assignedOnly: true,
    userAddress: guard.account,
    contract: assignedContract,
  });
  const panelContract = useMemo(() => assignedContract, [assignedContract]);
  const panel = useExamPanel(
    guard.isAuthorized && /^\d+$/.test(examId) ? examId : null,
    { contract: panelContract },
  );
  const [exam, setExam] = useState<SetterAssignment | null>(null);
  const [examPublicKey, setExamPublicKey] = useState<Uint8Array | null>(null);
  const [submissions, setSubmissions] = useState<SetterSubmission[]>([]);
  const [pageError, setPageError] = useState<Error | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isNotFound, setIsNotFound] = useState(false);
  const [isNotAssigned, setIsNotAssigned] = useState(false);
  const [progress, setProgress] = useState<SubmissionProgress>(EMPTY_PROGRESS);
  const [hasPreparedBatch, setHasPreparedBatch] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const preparedBatch = useRef<PreparedSetterBatch | null>(null);
  const activeTransactionHash = useRef<string | null>(null);

  useEffect(() => () => {
    preparedBatch.current?.envelope.fill(0);
    preparedBatch.current = null;
  }, []);

  const loadExam = useCallback(async () => {
    setIsReading(true);
    setPageError(null);
    setIsNotFound(false);
    setIsNotAssigned(false);
    try {
      if (!/^\d+$/.test(examId) || BigInt(examId || '0') === 0n) {
        setIsNotFound(true);
        setExam(null);
        setExamPublicKey(null);
        return;
      }
      if (exams.error) throw exams.error;
      if (!guard.account || !rawContract) {
        throw contractState.error ?? new Error('A connected setter wallet is required to load this exam.');
      }
      if (panel.error) {
        if (decodeContractError(panel.error).name === 'ExamNotFound') {
          setIsNotFound(true);
          setExam(null);
          setExamPublicKey(null);
          return;
        }
        throw panel.error;
      }
      if (!panel.setters.some((address) => address.toLowerCase() === guard.account?.toLowerCase())) {
        setIsNotAssigned(true);
        setExam(null);
        setExamPublicKey(null);
        return;
      }
      const summary = exams.exams.find((item) => item.examId === examId);
      if (!summary) {
        throw new Error('The assigned exam is missing from the authenticated exam list.');
      }
      const [details, chainExam, totals, eventPage] = await Promise.all([
        getApiJson<ExamDetailsResponse>(`/api/exams/${encodeURIComponent(examId)}`),
        rawContract.getFunction('getExam')(BigInt(examId)),
        rawContract.getFunction('getSectionTotals')(BigInt(examId)),
        getApiJson<BatchEventResponse>(
          `/api/events?${new URLSearchParams({ exam: examId, type: 'BatchSubmitted', actor: guard.account, limit: '100' })}`,
        ),
      ]);
      const metadata = metadataFromResponse(details, examId);
      const quotas = Array.from(chainExam.quotas ?? chainExam[12], (value: unknown) => Number(value));
      const sectionCounts = Array.from(totals, (value: unknown) => Number(value));
      if (quotas.length !== metadata.sections.length) {
        throw new Error('On-chain section quotas do not match the stored exam metadata.');
      }
      const sections: SetterSection[] = metadata.sections.map((section, index) => {
        if (quotas[index] !== section.quota) {
          throw new Error(`Section ${section.name} quota does not match the on-chain exam configuration.`);
        }
        return {
          sectionId: index,
          name: section.name,
          quota: section.quota,
          submitted: sectionCounts[index] ?? 0,
        };
      });
      const publicKeyValue = chainExam.examPublicKey ?? chainExam[11];
      const key = ethers.getBytes(typeof publicKeyValue === 'string'
        ? publicKeyValue
        : ethers.hexlify(publicKeyValue));
      if (key.length !== 65 || key[0] !== 4) {
        throw new Error('The on-chain exam public key is missing or invalid.');
      }
      setExam({
        examId,
        title: metadata.title,
        state: stateName(Number(chainExam.state ?? chainExam[1])),
        sections,
      });
      setExamPublicKey(key);
      setSubmissions(eventSubmissions(eventPage, guard.account));
    } catch (thrownError) {
      setPageError(thrownError instanceof Error ? thrownError : new Error('Question composer data could not be loaded.'));
      setExam(null);
      setExamPublicKey(null);
    } finally {
      setIsReading(false);
    }
  }, [
    contractState.error,
    examId,
    exams.error,
    exams.exams,
    guard.account,
    panel.error,
    panel.setters,
    rawContract,
  ]);

  useEffect(() => {
    if (!guard.isAuthorized || !assignedContract || exams.isLoading || panel.isLoading || contractState.isLoading) return;
    void loadExam();
  }, [
    assignedContract,
    contractState.isLoading,
    examId,
    exams.isLoading,
    guard.isAuthorized,
    loadExam,
    panel.isLoading,
  ]);

  const retry = useCallback(async () => {
    setPageError(null);
    try {
      await exams.refetch();
      await panel.refetch();
    } catch (thrownError) {
      setPageError(thrownError instanceof Error ? thrownError : new Error('Exam data could not be refreshed.'));
    }
    await loadExam();
  }, [exams.refetch, loadExam, panel.refetch]);

  const handleImport = useCallback(async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      return parseQuestionImport(file.name, '', file.size);
    }
    return parseQuestionImport(file.name, await file.text(), file.size);
  }, []);

  const refreshHistory = useCallback(async () => {
    if (!guard.account || !examId) return;
    const query = new URLSearchParams({
      exam: examId,
      type: 'BatchSubmitted',
      actor: guard.account,
      limit: '100',
    });
    const response = await getApiJson<BatchEventResponse>(`/api/events?${query}`);
    setSubmissions(eventSubmissions(response, guard.account));
  }, [examId, guard.account]);

  const handleSubmit = useCallback(async (
    sectionId: number,
    questions: readonly QuestionPlain[],
  ) => {
    if (!rawContract || !guard.account || !examPublicKey || !exam) {
      throw new Error('The connected setter wallet and exam public key are required.');
    }
    if (exam.state !== 'Collecting') {
      throw new Error('Question batches can only be submitted while the exam is Collecting.');
    }
    const section = exam.sections.find((item) => item.sectionId === sectionId);
    if (!section || questions.length < 1 || questions.length > 500) {
      throw new Error('Choose an exam section and submit between 1 and 500 questions.');
    }
    const validAddress = AddressSchema.parse(guard.account) as Address;
    const batch: BatchPlain = {
      v: 1,
      examId,
      sectionId,
      setter: validAddress,
      questions,
    };
    const fingerprint = keccakJson(batch);
    setActionError(null);
    setStatusMessage(null);
    activeTransactionHash.current = null;
    tx.startTx('Submit encrypted question batch');
    const title = 'Submit encrypted question batch';

    try {
      const { prepared, transactionHash } = await runSetterSubmissionWorkflow({
        prepared: preparedBatch.current,
        fingerprint,
        encrypt: async () => {
          const encrypted = await encryptBatch(examPublicKey, batch);
          return {
            envelope: encrypted.envelope,
            hash: encrypted.hash,
            fingerprint,
            sectionId,
            questionCount: questions.length,
            uploaded: false,
          };
        },
        onPrepared: (nextPrepared) => {
          preparedBatch.current = nextPrepared;
          setHasPreparedBatch(true);
        },
        upload: async (nextPrepared) => {
          const file = createBatchFile(nextPrepared.envelope, examId, sectionId);
          const uploadRequest: Omit<BatchUploadRequest, 'file'> = {
            sectionId: String(sectionId),
            questionCount: String(questions.length),
          };
          await uploadEncryptedBatch(examId, file, uploadRequest);
        },
        onUploaded: (nextPrepared) => {
          preparedBatch.current = nextPrepared;
        },
        onPending: (hash) => {
          activeTransactionHash.current = hash;
          tx.setTxPending(hash);
        },
        sign: async (nextPrepared) => {
          tx.setTxAwaitingSignature();
          const response = await rawContract.getFunction('submitBatch')(
            BigInt(examId),
            sectionId,
            nextPrepared.hash,
            questions.length,
          );
          activeTransactionHash.current = response.hash;
          tx.setTxPending(response.hash);
          setSubmissions((current) => [
            {
              id: `pending:${response.hash}`,
              sectionId,
              questionCount: questions.length,
              hash: nextPrepared.hash,
              transactionHash: response.hash,
              status: 'pending',
            },
            ...current.filter((item) => item.transactionHash !== response.hash),
          ]);
          return response.hash;
        },
        confirm: async (hash, nextPrepared) => {
          const runner = rawContract.runner;
          const provider = runner && 'provider' in runner ? runner.provider : null;
          if (!provider) {
            throw new Error('The connected wallet has no readable chain provider.');
          }
          const receipt = await provider.waitForTransaction(hash, 1);
          if (!receipt || receipt.status !== 1) {
            nextPrepared.transactionHash = undefined;
            throw new Error('The submitBatch transaction was not confirmed successfully.');
          }
          tx.setTxConfirmed(hash);
        },
        onStep: (stage, step) => {
          setProgress((current) => ({ ...current, [stage]: step }));
        },
      });
      setStatusMessage('The encrypted batch was confirmed on-chain.');
      prepared.envelope.fill(0);
      preparedBatch.current = null;
      setHasPreparedBatch(false);
      try {
        await Promise.all([refreshHistory(), loadExam()]);
      } catch (thrownError) {
        setActionError(
          `The batch is confirmed on-chain, but the latest history could not be refreshed: ${
            thrownError instanceof Error ? thrownError.message : 'retry the page data.'
          }`,
        );
      }
    } catch (thrownError) {
      const message = decodeContractError(thrownError).formatted;
      setActionError(message);
      setStatusMessage(null);
      setProgress((current) => {
        const active = (Object.keys(current) as (keyof SubmissionProgress)[]).find((key) => current[key] === 'active');
        return active ? { ...current, [active]: 'error' } : current;
      });
      if (activeTransactionHash.current) {
        tx.setTxFailed(message);
        setSubmissions((current) => current.map((item) =>
          item.transactionHash === activeTransactionHash.current ? { ...item, status: 'failed' } : item,
        ));
      } else {
        tx.setActiveTx({ status: 'failed', title, errorMessage: message });
      }
      throw thrownError;
    }
  }, [exam, examId, examPublicKey, guard.account, loadExam, rawContract, refreshHistory, tx]);

  const pageState = !guard.isAuthorized
    ? guard.guardState === 'no-role' ? 'permission' : 'loading'
    : !/^\d+$/.test(examId) || BigInt(examId || '0') === 0n
      ? 'empty'
      : contractState.isLoading || exams.isLoading || panel.isLoading || isReading
        ? 'loading'
        : contractState.error || exams.error || panel.error || pageError
          ? 'error'
          : isNotAssigned
            ? 'permission'
            : isNotFound || !exam
              ? 'empty'
              : 'ready';

  return (
    <QuestionComposerView
      pageState={pageState}
      exam={exam}
      submissions={submissions}
      importErrors={[]}
      progress={progress}
      statusMessage={statusMessage}
      actionError={actionError}
      error={pageError ?? exams.error ?? panel.error ?? contractState.error}
      onRetry={() => void retry()}
      onImport={handleImport}
      onSubmit={handleSubmit}
      hasPreparedBatch={hasPreparedBatch}
    />
  );
}
