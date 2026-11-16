import type { ExamState } from '@sigil/ui';

export type CommandCentrePageState = 'loading' | 'empty' | 'error' | 'permission' | 'ready';

export interface CommandCentreExam {
  examId: string;
  title: string;
  state: ExamState;
  metaHash: string;
  bankHash: string | null;
  rosetteHash: string;
  releaseOpensAt: number;
  examStartsAt: number;
  examEndsAt: number;
  threshold: number;
  holderCount: number;
}

export type ReadinessCell =
  | 'complete'
  | 'pending'
  | 'not-applicable'
  | 'not-tracked'
  | 'unknown';

export interface CommandCentreReadinessRow {
  address: string;
  role: 'Holder' | 'Setter';
  keyRegistered: ReadinessCell;
  shareVerified: ReadinessCell;
  randomnessCommitted: ReadinessCell;
  batchesSubmitted: ReadinessCell;
  batchCount: number | null;
}

export interface SectionQuestionCount {
  name: string;
  quota: number;
  questionCount: number;
}

export interface CommandCentreViewProps {
  pageState: CommandCentrePageState;
  error?: Error | null;
  exam: CommandCentreExam | null;
  countdownTarget: number;
  readinessRows: readonly CommandCentreReadinessRow[];
  sectionCounts: readonly SectionQuestionCount[];
  sealDisabledReason: string | null;
  concludeDisabledReason: string | null;
  actionError: string | null;
  isActionPending?: boolean;
  onRetry?: () => void;
  onBackToDocket?: () => void;
  onSeal: () => void;
  onConclude: () => void;
  onCancel: () => void;
}
