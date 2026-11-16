import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ethers } from 'ethers';
import { aadFor, decryptEnvelope } from '@sigil/core/envelope';
import { deriveReveal, createKeystore, randomnessCommitment, unlockKeystore } from '@sigil/core/keystore';
import { shareCommitment } from '@sigil/core/shares';
import type { Address, HolderKey } from '@sigil/core/types';
import { useAuthGuard } from '../../auth/useAuthGuard';
import { useExamVaultContract } from '../../contracts/useExamVaultContract';
import { useExamPanel, useExams, type ExamPanelContract } from '../../hooks/useExams';
import { useTransaction } from '../../shell/AppShell';
import { decodeContractError } from '../../utils/errors';
import { examStateFromChain, selectRosetteHash } from '../command-centre/logic';
import { fetchExamMetadata, fetchMyEncryptedShare } from './api';
import { holderContractMessage, passphraseErrorMessage } from './key-holder';
import { HolderConsoleView } from './HolderConsoleView';
import type { HolderConsoleSnapshot, HolderExamAssignment } from './types';

const EMPTY_BYTES32 = `0x${'0'.repeat(64)}`;

interface SecretMaterial {
  key: HolderKey;
  share: Uint8Array;
  shareCommitment: string;
}

function clearSecretMaterial(material: SecretMaterial | null): void {
  if (!material) return;
  material.share.fill(0);
  material.key.publicKey.fill(0);
  if (material.key.privateKeyJwk.d) material.key.privateKeyJwk.d = '';
  material.key.privateKeyJwk = {};
}

function bytesMatch(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isValidBytes32(value: string): boolean {
  return /^0x[0-9a-f]{64}$/i.test(value);
}

export function HolderConsoleContainer() {
  const { examId = '' } = useParams<{ examId: string }>();
  const guard = useAuthGuard(['HOLDER']);
  const contractState = useExamVaultContract();
  const rawContract = contractState.contract;
  const tx = useTransaction();
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
  const exams = useExams({ enabled: guard.isAuthorized });
  const panel = useExamPanel(
    guard.isAuthorized && /^\d+$/.test(examId) ? examId : null,
    { contract: panelContract },
  );
  const summary = exams.exams.find((item) => item.examId === examId);
  const [snapshot, setSnapshot] = useState<HolderConsoleSnapshot>({
    exam: null,
    keyRegistered: false,
    shareUnlocked: false,
    shareVerified: false,
    randomnessCommitted: false,
    shareSubmitted: false,
    submissionCount: 0,
    chainTime: null,
  });
  const [isReading, setIsReading] = useState(false);
  const [readError, setReadError] = useState<Error | null>(null);
  const [isNotAssigned, setIsNotAssigned] = useState(false);
  const [setupPassphrase, setSetupPassphrase] = useState('');
  const [releasePassphrase, setReleasePassphrase] = useState('');
  const setupPassphraseRef = useRef('');
  const releasePassphraseRef = useRef('');
  const generatedKeystoreRef = useRef<string | null>(null);
  const generatedPublicKeyRef = useRef<Uint8Array | null>(null);
  const keystoreTextRef = useRef<string | null>(null);
  const secretMaterialRef = useRef<SecretMaterial | null>(null);
  const encryptionKeyRef = useRef<Uint8Array | null>(null);
  const shareCommitmentRef = useRef<string | null>(null);
  const examContextRef = useRef({ examId, account: guard.account });
  const activeTransactionHash = useRef<string | null>(null);
  const [hasGeneratedKeystore, setHasGeneratedKeystore] = useState(false);
  const [hasDownloadedKeystore, setHasDownloadedKeystore] = useState(false);
  const [hasKeystoreFile, setHasKeystoreFile] = useState(false);
  const [isGeneratingKeystore, setIsGeneratingKeystore] = useState(false);
  const [isRegisteringKey, setIsRegisteringKey] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isCommittingRandomness, setIsCommittingRandomness] = useState(false);
  const [isSubmittingShare, setIsSubmittingShare] = useState(false);
  const [isTransactionPending, setIsTransactionPending] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [clientNow, setClientNow] = useState(() => Date.now());
  const chainTimeReadAt = useRef(0);

  const wipeSecretRefs = useCallback(() => {
    clearSecretMaterial(secretMaterialRef.current);
    secretMaterialRef.current = null;
    keystoreTextRef.current = null;
    setupPassphraseRef.current = '';
    releasePassphraseRef.current = '';
  }, []);

  const resetSecrets = useCallback(() => {
    wipeSecretRefs();
    setReleasePassphrase('');
    setSnapshot((current) => ({ ...current, shareUnlocked: false, shareVerified: false }));
    setHasKeystoreFile(false);
  }, [wipeSecretRefs]);

  const clearSecrets = useCallback(() => {
    resetSecrets();
    setActionMessage('In-memory key and share references were cleared. Re-select the keystore to unlock again.');
    setActionError(null);
  }, [resetSecrets]);

  useEffect(() => () => {
    wipeSecretRefs();
    generatedKeystoreRef.current = null;
    generatedPublicKeyRef.current?.fill(0);
    generatedPublicKeyRef.current = null;
    encryptionKeyRef.current?.fill(0);
    encryptionKeyRef.current = null;
    setupPassphraseRef.current = '';
    releasePassphraseRef.current = '';
  }, [wipeSecretRefs]);

  useEffect(() => {
    const timer = window.setInterval(() => setClientNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const previous = examContextRef.current;
    if (previous.examId !== examId || previous.account !== guard.account) {
      wipeSecretRefs();
      encryptionKeyRef.current?.fill(0);
      encryptionKeyRef.current = null;
      shareCommitmentRef.current = null;
      setReleasePassphrase('');
      setHasKeystoreFile(false);
      setSnapshot({
        exam: null,
        keyRegistered: false,
        shareUnlocked: false,
        shareVerified: false,
        randomnessCommitted: false,
        shareSubmitted: false,
        submissionCount: 0,
        chainTime: null,
      });
    }
    examContextRef.current = { examId, account: guard.account };
  }, [examId, guard.account, wipeSecretRefs]);

  const loadHolderExam = useCallback(async () => {
    setIsReading(true);
    setReadError(null);
    setIsNotAssigned(false);
    if (!/^\d+$/.test(examId) || BigInt(examId || '0') === 0n) {
      setSnapshot((current) => ({ ...current, exam: null }));
      setIsReading(false);
      return;
    }
    try {
      if (exams.error) throw exams.error;
      if (panel.error) {
        if (decodeContractError(panel.error).name === 'ExamNotFound') {
          setSnapshot((current) => ({ ...current, exam: null }));
          setIsReading(false);
          return;
        }
        throw panel.error;
      }
      if (!summary) {
        setSnapshot((current) => ({ ...current, exam: null }));
        setIsReading(false);
        return;
      }
      if (!guard.account || !rawContract) {
        throw contractState.error ?? new Error('A connected key holder wallet is required to load this exam.');
      }
      if (!panel.holders.some((address) => address.toLowerCase() === guard.account?.toLowerCase())) {
        setIsNotAssigned(true);
        setSnapshot((current) => ({ ...current, exam: null }));
        setIsReading(false);
        return;
      }
      const runner = rawContract.runner;
      const provider = runner && 'provider' in runner ? runner.provider : null;
      if (!provider) throw new Error('The connected wallet has no readable chain provider.');

      const [metadata, block, keyValue, commitmentValue, randomnessIsCommitted, shareIsSubmitted, count] =
        await Promise.all([
          fetchExamMetadata(examId),
          provider.getBlock('latest'),
          rawContract.getFunction('encryptionKeys')(guard.account),
          rawContract.getFunction('getShareCommitment')(BigInt(examId), guard.account),
          rawContract.getFunction('hasCommittedRandomness')(BigInt(examId), guard.account),
          rawContract.getFunction('hasSubmittedShare')(BigInt(examId), guard.account),
          rawContract.getFunction('getShareSubmissionCount')(BigInt(examId)),
        ]);
      if (!block) throw new Error('The latest chain block could not be read.');
      const encryptionKey = ethers.getBytes(typeof keyValue === 'string' ? keyValue : ethers.hexlify(keyValue));
      const commitment = String(commitmentValue);
      if (!isValidBytes32(commitment)) {
        throw new Error('The on-chain holder share commitment is not a bytes32 value.');
      }
      const state = examStateFromChain(summary.state);
      if (!state) throw new Error(`Exam No. ${examId.padStart(4, '0')} has an unknown chain state.`);
      const currentSecrets = secretMaterialRef.current;
      const shareUnlocked = Boolean(
        currentSecrets &&
        (
          commitment.toLowerCase() === EMPTY_BYTES32.toLowerCase() ||
          currentSecrets.shareCommitment.toLowerCase() === commitment.toLowerCase()
        ),
      );
      if (currentSecrets && !shareUnlocked) {
        clearSecretMaterial(currentSecrets);
        secretMaterialRef.current = null;
      }
      chainTimeReadAt.current = Date.now();
      const exam: HolderExamAssignment = {
        examId,
        title: metadata.title,
        state,
        rosetteHash: selectRosetteHash(state, summary.metaHash, summary.bankHash ?? EMPTY_BYTES32),
        releaseOpensAt: Number(summary.releaseOpensAt),
        examStartsAt: Number(summary.examStartsAt),
        examEndsAt: Number(summary.examEndsAt),
        threshold: summary.threshold,
        holderCount: panel.holders.length,
        sections: metadata.sections.map(({ name, quota }) => ({ name, quota })),
      };
      encryptionKeyRef.current = encryptionKey;
      shareCommitmentRef.current = commitment;
      setSnapshot((current) => ({
        ...current,
        exam,
        keyRegistered: encryptionKey.length === 65 && encryptionKey[0] === 4,
        shareUnlocked,
        shareVerified: shareUnlocked && commitment.toLowerCase() !== EMPTY_BYTES32.toLowerCase(),
        randomnessCommitted: Boolean(randomnessIsCommitted),
        shareSubmitted: Boolean(shareIsSubmitted),
        submissionCount: Number(count),
        chainTime: block.timestamp,
      }));
    } catch (thrownError) {
      setReadError(thrownError instanceof Error ? thrownError : new Error('Holder exam data could not be loaded.'));
      setSnapshot((current) => ({ ...current, exam: null }));
    } finally {
      setIsReading(false);
    }
  }, [
    contractState.error,
    examId,
    exams.error,
    guard.account,
    panel.error,
    panel.holders,
    rawContract,
    summary,
    wipeSecretRefs,
  ]);

  useEffect(() => {
    if (!guard.isAuthorized || exams.isLoading || panel.isLoading || contractState.isLoading) return;
    void loadHolderExam();
  }, [
    contractState.isLoading,
    exams.isLoading,
    guard.isAuthorized,
    loadHolderExam,
    panel.isLoading,
  ]);

  const retry = useCallback(async () => {
    setReadError(null);
    try {
      await Promise.all([exams.refetch(), panel.refetch()]);
    } catch (thrownError) {
      setReadError(thrownError instanceof Error ? thrownError : new Error('Holder exam data could not be refreshed.'));
      return;
    }
    await loadHolderExam();
  }, [exams.refetch, loadHolderExam, panel.refetch]);

  const executeTransaction = useCallback(async (
    title: string,
    operation: () => Promise<ethers.TransactionResponse>,
  ): Promise<string> => {
    activeTransactionHash.current = null;
    setActionError(null);
    setActionMessage(null);
    setIsTransactionPending(true);
    tx.startTx(title);
    try {
      tx.setTxAwaitingSignature();
      const response = await operation();
      activeTransactionHash.current = response.hash;
      tx.setTxPending(response.hash);
      const receipt = await response.wait(1);
      if (!receipt || receipt.status !== 1) {
        throw new Error(`${title} transaction was not confirmed successfully.`);
      }
      tx.setTxConfirmed(response.hash);
      return response.hash;
    } catch (thrownError) {
      const decoded = decodeContractError(thrownError);
      const message = holderContractMessage(decoded.name) ?? decoded.formatted;
      setActionError(message);
      if (activeTransactionHash.current) {
        tx.setTxFailed(message);
      } else {
        tx.setActiveTx({ status: 'failed', title, errorMessage: message });
      }
      throw new Error(message);
    } finally {
      activeTransactionHash.current = null;
      setIsTransactionPending(false);
    }
  }, [tx]);

  const handleSetupPassphraseChange = useCallback((value: string) => {
    setupPassphraseRef.current = value;
    setSetupPassphrase(value);
  }, []);

  const handleReleasePassphraseChange = useCallback((value: string) => {
    releasePassphraseRef.current = value;
    setReleasePassphrase(value);
  }, []);

  const generateKeystore = useCallback(async () => {
    const passphrase = setupPassphraseRef.current;
    setupPassphraseRef.current = '';
    setSetupPassphrase('');
    setActionError(null);
    setActionMessage(null);
    if (passphrase.length < 12) {
      setActionError('Passphrase must be at least 12 characters.');
      return;
    }
    setIsGeneratingKeystore(true);
    try {
      const generated = await createKeystore(passphrase);
      generatedKeystoreRef.current = generated.keystore;
      generatedPublicKeyRef.current = generated.pubKey;
      setHasGeneratedKeystore(true);
      setHasDownloadedKeystore(false);
      setActionMessage('Keystore generated in this browser. Download it once before registering the public key.');
    } catch (thrownError) {
      setActionError(thrownError instanceof Error ? thrownError.message : 'Keystore generation failed.');
    } finally {
      setIsGeneratingKeystore(false);
    }
  }, []);

  const downloadKeystore = useCallback(() => {
    const keystore = generatedKeystoreRef.current;
    if (!keystore || hasDownloadedKeystore) {
      setActionError('The keystore is unavailable or has already been downloaded.');
      return;
    }
    const blob = new Blob([keystore], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `No-${examId.padStart(4, '0')}.sigilkey`;
    link.click();
    URL.revokeObjectURL(objectUrl);
    generatedKeystoreRef.current = null;
    setHasDownloadedKeystore(true);
    setActionMessage('The .sigilkey file was downloaded once. Keep it safe; a lost keystore means a lost share.');
  }, [examId, hasDownloadedKeystore]);

  const registerKey = useCallback(async () => {
    const publicKey = generatedPublicKeyRef.current;
    if (!rawContract || !publicKey || !hasDownloadedKeystore) {
      setActionError('Generate and download the keystore before registering its public key.');
      return;
    }
    setIsRegisteringKey(true);
    try {
      await executeTransaction('Register holder encryption key', () =>
        rawContract.getFunction('setEncryptionKey')(ethers.hexlify(publicKey)),
      );
      encryptionKeyRef.current = publicKey.slice();
      publicKey.fill(0);
      generatedPublicKeyRef.current = null;
      setSnapshot((current) => ({ ...current, keyRegistered: true }));
      setActionMessage('The public encryption key is registered on-chain.');
    } catch {
      return;
    } finally {
      setIsRegisteringKey(false);
    }
  }, [executeTransaction, hasDownloadedKeystore, rawContract]);

  const selectKeystoreFile = useCallback(async (file: File | null) => {
    wipeSecretRefs();
    setSnapshot((current) => ({ ...current, shareUnlocked: false, shareVerified: false }));
    setReleasePassphrase('');
    setActionError(null);
    setActionMessage(null);
    if (!file) {
      setHasKeystoreFile(false);
      return;
    }
    try {
      keystoreTextRef.current = await file.text();
      setHasKeystoreFile(true);
    } catch (thrownError) {
      keystoreTextRef.current = null;
      setHasKeystoreFile(false);
      setActionError(thrownError instanceof Error ? thrownError.message : 'The keystore file could not be read.');
    }
  }, [wipeSecretRefs]);

  const unlockShare = useCallback(async () => {
    const passphrase = releasePassphraseRef.current;
    releasePassphraseRef.current = '';
    setReleasePassphrase('');
    setActionError(null);
    setActionMessage(null);
    if (!keystoreTextRef.current) {
      setActionError('Choose the downloaded .sigilkey file before unlocking.');
      return;
    }
    if (passphrase.length < 12) {
      setActionError('Passphrase must be at least 12 characters.');
      return;
    }
    if (!guard.account || !snapshot.exam || !rawContract) {
      setActionError('A connected holder wallet and exam are required to verify the share.');
      return;
    }
    setIsUnlocking(true);
    let key: HolderKey | null = null;
    let share: Uint8Array | null = null;
    let phase: 'keystore' | 'share' = 'keystore';
    try {
      key = await unlockKeystore(keystoreTextRef.current, passphrase);
      if (!encryptionKeyRef.current || !bytesMatch(key.publicKey, encryptionKeyRef.current)) {
        throw new Error('This keystore public key does not match the key registered on-chain.');
      }
      phase = 'share';
      const envelope = await fetchMyEncryptedShare(examId);
      if (
        envelope.examId !== examId ||
        ethers.getAddress(envelope.holder) !== ethers.getAddress(guard.account)
      ) {
        throw new Error('The encrypted share response is not for this exam and holder wallet.');
      }
      share = await decryptEnvelope(
        key.privateKeyJwk,
        ethers.getBytes(envelope.envelope),
        aadFor(BigInt(examId), 'share', ethers.getAddress(guard.account).toLowerCase()),
      );
      const actualCommitment = shareCommitment(
        BigInt(examId),
        ethers.getAddress(guard.account) as Address,
        share,
      );
      if (
        shareCommitmentRef.current &&
        shareCommitmentRef.current.toLowerCase() !== EMPTY_BYTES32.toLowerCase() &&
        actualCommitment.toLowerCase() !== shareCommitmentRef.current.toLowerCase()
      ) {
        throw new Error('Share mismatch: the decrypted share does not match the on-chain commitment.');
      }
      secretMaterialRef.current = { key, share, shareCommitment: actualCommitment };
      key = null;
      share = null;
      const alreadyCommitted = Boolean(
        shareCommitmentRef.current &&
        shareCommitmentRef.current.toLowerCase() !== EMPTY_BYTES32.toLowerCase(),
      );
      setSnapshot((current) => ({
        ...current,
        shareUnlocked: true,
        shareVerified: alreadyCommitted,
      }));
      setActionMessage(alreadyCommitted
        ? 'Share verified against its on-chain commitment. The share remains in memory only.'
        : 'Share decrypted. Commit randomness to register and verify its commitment on-chain.');
    } catch (thrownError) {
      clearSecretMaterial(
        key ? { key, share: share ?? new Uint8Array(), shareCommitment: '' } : null,
      );
      const message = phase === 'keystore'
        ? passphraseErrorMessage(thrownError)
        : thrownError instanceof Error
          ? thrownError.message
          : 'The encrypted share could not be verified.';
      setActionError(message);
    } finally {
      releasePassphraseRef.current = '';
      setReleasePassphrase('');
      setIsUnlocking(false);
    }
  }, [examId, guard.account, rawContract, snapshot.exam]);

  const commitRandomness = useCallback(async () => {
    if (!rawContract || !guard.account || !snapshot.exam || !secretMaterialRef.current) {
      setActionError('Unlock and verify the share before committing randomness.');
      return;
    }
    const material = secretMaterialRef.current;
    const shareCommit = material.shareCommitment;
    if (!isValidBytes32(shareCommit)) {
      setActionError('The decrypted share commitment is not a bytes32 value.');
      return;
    }
    if (snapshot.exam.state !== 'Collecting') {
      setActionError('Randomness can be committed only while collection is open.');
      return;
    }
    setIsCommittingRandomness(true);
    setActionError(null);
    try {
      const reveal = await deriveReveal(secretMaterialRef.current.key, BigInt(examId));
      const randomnessCommit = randomnessCommitment(
        BigInt(examId),
        ethers.getAddress(guard.account) as Address,
        reveal,
      );
      await executeTransaction('Commit holder randomness', () =>
        rawContract.getFunction('commitRandomness')(
          BigInt(examId),
          shareCommit,
          randomnessCommit,
        ),
      );
      const onChainShareCommitment = String(
        await rawContract.getFunction('getShareCommitment')(BigInt(examId), guard.account),
      );
      if (onChainShareCommitment.toLowerCase() !== shareCommit.toLowerCase()) {
        setSnapshot((current) => ({ ...current, shareVerified: false, randomnessCommitted: true }));
        throw new Error('The confirmed on-chain share commitment does not match the decrypted share.');
      }
      shareCommitmentRef.current = onChainShareCommitment;
      setSnapshot((current) => ({
        ...current,
        shareVerified: true,
        randomnessCommitted: true,
      }));
      setActionMessage('Randomness commitment confirmed. The reveal was not displayed or retained.');
    } catch (thrownError) {
      setActionError(thrownError instanceof Error ? thrownError.message : 'Randomness commitment failed.');
    } finally {
      setIsCommittingRandomness(false);
    }
  }, [examId, executeTransaction, guard.account, rawContract, snapshot.exam]);

  const submitShare = useCallback(async () => {
    const material = secretMaterialRef.current;
    if (!rawContract || !snapshot.exam || !material) {
      setActionError('Unlock and verify the encrypted share before submitting.');
      return;
    }
    setIsSubmittingShare(true);
    setActionError(null);
    try {
      const reveal = await deriveReveal(material.key, BigInt(examId));
      await executeTransaction('Submit share and reveal', () =>
        rawContract.getFunction('submitShare')(BigInt(examId), material.share, reveal),
      );
      clearSecrets();
      setSnapshot((current) => ({
        ...current,
        shareUnlocked: false,
        shareVerified: false,
        shareSubmitted: true,
        submissionCount: current.submissionCount + 1,
      }));
      setActionMessage('Share and reveal confirmed on-chain. In-memory share and key references were cleared.');
    } catch (thrownError) {
      const message = thrownError instanceof Error ? thrownError.message : 'Share submission failed.';
      resetSecrets();
      setActionMessage(null);
      setActionError(message);
    } finally {
      setIsSubmittingShare(false);
    }
  }, [examId, executeTransaction, rawContract, resetSecrets, snapshot.exam]);

  const pageState = !guard.isAuthorized
    ? guard.guardState === 'no-role' ? 'permission' : 'loading'
    : !/^\d+$/.test(examId) || BigInt(examId || '0') === 0n
      ? 'empty'
      : contractState.isLoading || exams.isLoading || panel.isLoading || isReading
        ? 'loading'
        : contractState.error || exams.error || panel.error || readError
          ? 'error'
          : isNotAssigned
            ? 'permission'
            : !snapshot.exam
              ? 'empty'
              : 'ready';
  const estimatedChainTime = snapshot.chainTime === null
    ? null
    : snapshot.chainTime + Math.floor(Math.max(0, clientNow - chainTimeReadAt.current) / 1000);
  const visibleSnapshot = { ...snapshot, chainTime: estimatedChainTime };

  return (
    <HolderConsoleView
      pageState={pageState}
      snapshot={visibleSnapshot}
      error={readError ?? exams.error ?? panel.error ?? contractState.error}
      actions={{
        setupPassphrase,
        releasePassphrase,
        isGeneratingKeystore,
        hasGeneratedKeystore,
        hasDownloadedKeystore,
        hasKeystoreFile,
        isRegisteringKey,
        isUnlocking,
        isCommittingRandomness,
        isSubmittingShare,
        isTransactionPending,
        actionMessage,
        actionError,
        onSetupPassphraseChange: handleSetupPassphraseChange,
        onGenerateKeystore: () => void generateKeystore(),
        onDownloadKeystore: downloadKeystore,
        onRegisterKey: () => void registerKey(),
        onKeystoreFile: (file) => void selectKeystoreFile(file),
        onReleasePassphraseChange: handleReleasePassphraseChange,
        onUnlockShare: () => void unlockShare(),
        onCommitRandomness: () => void commitRandomness(),
        onSubmitShare: () => void submitShare(),
        onClearSecrets: clearSecrets,
        onRetry: () => void retry(),
      }}
    />
  );
}
