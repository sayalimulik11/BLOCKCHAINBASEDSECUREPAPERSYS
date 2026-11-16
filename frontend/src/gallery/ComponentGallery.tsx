import React, { useState } from 'react';
import {
  tokens,
  standardAuditPairs,
  getContrastRatio,
  Button,
  Field,
  FieldError,
  Select,
  Dialog,
  Popover,
  Tabs,
  ToastProvider,
  useToast,
  Tooltip,
  EmptyState,
  CustodyBubbles,
  Coupon,
  Rosette,
  Serial,
  HashChip,
  ThresholdMeter,
  CountdownLock,
  LedgerTable,
  TxDrawer,
  StateStamp,
  ExamState,
  TxStatus,
} from '@sigil/ui';
import {
  ConnectWalletGuard,
  SignInGuard,
  WrongNetworkGuard,
  NoRoleGuard,
} from '../components/guards/GuardScreens';
import { ParticipantsView } from '../pages/participants/ParticipantsView';
import { DocketView } from '../pages/docket/DocketView';
import { ParticipantRecord, ParticipantRole } from '../pages/participants/types';
import { DocketExam } from '../pages/docket/types';
import { CreateExamView } from '../pages/create-exam/CreateExamView';
import { KeyCeremonyView } from '../pages/key-ceremony/KeyCeremonyView';
import { CommandCentreView } from '../pages/command-centre/CommandCentreView';
import type {
  CommandCentreExam,
  CommandCentreReadinessRow,
} from '../pages/command-centre/types';
import { SetterAssignmentsView } from '../pages/setter/SetterAssignmentsView';
import { QuestionComposerView } from '../pages/setter/QuestionComposerView';
import type {
  QuestionComposerViewProps,
  SetterAssignment,
  SetterPageState,
  SetterSubmission,
  SubmissionProgress,
} from '../pages/setter/types';
import type { QuestionImportError } from '../pages/setter/question-import';
import { HolderAssignmentsView } from '../pages/holder/HolderAssignmentsView';
import { HolderConsoleView } from '../pages/holder/HolderConsoleView';
import type {
  HolderAssignmentsViewProps,
  HolderConsoleActions,
  HolderConsoleSnapshot,
  HolderExamAssignment,
  HolderPageState,
} from '../pages/holder/types';
import { timestampInputValue } from '../pages/create-exam/validation';
import type { ExamWizardContext, ExamWizardDraft } from '../pages/create-exam/types';

function ToastButtons() {
  const { showToast } = useToast();
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => showToast({ title: 'Information notice', description: 'Exam batch synchronized with ledger.', variant: 'info' })}
      >
        Trigger info toast
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => showToast({ title: 'Paper release confirmed', description: 'Threshold reached: 3 of 5 shares verified.', variant: 'success' })}
      >
        Trigger success toast
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => showToast({ title: 'Transaction reverted', description: 'Error: QuotaNotMet(sectionId: 1, have: 48, need: 50).', variant: 'alert' })}
      >
        Trigger alert toast
      </Button>
    </div>
  );
}

export function ComponentGallery() {
  // Interactive state demo
  const [bubbleState, setBubbleState] = useState<ExamState>('Sealed');
  const [selectVal, setSelectVal] = useState('physics');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [interactiveHash, setInteractiveHash] = useState('0x742d35Cc6634C0532925a3b844Bc454e4438f44e');
  const [txState, setTxState] = useState<TxStatus>('pending');
  const [thresholdCount, setThresholdCount] = useState(3);

  // Table sample data
  const tableData = [
    { serial: 1, title: 'National entrance evaluation 2026', state: 'Sealed' as ExamState, holders: '3 / 5', created: '2026-10-31' },
    { serial: 2, title: 'State eligibility diagnostic paper', state: 'Collecting' as ExamState, holders: '0 / 3', created: '2026-10-30' },
    { serial: 3, title: 'General physics quota test', state: 'Released' as ExamState, holders: '4 / 5', created: '2026-10-28' },
    { serial: 4, title: 'Biology core section trial', state: 'Cancelled' as ExamState, holders: '1 / 3', created: '2026-10-25' },
    { serial: 7, title: 'Practice exam, September', state: 'Draft' as ExamState, holders: '0 / 4', created: '2026-10-24' },
  ];

  // FA-05: Page states sample data & inspection controls
  const [participantsState, setParticipantsState] = useState<'populated' | 'loading' | 'empty' | 'error' | 'permission'>('populated');
  const [docketState, setDocketState] = useState<'populated' | 'loading' | 'empty' | 'error' | 'permission'>('populated');
  const [galleryRoleFilter, setGalleryRoleFilter] = useState<ParticipantRole | 'ALL'>('ALL');
  const [galleryDocketFilter, setGalleryDocketFilter] = useState<string | 'ALL'>('ALL');
  const [gallerySearchQuery, setGallerySearchQuery] = useState<string>('');
  const [createExamGalleryState, setCreateExamGalleryState] = useState<
    'populated' | 'loading' | 'empty' | 'error' | 'permission' | 'created' | 'metadata-error'
  >('populated');
  const [ceremonyGalleryState, setCeremonyGalleryState] = useState<
    'ready' | 'loading' | 'empty' | 'error' | 'permission' | 'blocked' | 'failed' | 'complete'
  >('ready');
  const [commandCentrePageState, setCommandCentrePageState] = useState<
    'ready' | 'loading' | 'empty' | 'error' | 'permission'
  >('ready');
  const [commandCentreExamState, setCommandCentreExamState] = useState<
    'Draft' | 'Collecting' | 'Sealed' | 'Released' | 'Concluded' | 'Cancelled'
  >('Collecting');
  const [commandCentreSealState, setCommandCentreSealState] = useState<
    'quota' | 'randomness' | 'ready'
  >('quota');
  const [setterAssignmentsPageState, setSetterAssignmentsPageState] = useState<SetterPageState>('ready');
  const [questionComposerPageState, setQuestionComposerPageState] = useState<SetterPageState>('ready');
  const [questionComposerFlowState, setQuestionComposerFlowState] = useState<
    'idle' | 'encrypt' | 'upload' | 'sign' | 'confirm' | 'complete' | 'error'
  >('idle');
  const [holderAssignmentsPageState, setHolderAssignmentsPageState] = useState<HolderPageState>('ready');
  const [holderConsolePageState, setHolderConsolePageState] = useState<HolderPageState>('ready');
  const [holderConsoleFlowState, setHolderConsoleFlowState] = useState<
    'setup' | 'commitment-pending' | 'ready-to-release' | 'window-closed' | 'already-submitted' | 'submit-error'
  >('setup');

  const sampleChainTime = Math.floor(Date.now() / 1000);
  const wizardSampleDraft: ExamWizardDraft = {
    title: 'Regional Physics Examination',
    sections: [{ name: 'Physics', quota: '45' }, { name: 'Chemistry', quota: '40' }],
    releaseOpensAt: timestampInputValue(sampleChainTime + 3_600),
    examStartsAt: timestampInputValue(sampleChainTime + 7_200),
    examEndsAt: timestampInputValue(sampleChainTime + 14_400),
    threshold: '3',
    holders: [
      '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    ],
    setters: ['0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'],
    centres: ['0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'],
  };
  const wizardContext: ExamWizardContext = {
    participants: [
      { address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', roles: ['HOLDER'] },
      { address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', roles: ['HOLDER'] },
      { address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906', roles: ['HOLDER'] },
      { address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', roles: ['SETTER'] },
      { address: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc', roles: ['CENTRE'] },
    ],
    encryptionKeys: {
      '0x70997970c51812dc3a010c7d01b50e0d17dc79c8': true,
      '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc': true,
      '0x90f79bf6eb2c4f870365e785982e1f101e93b906': true,
    },
    chainTime: sampleChainTime,
    minLeadSeconds: 60,
  };
  const commandCentreMetaHash = '0x8f2d591c0e7b4a2e6f3d1a8c5b7e9f0a2b4c6d8e0f1a3b5c7d9e1f3a5b7c9d1e';
  const commandCentreBankHash = '0x5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b';
  const commandCentreExam: CommandCentreExam = {
    examId: '7',
    title: 'Regional Physics Examination',
    state: commandCentreExamState,
    metaHash: commandCentreMetaHash,
    bankHash: ['Sealed', 'Released', 'Concluded'].includes(commandCentreExamState)
      ? commandCentreBankHash
      : null,
    rosetteHash: ['Sealed', 'Released', 'Concluded'].includes(commandCentreExamState)
      ? commandCentreBankHash
      : commandCentreMetaHash,
    releaseOpensAt: sampleChainTime + 1_800,
    examStartsAt: sampleChainTime + 5_400,
    examEndsAt: commandCentreExamState === 'Released'
      ? sampleChainTime - 3_600
      : sampleChainTime + 10_800,
    threshold: 2,
    holderCount: 3,
  };
  const commandCentreReadinessRows: CommandCentreReadinessRow[] = [
    {
      address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      role: 'Holder',
      keyRegistered: 'complete',
      shareVerified: 'not-tracked',
      randomnessCommitted: 'complete',
      batchesSubmitted: 'not-applicable',
      batchCount: null,
    },
    {
      address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      role: 'Holder',
      keyRegistered: 'complete',
      shareVerified: 'not-tracked',
      randomnessCommitted: commandCentreSealState === 'randomness' ? 'pending' : 'complete',
      batchesSubmitted: 'not-applicable',
      batchCount: null,
    },
    {
      address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
      role: 'Holder',
      keyRegistered: 'complete',
      shareVerified: 'not-tracked',
      randomnessCommitted: 'complete',
      batchesSubmitted: 'not-applicable',
      batchCount: null,
    },
    {
      address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
      role: 'Setter',
      keyRegistered: 'not-applicable',
      shareVerified: 'not-applicable',
      randomnessCommitted: 'not-applicable',
      batchesSubmitted: 'complete',
      batchCount: 4,
    },
  ];
  const commandCentreSections = [
    {
      name: 'Physics',
      quota: 45,
      questionCount: commandCentreSealState === 'quota' ? 38 : 45,
    },
    { name: 'Chemistry', quota: 40, questionCount: 40 },
  ];
  const commandCentreSealReason = commandCentreExamState !== 'Collecting'
    ? 'Seal exam is available only while collection is open.'
    : commandCentreSealState === 'quota'
      ? 'Seal needs 45 Physics questions; the bank has 38.'
      : commandCentreSealState === 'randomness'
        ? 'Seal needs randomness commitments from every key holder.'
        : null;

  const gallerySampleParticipants: ParticipantRecord[] = [
    {
      address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      roles: ['AUTHORITY'],
      displayName: 'Dr. Evelyn Vance',
      organisation: 'State Examination Board',
      profileHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
    },
    {
      address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      roles: ['SETTER'],
      displayName: 'Prof. Marcus Brody',
      organisation: 'Physics Department',
      profileHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
    },
    {
      address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
      roles: ['HOLDER'],
      displayName: 'Chief Custodian Alistair',
      organisation: 'Security Vault Alpha',
      profileHash: '0x3333333333333333333333333333333333333333333333333333333333333333',
    },
    {
      address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
      roles: ['CENTRE'],
      displayName: 'Metropolitan Exam Centre #04',
      organisation: 'Regional Testing Authority',
      profileHash: '0x4444444444444444444444444444444444444444444444444444444444444444',
    },
    {
      address: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4df',
      roles: ['AUDITOR'],
      displayName: 'Independent Oversight Group',
      organisation: 'Academic Integrity Bureau',
      profileHash: '0x5555555555555555555555555555555555555555555555555555555555555555',
    },
  ];

  const gallerySampleExams: DocketExam[] = [
    {
      examId: '7',
      serialSort: '7'.padStart(78, '0'),
      chainId: 31337,
      state: 1, // Collecting
      metaHash: '0x8f2d591c0e7b4a2e6f3d1a8c5b7e9f0a2b4c6d8e0f1a3b5c7d9e1f3a5b7c9d1e',
      releaseOpensAt: '1793527200',
      examStartsAt: '1793530800',
      examEndsAt: '1793541600',
      threshold: 3,
      bankHash: null,
      seed: null,
      title: 'Higher Secondary Physics 2026',
      holderCount: 5,
    },
    {
      examId: '8',
      serialSort: '8'.padStart(78, '0'),
      chainId: 31337,
      state: 2, // Sealed
      metaHash: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
      releaseOpensAt: '1793613600',
      examStartsAt: '1793617200',
      examEndsAt: '1793628000',
      threshold: 3,
      bankHash: '0x5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b',
      seed: null,
      title: 'Organic Chemistry & Biochemistry Paper 1',
      holderCount: 5,
    },
    {
      examId: '9',
      serialSort: '9'.padStart(78, '0'),
      chainId: 31337,
      state: 3, // Released
      metaHash: '0x9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f',
      releaseOpensAt: '1793440800',
      examStartsAt: '1793444400',
      examEndsAt: '1793455200',
      threshold: 4,
      bankHash: '0x4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c',
      seed: '0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b',
      title: 'Pure Mathematics & Linear Algebra',
      holderCount: 5,
    },
    {
      examId: '10',
      serialSort: '10'.padStart(78, '0'),
      chainId: 31337,
      state: 4, // Concluded
      metaHash: '0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d',
      releaseOpensAt: '1793354400',
      examStartsAt: '1793358000',
      examEndsAt: '1793368800',
      threshold: 3,
      bankHash: '0x2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e',
      seed: '0x6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c',
      title: 'Computer Science & Algorithmics 2026',
      holderCount: 5,
    },
  ];
  const setterGalleryAssignment: SetterAssignment = {
    examId: '7',
    title: 'Regional Physics Examination',
    state: 'Collecting',
    sections: [{ sectionId: 0, name: 'Physics', quota: 45, submitted: 12 }],
  };
  const setterGallerySubmissions: SetterSubmission[] = [
    {
      id: 'gallery-batch-confirmed',
      sectionId: 0,
      questionCount: 12,
      hash: `0x${'a'.repeat(64)}`,
      transactionHash: `0x${'b'.repeat(64)}`,
      status: 'confirmed',
      submittedAt: new Date(sampleChainTime * 1000).toISOString(),
    },
    {
      id: 'gallery-batch-pending',
      sectionId: 0,
      questionCount: 4,
      hash: `0x${'c'.repeat(64)}`,
      transactionHash: `0x${'d'.repeat(64)}`,
      status: 'pending',
    },
  ];
  const setterGalleryImportErrors: QuestionImportError[] = [
    {
      row: 3,
      column: 'option3',
      problem: 'This option duplicates option2 after trimming.',
    },
  ];
  const setterFlowStages = {
    idle: ['pending', 'pending', 'pending', 'pending'],
    encrypt: ['active', 'pending', 'pending', 'pending'],
    upload: ['complete', 'active', 'pending', 'pending'],
    sign: ['complete', 'complete', 'active', 'pending'],
    confirm: ['complete', 'complete', 'complete', 'active'],
    complete: ['complete', 'complete', 'complete', 'complete'],
    error: ['complete', 'error', 'pending', 'pending'],
  } as const;
  const [
    encryptProgress,
    uploadProgress,
    signProgress,
    confirmProgress,
  ] = setterFlowStages[questionComposerFlowState];
  const setterFlowProgress: SubmissionProgress = {
    encrypt: encryptProgress,
    upload: uploadProgress,
    sign: signProgress,
    confirm: confirmProgress,
  };
  const setterComposerProps: QuestionComposerViewProps = {
    pageState: questionComposerPageState,
    exam: questionComposerPageState === 'ready' ? setterGalleryAssignment : null,
    error: questionComposerPageState === 'error'
      ? new Error('Sample setter exam data could not be loaded.')
      : null,
    submissions: setterGallerySubmissions,
    importErrors: questionComposerFlowState === 'error' ? setterGalleryImportErrors : [],
    progress: setterFlowProgress,
    statusMessage: questionComposerFlowState === 'complete'
      ? 'The encrypted batch was confirmed on-chain.'
      : null,
    actionError: questionComposerFlowState === 'error'
      ? 'Encrypted batch upload failed. Retry this batch safely.'
      : null,
    hasPreparedBatch: questionComposerFlowState === 'error',
    onImport: async () => ({ questions: [], errors: [] }),
    onSubmit: async () => undefined,
  };
  const holderGalleryExam: HolderExamAssignment = {
    examId: '7',
    title: 'Regional Physics Examination',
    state: ['ready-to-release', 'window-closed', 'already-submitted', 'submit-error'].includes(holderConsoleFlowState)
      ? holderConsoleFlowState === 'already-submitted' ? 'Released' : 'Sealed'
      : 'Collecting',
    rosetteHash: ['ready-to-release', 'window-closed', 'already-submitted', 'submit-error'].includes(holderConsoleFlowState)
      ? commandCentreBankHash
      : commandCentreMetaHash,
    releaseOpensAt: holderConsoleFlowState === 'ready-to-release' ||
      holderConsoleFlowState === 'already-submitted' ||
      holderConsoleFlowState === 'submit-error'
      ? sampleChainTime - 300
      : sampleChainTime + 1_800,
    examStartsAt: sampleChainTime + 3_600,
    examEndsAt: holderConsoleFlowState === 'window-closed'
      ? sampleChainTime - 60
      : sampleChainTime + 7_200,
    threshold: 3,
    holderCount: 5,
    sections: [{ name: 'Physics', quota: 45 }],
  };
  const holderGallerySnapshot: HolderConsoleSnapshot = {
    exam: holderGalleryExam,
    keyRegistered: holderConsoleFlowState !== 'setup',
    shareUnlocked: ['commitment-pending', 'ready-to-release', 'window-closed', 'already-submitted', 'submit-error']
      .includes(holderConsoleFlowState),
    shareVerified: ['ready-to-release', 'window-closed', 'already-submitted', 'submit-error']
      .includes(holderConsoleFlowState),
    randomnessCommitted: ['ready-to-release', 'window-closed', 'already-submitted', 'submit-error']
      .includes(holderConsoleFlowState),
    shareSubmitted: holderConsoleFlowState === 'already-submitted',
    submissionCount: holderConsoleFlowState === 'already-submitted' ? 3 : 2,
    chainTime: sampleChainTime,
  };
  const holderGalleryActions: HolderConsoleActions = {
    setupPassphrase: '',
    releasePassphrase: '',
    isGeneratingKeystore: false,
    hasGeneratedKeystore: false,
    hasDownloadedKeystore: false,
    hasKeystoreFile: holderGallerySnapshot.shareUnlocked,
    isRegisteringKey: false,
    isUnlocking: false,
    isCommittingRandomness: false,
    isSubmittingShare: false,
    isTransactionPending: false,
    actionMessage: holderConsoleFlowState === 'ready-to-release'
      ? 'Share verified against the on-chain commitment.'
      : null,
    actionError: holderConsoleFlowState === 'submit-error'
      ? 'The release window has not opened at chain time (TooEarly).'
      : null,
    onSetupPassphraseChange: () => undefined,
    onGenerateKeystore: () => undefined,
    onDownloadKeystore: () => undefined,
    onRegisterKey: () => undefined,
    onKeystoreFile: () => undefined,
    onReleasePassphraseChange: () => undefined,
    onUnlockShare: () => undefined,
    onCommitRandomness: () => undefined,
    onSubmitShare: () => undefined,
    onClearSecrets: () => undefined,
    onRetry: () => undefined,
  };

  return (
    <ToastProvider>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '48px' }}>
        
        {/* Header */}
        <header style={{ borderBottom: '1px solid var(--sigil-color-hairline)', paddingBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span className="sigil-mono" style={{ fontSize: '13px', color: 'var(--sigil-color-slate)' }}>
                SIGIL DESIGN SYSTEM
              </span>
              <h1 style={{ margin: '4px 0 0 0' }}>Security paper component gallery</h1>
              <p style={{ color: 'var(--sigil-color-slate)', margin: '8px 0 0 0' }}>
                Tasks FA-01, FA-02, FA-03 · Pure CSS tokens, Radix UI primitives, security-printed signature components.
              </p>
            </div>
            <a href="/" style={{ fontSize: '13px', textDecoration: 'none', border: '1px solid var(--sigil-color-ink)', padding: '6px 12px', borderRadius: '3px' }}>
              ← Return to application
            </a>
          </div>
        </header>

        {/* ============================================================== */}
        {/* FA-01: DESIGN TOKENS & CONTRAST AUDIT                          */}
        {/* ============================================================== */}
        <section id="fa-01-tokens">
          <h2>FA-01: Design tokens & WCAG AA contrast audit</h2>
          <p style={{ color: 'var(--sigil-color-slate)' }}>
            Colour palette from section 10.3 and approved UI reference. Tested with automated WCAG 2.1 relative luminance algorithms.
          </p>

          {/* Color swatches */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '12px', marginTop: '16px' }}>
            {Object.entries(tokens.colors).map(([name, hex]) => (
              <div
                key={name}
                style={{
                  backgroundColor: 'var(--sigil-color-sheet)',
                  border: '1px solid var(--sigil-color-hairline)',
                  borderRadius: '3px',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div
                  style={{
                    backgroundColor: hex,
                    height: '48px',
                    borderRadius: '2px',
                    border: name === 'sheet' || name === 'mist' ? '1px solid var(--sigil-color-hairline)' : 'none',
                  }}
                />
                <div style={{ fontSize: '13px', fontWeight: 600 }}>{name}</div>
                <div className="sigil-mono" style={{ fontSize: '11px', color: 'var(--sigil-color-slate)' }}>
                  {hex}
                </div>
              </div>
            ))}
          </div>

          {/* Contrast Check Table */}
          <div style={{ marginTop: '24px' }}>
            <h3 style={{ fontSize: '17px', marginBottom: '8px' }}>WCAG AA contrast audit table</h3>
            <div className="sigil-ledger-table-wrap" tabIndex={0}>
              <table className="sigil-ledger-table">
                <thead>
                  <tr>
                    <th>Use case</th>
                    <th>Foreground</th>
                    <th>Background</th>
                    <th>Contrast ratio</th>
                    <th>Normal text (≥ 4.5:1)</th>
                    <th>Large / UI (≥ 3.0:1)</th>
                  </tr>
                </thead>
                <tbody>
                  {standardAuditPairs.map((pair) => (
                    <tr key={pair.useCase}>
                      <td>{pair.useCase}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '12px', height: '12px', backgroundColor: pair.fgHex, display: 'inline-block', border: '1px solid #ccc' }} />
                          <strong>{pair.fgName}</strong> ({pair.fgHex})
                        </span>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '12px', height: '12px', backgroundColor: pair.bgHex, display: 'inline-block', border: '1px solid #ccc' }} />
                          <strong>{pair.bgName}</strong> ({pair.bgHex})
                        </span>
                      </td>
                      <td className="sigil-mono" style={{ fontWeight: 600 }}>
                        {pair.ratio.toFixed(2)}:1
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            borderRadius: '2px',
                            backgroundColor: pair.passNormal ? 'rgba(29, 122, 87, 0.15)' : 'rgba(176, 58, 46, 0.15)',
                            color: pair.passNormal ? 'var(--sigil-color-verified)' : 'var(--sigil-color-alert)',
                          }}
                        >
                          {pair.passNormal ? 'Pass AA' : 'Fail normal'}
                        </span>
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            borderRadius: '2px',
                            backgroundColor: pair.passUI ? 'rgba(29, 122, 87, 0.15)' : 'rgba(176, 58, 46, 0.15)',
                            color: pair.passUI ? 'var(--sigil-color-verified)' : 'var(--sigil-color-alert)',
                          }}
                        >
                          {pair.passUI ? 'Pass UI/Large' : 'Fail'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Typography scale */}
          <div style={{ marginTop: '24px' }}>
            <h3 style={{ fontSize: '17px', marginBottom: '8px' }}>Typography scale (Atkinson Hyperlegible Next & Mono)</h3>
            <div style={{ background: 'var(--sigil-color-sheet)', padding: '16px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px' }}>
              <div style={{ fontSize: '40px', fontWeight: 700 }}>40px Display: Section 10.3 typography headline</div>
              <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '8px' }}>28px XL: Official custody verification summary</div>
              <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '8px' }}>22px LG: Exam lifecycle control docket</div>
              <div style={{ fontSize: '17px', fontWeight: 600, marginTop: '8px' }}>17px MD: Question bank quotas and cryptographic commitments</div>
              <div style={{ fontSize: '15px', marginTop: '8px' }}>15px Base: Body text line length stays under 75 characters for optimal human comprehension during irreversible operations.</div>
              <div style={{ fontSize: '13px', color: 'var(--sigil-color-slate)', marginTop: '8px' }}>13px XS: Secondary annotations, table headers, hash commitments, and audit timestamps.</div>
              <div className="sigil-mono" style={{ fontSize: '15px', marginTop: '12px', color: 'var(--sigil-color-ink)' }}>
                Mono numerals & letters: 0 vs O distinction, 1 vs l vs I distinction (0x7F01aA4B901CDE)
              </div>
            </div>
          </div>

          {/* Focus & Reduced Motion */}
          <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ background: 'var(--sigil-color-sheet)', padding: '16px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px' }}>
              <h4 style={{ margin: '0 0 8px 0' }}>Marigold focus ring</h4>
              <p style={{ fontSize: '13px', color: 'var(--sigil-color-slate)' }}>
                Press <kbd style={{ padding: '2px 4px', background: 'var(--sigil-color-mist)', borderRadius: '2px' }}>Tab</kbd> to focus interactive elements. High-contrast 2px outline in marigold (<code>#E59A0E</code>) with 2px offset.
              </p>
              <button className="sigil-button sigil-button--secondary sigil-button--sm">
                Tab to test focus
              </button>
            </div>
            <div style={{ background: 'var(--sigil-color-sheet)', padding: '16px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px' }}>
              <h4 style={{ margin: '0 0 8px 0' }}>Motion rules</h4>
              <p style={{ fontSize: '13px', color: 'var(--sigil-color-slate)' }}>
                Honors <code>prefers-reduced-motion: reduce</code>. Motion is restricted strictly to user actions (opening modals, transaction state change) and single seal-break animation.
              </p>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* FA-02: PRIMITIVE RADIX COMPONENTS                              */}
        {/* ============================================================== */}
        <section id="fa-02-primitives">
          <h2>FA-02: Primitive components (Radix UI re-themed)</h2>
          <p style={{ color: 'var(--sigil-color-slate)' }}>
            Headless Radix primitives themed with security paper tokens. Full keyboard navigation and ARIA semantics.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '16px' }}>
            {/* Buttons */}
            <div style={{ background: 'var(--sigil-color-sheet)', padding: '16px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px' }}>
              <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>Buttons</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button variant="primary">Primary ink</Button>
                  <Button variant="secondary">Secondary outline</Button>
                  <Button variant="ghost">Ghost</Button>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button variant="alert">Alert action</Button>
                  <Button variant="primary" disabled>Disabled</Button>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button size="sm">Small (28px)</Button>
                  <Button size="md">Medium (38px)</Button>
                  <Button size="lg">Large (46px)</Button>
                </div>
              </div>
            </div>

            {/* Form Fields */}
            <div style={{ background: 'var(--sigil-color-sheet)', padding: '16px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px' }}>
              <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>Field & FieldError</h3>
              <Field
                id="exam-code"
                label="Exam administrative code"
                description="Unique uppercase identifier registered on blockchain"
                placeholder="e.g. NEET-UG-2026-A"
                defaultValue="SIGIL-2026-DEMO"
              />
              <Field
                id="error-field"
                label="Passphrase verification"
                placeholder="Enter keystore passphrase"
                type="password"
                error="Passphrase must be at least 12 characters with uppercase and numeric characters"
              />
            </div>

            {/* Select Primitive */}
            <div style={{ background: 'var(--sigil-color-sheet)', padding: '16px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px' }}>
              <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>Select</h3>
              <Select
                label="Designated section"
                description="Select target exam section for question quotas"
                value={selectVal}
                onValueChange={setSelectVal}
                options={[
                  { value: 'physics', label: 'Section 1: Physics (45 questions)' },
                  { value: 'chemistry', label: 'Section 2: Chemistry (45 questions)' },
                  { value: 'botany', label: 'Section 3: Botany (45 questions)' },
                  { value: 'zoology', label: 'Section 4: Zoology (45 questions)' },
                ]}
              />
            </div>

            {/* Dialog / Popover / Tooltip */}
            <div style={{ background: 'var(--sigil-color-sheet)', padding: '16px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px' }}>
              <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>Dialog, Popover & Tooltip</h3>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <Dialog
                  open={dialogOpen}
                  onOpenChange={setDialogOpen}
                  trigger={<Button variant="secondary" size="sm">Open modal dialog</Button>}
                  title="Cryptographic verification confirmation"
                  description="Review threshold parameters before sealing the question bank."
                >
                  <p style={{ fontSize: '15px', lineHeight: '1.5', margin: '16px 0' }}>
                    Once this dialog is accepted, the ECDH key ceremony commitments will be permanently submitted on-chain.
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button variant="primary" size="sm" onClick={() => setDialogOpen(false)}>Confirm action</Button>
                  </div>
                </Dialog>

                <Popover
                  trigger={<Button variant="ghost" size="sm">Open popover</Button>}
                >
                  <div style={{ fontSize: '13px' }}>
                    <strong>Section Quota Status</strong>
                    <p style={{ margin: '6px 0 0 0', color: 'var(--sigil-color-slate)' }}>
                      Physics: 50 / 45 submitted.<br />
                      Chemistry: 48 / 45 submitted.
                    </p>
                  </div>
                </Popover>

                <Tooltip content="Deterministic hypotrochoid pattern derived from exam bankHash">
                  <span style={{ fontSize: '13px', textDecoration: 'underline', cursor: 'help' }}>
                    Hover for tooltip
                  </span>
                </Tooltip>
              </div>

              {/* Toasts */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Radix Toasts:</div>
                <ToastButtons />
              </div>
            </div>
          </div>

          {/* Tabs primitive */}
          <div style={{ marginTop: '20px', background: 'var(--sigil-color-sheet)', padding: '16px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px' }}>
            <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>Tabs</h3>
            <Tabs
              defaultValue="general"
              items={[
                {
                  value: 'general',
                  label: 'General overview',
                  content: <p style={{ fontSize: '15px', margin: '8px 0' }}>Displaying global schedule and release windows.</p>,
                },
                {
                  value: 'quotas',
                  label: 'Question quotas',
                  content: <p style={{ fontSize: '15px', margin: '8px 0' }}>All 4 sections have met their quotas. Question bank ready for sealing.</p>,
                },
                {
                  value: 'participants',
                  label: 'Assigned panel',
                  content: <p style={{ fontSize: '15px', margin: '8px 0' }}>5 key holders registered, threshold t = 3.</p>,
                },
              ]}
            />
          </div>

          {/* EmptyState */}
          <div style={{ marginTop: '20px' }}>
            <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>EmptyState (§3.4 no dummy data rule)</h3>
            <EmptyState
              title="No examinations on this ledger"
              description="No exams have been initialized yet. Use the Create Exam wizard to draft and seal an examination schedule."
              action={<Button variant="secondary" size="sm">Launch Create Exam wizard</Button>}
            />
          </div>
        </section>

        {/* ============================================================== */}
        {/* FA-03: SIGNATURE SECURITY-PAPER COMPONENTS                     */}
        {/* ============================================================== */}
        <section id="fa-03-signature">
          <h2>FA-03: Signature security-paper components</h2>
          <p style={{ color: 'var(--sigil-color-slate)' }}>
            Components carrying cryptographic truth: rosette visual checksums, horizontal custody strips, dashed coupons, square threshold notches, and mono serials.
          </p>

          {/* CustodyBubbles */}
          <div style={{ background: 'var(--sigil-color-sheet)', padding: '20px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px', marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '15px', margin: 0 }}>CustodyBubbles (horizontal strip & compact inline)</h3>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', color: 'var(--sigil-color-slate)' }}>Preview state:</span>
                {(['Draft', 'Collecting', 'Sealed', 'Released', 'Concluded', 'Cancelled'] as ExamState[]).map((st) => (
                  <Button
                    key={st}
                    size="sm"
                    variant={bubbleState === st ? 'primary' : 'secondary'}
                    onClick={() => setBubbleState(st)}
                  >
                    {st}
                  </Button>
                ))}
              </div>
            </div>

            {/* Horizontal strip */}
            <div style={{ padding: '8px 0', borderBottom: '1px solid var(--sigil-color-hairline)', marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', color: 'var(--sigil-color-slate)', marginBottom: '4px' }}>
                HORIZONTAL CUSTODY STRIP (Option B approved layout):
              </div>
              <CustodyBubbles currentState={bubbleState} variant="strip" />
            </div>

            {/* Inline docket variant */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', color: 'var(--sigil-color-slate)' }}>Compact inline variant (for table rows):</span>
              <CustodyBubbles currentState={bubbleState} variant="inline" />
              <StateStamp state={bubbleState} />
            </div>
          </div>

          {/* Rosette visual checksum */}
          <div style={{ background: 'var(--sigil-color-sheet)', padding: '20px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px', marginTop: '20px' }}>
            <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>Rosette (deterministic fine-line hypotrochoid from hash)</h3>
            <p style={{ fontSize: '13px', color: 'var(--sigil-color-slate)', margin: '0 0 16px 0' }}>
              Deterministic <code>rosettePath(hash)</code> at fixed 2-decimal precision. Verified by Vitest snapshot tests.
            </p>

            <div style={{ display: 'flex', gap: '32px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <Rosette hash="0x0000000000000000000000000000000000000000000000000000000000000000" size={52} />
                <div style={{ fontSize: '11px', color: 'var(--sigil-color-slate)', marginTop: '4px' }}>52px (Zero vector)</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <Rosette hash="0x1111111111111111111111111111111111111111111111111111111111111111" size={52} />
                <div style={{ fontSize: '11px', color: 'var(--sigil-color-slate)', marginTop: '4px' }}>52px (Vector 1)</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <Rosette hash="0x2222222222222222222222222222222222222222222222222222222222222222" size={52} />
                <div style={{ fontSize: '11px', color: 'var(--sigil-color-slate)', marginTop: '4px' }}>52px (Vector 2)</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <Rosette hash={interactiveHash} size={72} />
                <div style={{ fontSize: '11px', color: 'var(--sigil-color-slate)', marginTop: '4px' }}>72px (Interactive)</div>
              </div>

              <div style={{ flex: 1, minWidth: '260px' }}>
                <Field
                  id="interactive-hash"
                  label="Test hash for rosette determinism"
                  value={interactiveHash}
                  onChange={(e) => setInteractiveHash(e.target.value)}
                  mono
                />
              </div>
            </div>
          </div>

          {/* Coupon, ThresholdMeter, CountdownLock, Serial, HashChip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginTop: '20px' }}>
            {/* Coupon Panels */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Coupon
                title="Seal exam (permanent)"
                consequence="Once sealed, question collection closes permanently and bankHash is committed to the blockchain."
                actionLabel="Sign & seal exam"
                isReady={true}
                onAction={() => alert('Seal action invoked!')}
              />

              <Coupon
                title="Conclude exam (permanent)"
                consequence="Finalizes examination status on-chain. Decryption shares and copies remain archived."
                actionLabel="Conclude exam"
                isReady={false}
                disabledReason="Prerequisite not met: exam period ends at block time 1730419200."
              />
            </div>

            {/* ThresholdMeter & CountdownLock */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'var(--sigil-color-sheet)', padding: '16px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                  <h3 style={{ fontSize: '15px', margin: 0 }}>ThresholdMeter (square notches)</h3>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Button
                        key={n}
                        size="sm"
                        variant={thresholdCount === n ? 'primary' : 'ghost'}
                        onClick={() => setThresholdCount(n)}
                        style={{ padding: '2px 6px', height: '24px' }}
                      >
                        {n}
                      </Button>
                    ))}
                  </div>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--sigil-color-slate)', margin: '0 0 12px 0' }}>
                  16px square notches to distinguish threshold status from round custody bubbles.
                </p>
                <ThresholdMeter current={thresholdCount} threshold={3} total={5} />
              </div>

              <div style={{ background: 'var(--sigil-color-sheet)', padding: '16px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px' }}>
                <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>CountdownLock</h3>
                <p style={{ fontSize: '13px', color: 'var(--sigil-color-slate)', margin: '0 0 12px 0' }}>
                  Mono 20px time with filled marigold square indicator.
                </p>
                <CountdownLock
                  targetTimestamp={Math.floor(Date.now() / 1000) + 7200}
                  label="Time-lock release window opens in"
                />
              </div>

              <div style={{ background: 'var(--sigil-color-sheet)', padding: '16px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px' }}>
                <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>Serial & HashChip</h3>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--sigil-color-slate)' }}>Exam Serial:</div>
                    <Serial id={7} />
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--sigil-color-slate)' }}>High serial:</div>
                    <Serial id={1024} />
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--sigil-color-slate)' }}>HashChip (click to copy):</div>
                    <HashChip hash="0x8f2d5a3c9b4e1f7a0d2c5e8b1a4f7c0d3e6b9a2f" txUrl="https://etherscan.io" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* LedgerTable */}
          <div style={{ marginTop: '24px' }}>
            <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>LedgerTable (sortable, keyboard navigable, 0-radius)</h3>
            <LedgerTable
              caption="Examination Docket Ledger"
              keyField="serial"
              columns={[
                {
                  key: 'serial',
                  header: 'Serial',
                  mono: true,
                  sortable: true,
                  render: (row) => <Serial id={row.serial} />,
                },
                {
                  key: 'title',
                  header: 'Title',
                  sortable: true,
                },
                {
                  key: 'state',
                  header: 'Custody status',
                  render: (row) => (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <CustodyBubbles currentState={row.state} variant="inline" />
                      <span style={{ fontSize: '13px' }}>{row.state}</span>
                    </div>
                  ),
                },
                {
                  key: 'holders',
                  header: 'Holders',
                  mono: true,
                  sortable: true,
                },
                {
                  key: 'created',
                  header: 'Created date',
                  mono: true,
                  sortable: true,
                },
              ]}
              data={tableData}
              onRowClick={(row) => alert(`Selected exam serial No. ${row.serial}`)}
            />
          </div>

          {/* TxDrawer States */}
          <div style={{ marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
              <h3 style={{ fontSize: '15px', margin: 0 }}>TxDrawer (transaction lifecycle drawer)</h3>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {(['preparing', 'awaiting-signature', 'pending', 'confirmed', 'failed'] as TxStatus[]).map((st) => (
                  <Button
                    key={st}
                    size="sm"
                    variant={txState === st ? 'primary' : 'ghost'}
                    onClick={() => setTxState(st)}
                  >
                    {st}
                  </Button>
                ))}
              </div>
            </div>

            <TxDrawer
              status={txState}
              title="Submit batch verification transaction"
              txHash="0x3f5c7a9b1d2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a"
              blockConfirmations={2}
              requiredConfirmations={3}
              errorMessage={txState === 'failed' ? 'QuotaNotMet(sectionId: 0, have: 40, need: 45)' : undefined}
              onRetry={() => setTxState('preparing')}
              onClose={() => alert('Closed TxDrawer')}
            />
          </div>
        </section>

        {/* ============================================================== */}
        {/* FA-04: GUARD SCREENS PREVIEW                                   */}
        {/* ============================================================== */}
        <section id="fa-04-guards">
          <h2>FA-04: Full-screen guard screens</h2>
          <p style={{ color: 'var(--sigil-color-slate)' }}>
            Four security guard states per UI reference: connect wallet, sign in (SIWE), wrong network (alert border), and no role.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginTop: '16px' }}>
            <div style={{ border: '1px solid var(--sigil-color-hairline)', padding: '16px', background: 'var(--sigil-color-mist)', borderRadius: '3px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--sigil-color-slate)', marginBottom: '8px' }}>
                1. CONNECT WALLET GUARD
              </div>
              <ConnectWalletGuard onConnect={() => alert('Connect requested')} />
            </div>

            <div style={{ border: '1px solid var(--sigil-color-hairline)', padding: '16px', background: 'var(--sigil-color-mist)', borderRadius: '3px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--sigil-color-slate)', marginBottom: '8px' }}>
                2. SIGN IN GUARD (SIWE)
              </div>
              <SignInGuard
                account="0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
                onSignIn={() => alert('SIWE requested')}
              />
            </div>

            <div style={{ border: '1px solid var(--sigil-color-hairline)', padding: '16px', background: 'var(--sigil-color-mist)', borderRadius: '3px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--sigil-color-slate)', marginBottom: '8px' }}>
                3. WRONG NETWORK GUARD (ALERT BORDER)
              </div>
              <WrongNetworkGuard
                currentChainId="0x1"
                onSwitchNetwork={() => alert('Switch network requested')}
              />
            </div>

            <div style={{ border: '1px solid var(--sigil-color-hairline)', padding: '16px', background: 'var(--sigil-color-mist)', borderRadius: '3px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--sigil-color-slate)', marginBottom: '8px' }}>
                4. NO ROLE GUARD
              </div>
              <NoRoleGuard
                account="0x1111111111111111111111111111111111111111"
                onDisconnect={() => alert('Disconnect requested')}
              />
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* FA-05: PAGE STATES (PARTICIPANTS & DOCKET)                    */}
        {/* ============================================================== */}
        <section id="fa-05-pages">
          <h2>FA-05: Page states (Admin participants & Authority docket)</h2>
          <p style={{ color: 'var(--sigil-color-slate)' }}>
            Every state of the live pages inspected with sample values: populated live data, skeleton loading, empty state, network error, and permission denied.
          </p>

          {/* Sub-section 1: Admin Participants */}
          <div style={{ marginTop: '24px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px', padding: '24px', background: 'var(--sigil-color-sheet)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', borderBottom: '1px solid var(--sigil-color-hairline)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '16px', margin: '0 0 4px 0', color: 'var(--sigil-color-ink)' }}>
                  1. Admin participants page states
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--sigil-color-slate)' }}>
                  Ledger table with role filter, register participant dialog, and revoke confirmation Coupon.
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {(['populated', 'loading', 'empty', 'error', 'permission'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setParticipantsState(st)}
                    style={{
                      border: '1px solid',
                      borderColor: participantsState === st ? 'var(--sigil-color-ink)' : 'var(--sigil-color-hairline)',
                      backgroundColor: participantsState === st ? 'var(--sigil-color-ink)' : 'var(--sigil-color-sheet)',
                      color: participantsState === st ? 'var(--sigil-color-sheet)' : 'var(--sigil-color-ink)',
                      fontSize: '11px',
                      fontFamily: 'var(--sigil-font-mono)',
                      padding: '4px 8px',
                      borderRadius: '2px',
                      cursor: 'pointer',
                      fontWeight: participantsState === st ? 600 : 400,
                      textTransform: 'capitalize',
                    }}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ background: 'var(--sigil-color-mist)', padding: '16px', borderRadius: '2px' }}>
              <ParticipantsView
                participants={participantsState === 'populated' ? gallerySampleParticipants : []}
                isLoading={participantsState === 'loading'}
                error={participantsState === 'error' ? new Error('Simulated RPC network timeout connecting to node.') : null}
                permissionDenied={participantsState === 'permission'}
                roleFilter={galleryRoleFilter}
                onRoleFilterChange={setGalleryRoleFilter}
                onRegister={async (input) => {
                  alert(`Register participant: ${input.address} as ${input.role}`);
                }}
                onRevoke={async (input) => {
                  alert(`Revoke participant: ${input.address} role ${input.role}`);
                }}
                onRetry={() => setParticipantsState('populated')}
              />
            </div>
          </div>

          {/* Sub-section 2: Authority Docket */}
          <div style={{ marginTop: '32px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px', padding: '24px', background: 'var(--sigil-color-sheet)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', borderBottom: '1px solid var(--sigil-color-hairline)', paddingBottom: '12px' }}>
              <div>
                <h2 style={{ fontSize: '16px', margin: '0 0 4px 0', color: 'var(--sigil-color-ink)' }}>
                  2. Authority exam docket page states
                </h2>
                <span style={{ fontSize: '12px', color: 'var(--sigil-color-slate)' }}>
                  Serial (No. 0007), title, inline custody bubbles, release window, and panel threshold.
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {(['populated', 'loading', 'empty', 'error', 'permission'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setDocketState(st)}
                    style={{
                      border: '1px solid',
                      borderColor: docketState === st ? 'var(--sigil-color-ink)' : 'var(--sigil-color-hairline)',
                      backgroundColor: docketState === st ? 'var(--sigil-color-ink)' : 'var(--sigil-color-sheet)',
                      color: docketState === st ? 'var(--sigil-color-sheet)' : 'var(--sigil-color-ink)',
                      fontSize: '11px',
                      fontFamily: 'var(--sigil-font-mono)',
                      padding: '4px 8px',
                      borderRadius: '2px',
                      cursor: 'pointer',
                      fontWeight: docketState === st ? 600 : 400,
                      textTransform: 'capitalize',
                    }}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ background: 'var(--sigil-color-mist)', padding: '16px', borderRadius: '2px' }}>
              <DocketView
                exams={docketState === 'populated' ? gallerySampleExams : []}
                isLoading={docketState === 'loading'}
                error={docketState === 'error' ? new Error('Simulated backend service 503 unavailable.') : null}
                permissionDenied={docketState === 'permission'}
                stateFilter={galleryDocketFilter}
                onStateFilterChange={setGalleryDocketFilter}
                searchQuery={gallerySearchQuery}
                onSearchChange={setGallerySearchQuery}
                onCreateExam={() => alert('Navigate to Create Exam wizard')}
                onRowClick={(e) => alert(`Selected exam #${e.examId}`)}
                onRetry={() => setDocketState('populated')}
              />
            </div>
          </div>
        </section>

        <section id="fa-06-pages" style={{ borderTop: '1px solid var(--sigil-color-hairline)', paddingTop: '32px' }}>
          <h2>FA-06: Create Exam wizard and Key Ceremony page states</h2>
          <p style={{ color: 'var(--sigil-color-slate)' }}>
            Sample records below exist only in this gallery. Open the step list to inspect each wizard form.
          </p>

          <div data-testid="create-exam-gallery" style={{ marginTop: '24px', padding: '24px', border: '1px solid var(--sigil-color-hairline)', background: 'var(--sigil-color-sheet)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <div>
                <h3 style={{ marginBottom: '4px' }}>Create Exam wizard</h3>
                <span style={{ fontSize: '12px', color: 'var(--sigil-color-slate)' }}>
                  Details, sections and quotas, schedule, panel and threshold, setters and centres, review and sign.
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {(['populated', 'loading', 'empty', 'error', 'permission', 'metadata-error', 'created'] as const).map((state) => (
                  <button
                    key={state}
                    type="button"
                    onClick={() => setCreateExamGalleryState(state)}
                    aria-pressed={createExamGalleryState === state}
                    style={{
                      border: '1px solid',
                      borderColor: createExamGalleryState === state ? 'var(--sigil-color-ink)' : 'var(--sigil-color-hairline)',
                      background: createExamGalleryState === state ? 'var(--sigil-color-ink)' : 'var(--sigil-color-sheet)',
                      color: createExamGalleryState === state ? 'var(--sigil-color-sheet)' : 'var(--sigil-color-ink)',
                      fontSize: '11px',
                      fontFamily: 'var(--sigil-font-mono)',
                      padding: '4px 8px',
                      borderRadius: '2px',
                      cursor: 'pointer',
                    }}
                  >
                    {state}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ background: 'var(--sigil-color-mist)', padding: '12px' }}>
              <CreateExamView
                pageState={
                  createExamGalleryState === 'populated' ||
                  createExamGalleryState === 'metadata-error' ||
                  createExamGalleryState === 'created'
                    ? 'ready'
                    : createExamGalleryState
                }
                context={wizardContext}
                initialDraft={wizardSampleDraft}
                createdExamId={
                  createExamGalleryState === 'created' || createExamGalleryState === 'metadata-error'
                    ? '7'
                    : null
                }
                metadataStored={createExamGalleryState === 'created'}
                metadataError={
                  createExamGalleryState === 'metadata-error'
                    ? 'Exam No. 0007 was created on-chain, but metadata storage failed. Retry metadata storage.'
                    : null
                }
                error={new Error('Sample participant or chain request failed.')}
                onCreate={() => setCreateExamGalleryState('created')}
                onRetryMetadata={() => setCreateExamGalleryState('created')}
                onStartCeremony={() => setCeremonyGalleryState('ready')}
              />
            </div>
          </div>

          <div data-testid="key-ceremony-gallery" style={{ marginTop: '24px', padding: '24px', border: '1px solid var(--sigil-color-hairline)', background: 'var(--sigil-color-sheet)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '22px', marginBottom: '4px' }}>Key Ceremony</h2>
                <span style={{ fontSize: '12px', color: 'var(--sigil-color-slate)' }}>
                  Browser-only ceremony progress, encrypted share upload, and Open collection coupon.
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {(['ready', 'loading', 'empty', 'error', 'permission', 'blocked', 'failed', 'complete'] as const).map((state) => (
                  <button
                    key={state}
                    type="button"
                    onClick={() => setCeremonyGalleryState(state)}
                    aria-pressed={ceremonyGalleryState === state}
                    style={{
                      border: '1px solid',
                      borderColor: ceremonyGalleryState === state ? 'var(--sigil-color-ink)' : 'var(--sigil-color-hairline)',
                      background: ceremonyGalleryState === state ? 'var(--sigil-color-ink)' : 'var(--sigil-color-sheet)',
                      color: ceremonyGalleryState === state ? 'var(--sigil-color-sheet)' : 'var(--sigil-color-ink)',
                      fontSize: '11px',
                      fontFamily: 'var(--sigil-font-mono)',
                      padding: '4px 8px',
                      borderRadius: '2px',
                      cursor: 'pointer',
                    }}
                  >
                    {state}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ background: 'var(--sigil-color-mist)', padding: '12px' }}>
              <KeyCeremonyView
                pageState={
                  ceremonyGalleryState === 'blocked' ||
                  ceremonyGalleryState === 'failed' ||
                  ceremonyGalleryState === 'complete'
                    ? 'ready'
                    : ceremonyGalleryState
                }
                error={new Error('Sample exam data could not be loaded.')}
                examId="7"
                threshold={2}
                holders={[
                  { address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', keyRegistered: true },
                  { address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', keyRegistered: true },
                  { address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906', keyRegistered: true },
                ]}
                stepStatuses={
                  ceremonyGalleryState === 'complete'
                    ? ['complete', 'complete', 'complete', 'complete', 'complete', 'pending']
                    : ceremonyGalleryState === 'failed'
                      ? ['complete', 'complete', 'complete', 'error', 'pending', 'pending']
                      : Array.from({ length: 6 }, () => 'pending')
                }
                isComplete={ceremonyGalleryState === 'complete'}
                failureMessage={ceremonyGalleryState === 'failed' ? 'Encrypted share upload failed. Retry the failed step.' : null}
                disabledReason={ceremonyGalleryState === 'blocked' ? 'Every assigned holder must have a registered encryption key.' : null}
                onRun={() => setCeremonyGalleryState('complete')}
              />
            </div>
          </div>
        </section>

        <section id="fa-07-command-centre" style={{ borderTop: '1px solid var(--sigil-color-hairline)', paddingTop: '32px' }}>
          <h2>FA-07: Exam command centre page states</h2>
          <p style={{ color: 'var(--sigil-color-slate)' }}>
            Sample exam and readiness records below are for gallery inspection only. Custody state is chain-derived on the operational route.
          </p>

          <div data-testid="command-centre-gallery" style={{ marginTop: '24px', padding: '24px', border: '1px solid var(--sigil-color-hairline)', background: 'var(--sigil-color-sheet)' }}>
            <h3 style={{ marginBottom: '8px' }}>Page state</h3>
            <div data-testid="command-centre-page-state-controls" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
              {(['ready', 'loading', 'empty', 'error', 'permission'] as const).map((state) => (
                <button
                  key={state}
                  type="button"
                  onClick={() => setCommandCentrePageState(state)}
                  aria-pressed={commandCentrePageState === state}
                  style={{
                    border: '1px solid',
                    borderColor: commandCentrePageState === state ? 'var(--sigil-color-ink)' : 'var(--sigil-color-hairline)',
                    background: commandCentrePageState === state ? 'var(--sigil-color-ink)' : 'var(--sigil-color-sheet)',
                    color: commandCentrePageState === state ? 'var(--sigil-color-sheet)' : 'var(--sigil-color-ink)',
                    fontSize: '11px',
                    fontFamily: 'var(--sigil-font-mono)',
                    padding: '4px 8px',
                    borderRadius: '2px',
                    cursor: 'pointer',
                  }}
                >
                  {state}
                </button>
              ))}
            </div>

            <h3 style={{ marginBottom: '8px' }}>On-chain exam state</h3>
            <div data-testid="command-centre-chain-state-controls" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
              {(['Draft', 'Collecting', 'Sealed', 'Released', 'Concluded', 'Cancelled'] as const).map((state) => (
                <button
                  key={state}
                  type="button"
                  onClick={() => setCommandCentreExamState(state)}
                  aria-pressed={commandCentreExamState === state}
                  style={{
                    border: '1px solid',
                    borderColor: commandCentreExamState === state ? 'var(--sigil-color-ink)' : 'var(--sigil-color-hairline)',
                    background: commandCentreExamState === state ? 'var(--sigil-color-ink)' : 'var(--sigil-color-sheet)',
                    color: commandCentreExamState === state ? 'var(--sigil-color-sheet)' : 'var(--sigil-color-ink)',
                    fontSize: '11px',
                    fontFamily: 'var(--sigil-font-mono)',
                    padding: '4px 8px',
                    borderRadius: '2px',
                    cursor: 'pointer',
                  }}
                >
                  {state}
                </button>
              ))}
            </div>

            <h3 style={{ marginBottom: '8px' }}>Seal prerequisite</h3>
            <div data-testid="command-centre-seal-controls" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
              {(['quota', 'randomness', 'ready'] as const).map((state) => (
                <button
                  key={state}
                  type="button"
                  onClick={() => setCommandCentreSealState(state)}
                  aria-pressed={commandCentreSealState === state}
                  style={{
                    border: '1px solid',
                    borderColor: commandCentreSealState === state ? 'var(--sigil-color-ink)' : 'var(--sigil-color-hairline)',
                    background: commandCentreSealState === state ? 'var(--sigil-color-ink)' : 'var(--sigil-color-sheet)',
                    color: commandCentreSealState === state ? 'var(--sigil-color-sheet)' : 'var(--sigil-color-ink)',
                    fontSize: '11px',
                    fontFamily: 'var(--sigil-font-mono)',
                    padding: '4px 8px',
                    borderRadius: '2px',
                    cursor: 'pointer',
                  }}
                >
                  {state}
                </button>
              ))}
            </div>

            <div style={{ background: 'var(--sigil-color-mist)', padding: '12px' }}>
              <CommandCentreView
                pageState={commandCentrePageState}
                error={new Error('Sample command-centre request failed.')}
                exam={commandCentreExam}
                countdownTarget={
                  commandCentreExamState === 'Released'
                    ? commandCentreExam.examEndsAt
                    : commandCentreExam.releaseOpensAt
                }
                readinessRows={commandCentreReadinessRows}
                sectionCounts={commandCentreSections}
                sealDisabledReason={
                  commandCentreSealState === 'ready'
                    ? commandCentreExamState === 'Collecting'
                      ? null
                      : 'Seal exam is available only while collection is open.'
                    : commandCentreSealReason
                }
                concludeDisabledReason={
                  commandCentreExamState === 'Released'
                    ? null
                    : 'Conclude exam is available only after the exam is released.'
                }
                actionError={commandCentrePageState === 'error' ? 'The sample transaction failed.' : null}
                onRetry={() => setCommandCentrePageState('ready')}
                onSeal={() => undefined}
                onConclude={() => undefined}
                onCancel={() => undefined}
              />
            </div>
          </div>
        </section>

        <section id="fa-09-pages" style={{ borderTop: '1px solid var(--sigil-color-hairline)', paddingTop: '32px' }}>
          <h2>FA-09: Setter flow page states</h2>
          <p style={{ color: 'var(--sigil-color-slate)' }}>
            Gallery-only assignments, question import errors, quota data, and submission progress. Operational pages use live exam and chain data.
          </p>

          <div data-testid="setter-assignments-gallery" style={{ marginTop: '20px', padding: '20px', border: '1px solid var(--sigil-color-hairline)', background: 'var(--sigil-color-sheet)' }}>
            <h3>Setter assignments</h3>
            <div data-testid="setter-assignments-state-controls" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
              {(['ready', 'loading', 'empty', 'error', 'permission'] as const).map((state) => (
                <button
                  key={state}
                  type="button"
                  onClick={() => setSetterAssignmentsPageState(state)}
                  aria-pressed={setterAssignmentsPageState === state}
                  style={{
                    minHeight: '32px',
                    padding: '5px 9px',
                    border: '1px solid var(--sigil-color-hairline)',
                    background: setterAssignmentsPageState === state ? 'var(--sigil-color-ink)' : 'var(--sigil-color-sheet)',
                    color: setterAssignmentsPageState === state ? 'var(--sigil-color-sheet)' : 'var(--sigil-color-ink)',
                    cursor: 'pointer',
                  }}
                >
                  {state}
                </button>
              ))}
            </div>
            <div data-testid="setter-assignments-preview" style={{ background: 'var(--sigil-color-mist)' }}>
              <SetterAssignmentsView
                pageState={setterAssignmentsPageState}
                assignments={[setterGalleryAssignment]}
                error={new Error('Sample setter assignment request failed.')}
                onRetry={() => setSetterAssignmentsPageState('ready')}
                onOpenQuestions={() => undefined}
              />
            </div>
          </div>

          <div data-testid="question-composer-gallery" style={{ marginTop: '24px', padding: '20px', border: '1px solid var(--sigil-color-hairline)', background: 'var(--sigil-color-sheet)' }}>
            <h2 style={{ fontSize: '22px' }}>Question composer</h2>
            <h3>Page state</h3>
            <div data-testid="question-composer-state-controls" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
              {(['ready', 'loading', 'empty', 'error', 'permission'] as const).map((state) => (
                <button
                  key={state}
                  type="button"
                  onClick={() => setQuestionComposerPageState(state)}
                  aria-pressed={questionComposerPageState === state}
                  style={{
                    minHeight: '32px',
                    padding: '5px 9px',
                    border: '1px solid var(--sigil-color-hairline)',
                    background: questionComposerPageState === state ? 'var(--sigil-color-ink)' : 'var(--sigil-color-sheet)',
                    color: questionComposerPageState === state ? 'var(--sigil-color-sheet)' : 'var(--sigil-color-ink)',
                    cursor: 'pointer',
                  }}
                >
                  {state}
                </button>
              ))}
            </div>
            <h4>Submission progress</h4>
            <div data-testid="question-composer-flow-controls" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
              {(['idle', 'encrypt', 'upload', 'sign', 'confirm', 'complete', 'error'] as const).map((state) => (
                <button
                  key={state}
                  type="button"
                  onClick={() => setQuestionComposerFlowState(state)}
                  aria-pressed={questionComposerFlowState === state}
                  style={{
                    minHeight: '32px',
                    padding: '5px 9px',
                    border: '1px solid var(--sigil-color-hairline)',
                    background: questionComposerFlowState === state ? 'var(--sigil-color-ink)' : 'var(--sigil-color-sheet)',
                    color: questionComposerFlowState === state ? 'var(--sigil-color-sheet)' : 'var(--sigil-color-ink)',
                    cursor: 'pointer',
                  }}
                >
                  {state}
                </button>
              ))}
            </div>
            <div data-testid="question-composer-preview" style={{ background: 'var(--sigil-color-mist)' }}>
              <QuestionComposerView
                {...setterComposerProps}
                onRetry={() => setQuestionComposerPageState('ready')}
              />
            </div>
          </div>
        </section>

        <section id="fa-10-pages" style={{ borderTop: '1px solid var(--sigil-color-hairline)', paddingTop: '32px' }}>
          <h2>FA-10: Key holder flow page states</h2>
          <p style={{ color: 'var(--sigil-color-slate)' }}>
            Sample exam records below exist only in this gallery. Secrets are never included in the sample props.
          </p>

          <div data-testid="holder-assignments-gallery" style={{ marginTop: '20px', padding: '20px', border: '1px solid var(--sigil-color-hairline)', background: 'var(--sigil-color-sheet)' }}>
            <h3>Holder assignments</h3>
            <div data-testid="holder-assignments-state-controls" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
              {(['ready', 'loading', 'empty', 'error', 'permission'] as const).map((state) => (
                <button
                  key={state}
                  type="button"
                  onClick={() => setHolderAssignmentsPageState(state)}
                  aria-pressed={holderAssignmentsPageState === state}
                  style={{
                    minHeight: '32px',
                    padding: '5px 9px',
                    border: '1px solid var(--sigil-color-hairline)',
                    background: holderAssignmentsPageState === state ? 'var(--sigil-color-ink)' : 'var(--sigil-color-sheet)',
                    color: holderAssignmentsPageState === state ? 'var(--sigil-color-sheet)' : 'var(--sigil-color-ink)',
                    cursor: 'pointer',
                  }}
                >
                  {state}
                </button>
              ))}
            </div>
            <div data-testid="holder-assignments-preview">
              <HolderAssignmentsView
                pageState={holderAssignmentsPageState}
                assignments={[holderGalleryExam]}
                error={new Error('Sample holder assignments could not be loaded.')}
                onRetry={() => setHolderAssignmentsPageState('ready')}
                onOpenExam={() => undefined}
              />
            </div>
          </div>

          <div data-testid="holder-console-gallery" style={{ marginTop: '24px', padding: '20px', border: '1px solid var(--sigil-color-hairline)', background: 'var(--sigil-color-sheet)' }}>
            <h2 style={{ fontSize: '22px' }}>Holder exam console</h2>
            <h3>Page state</h3>
            <div data-testid="holder-console-state-controls" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
              {(['ready', 'loading', 'empty', 'error', 'permission'] as const).map((state) => (
                <button
                  key={state}
                  type="button"
                  onClick={() => setHolderConsolePageState(state)}
                  aria-pressed={holderConsolePageState === state}
                  style={{
                    minHeight: '32px',
                    padding: '5px 9px',
                    border: '1px solid var(--sigil-color-hairline)',
                    background: holderConsolePageState === state ? 'var(--sigil-color-ink)' : 'var(--sigil-color-sheet)',
                    color: holderConsolePageState === state ? 'var(--sigil-color-sheet)' : 'var(--sigil-color-ink)',
                    cursor: 'pointer',
                  }}
                >
                  {state}
                </button>
              ))}
            </div>
            <h4>Key, share and release progress</h4>
            <div data-testid="holder-console-flow-controls" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
              {(['setup', 'commitment-pending', 'ready-to-release', 'window-closed', 'already-submitted', 'submit-error'] as const).map((state) => (
                <button
                  key={state}
                  type="button"
                  onClick={() => setHolderConsoleFlowState(state)}
                  aria-pressed={holderConsoleFlowState === state}
                  style={{
                    minHeight: '32px',
                    padding: '5px 9px',
                    border: '1px solid var(--sigil-color-hairline)',
                    background: holderConsoleFlowState === state ? 'var(--sigil-color-ink)' : 'var(--sigil-color-sheet)',
                    color: holderConsoleFlowState === state ? 'var(--sigil-color-sheet)' : 'var(--sigil-color-ink)',
                    cursor: 'pointer',
                  }}
                >
                  {state}
                </button>
              ))}
            </div>
            <div data-testid="holder-console-preview">
              <HolderConsoleView
                pageState={holderConsolePageState}
                snapshot={holderGallerySnapshot}
                error={new Error('Sample holder console data could not be loaded.')}
                actions={holderGalleryActions}
              />
            </div>
          </div>
        </section>

      </div>
    </ToastProvider>
  );
}
