export type HolderPageState = 'loading' | 'empty' | 'error' | 'permission' | 'ready';
export type HolderExamState = 'Draft' | 'Collecting' | 'Sealed' | 'Released' | 'Concluded' | 'Cancelled';

export interface HolderExamAssignment {
  examId: string;
  title: string;
  state: HolderExamState;
  rosetteHash: string;
  releaseOpensAt: number;
  examStartsAt: number;
  examEndsAt: number;
  threshold: number;
  holderCount: number;
  sections: ReadonlyArray<{ name: string; quota: number }>;
}

export interface HolderAssignmentsViewProps {
  pageState: HolderPageState;
  assignments: readonly HolderExamAssignment[];
  error?: Error | null;
  onRetry?: () => void;
  onOpenExam: (examId: string) => void;
}

export interface HolderConsoleSnapshot {
  exam: HolderExamAssignment | null;
  keyRegistered: boolean;
  shareUnlocked: boolean;
  shareVerified: boolean;
  randomnessCommitted: boolean;
  shareSubmitted: boolean;
  submissionCount: number;
  chainTime: number | null;
}

export interface HolderConsoleActions {
  setupPassphrase: string;
  releasePassphrase: string;
  isGeneratingKeystore: boolean;
  hasGeneratedKeystore: boolean;
  hasDownloadedKeystore: boolean;
  hasKeystoreFile: boolean;
  isRegisteringKey: boolean;
  isUnlocking: boolean;
  isCommittingRandomness: boolean;
  isSubmittingShare: boolean;
  isTransactionPending: boolean;
  actionMessage: string | null;
  actionError: string | null;
  onSetupPassphraseChange: (value: string) => void;
  onGenerateKeystore: () => void;
  onDownloadKeystore: () => void;
  onRegisterKey: () => void;
  onKeystoreFile: (file: File | null) => void;
  onReleasePassphraseChange: (value: string) => void;
  onUnlockShare: () => void;
  onCommitRandomness: () => void;
  onSubmitShare: () => void;
  onClearSecrets: () => void;
  onRetry: () => void;
}

export interface HolderConsoleViewProps {
  pageState: HolderPageState;
  snapshot: HolderConsoleSnapshot;
  error?: Error | null;
  actions: HolderConsoleActions;
}
