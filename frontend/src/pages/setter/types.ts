export type SetterPageState = 'loading' | 'empty' | 'error' | 'permission' | 'ready';

export interface SetterSection {
  sectionId: number;
  name: string;
  quota: number;
  submitted: number;
}

export interface SetterAssignment {
  examId: string;
  title: string;
  state: string;
  sections: readonly SetterSection[];
}

export interface SetterAssignmentsViewProps {
  pageState: SetterPageState;
  assignments: readonly SetterAssignment[];
  error?: Error | null;
  onRetry?: () => void;
  onOpenQuestions: (examId: string) => void;
}

export interface SetterSubmission {
  id: string;
  sectionId: number;
  questionCount: number;
  hash: string;
  transactionHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  submittedAt?: string;
}

export type SubmissionStep = 'pending' | 'active' | 'complete' | 'error';

export interface SubmissionProgress {
  encrypt: SubmissionStep;
  upload: SubmissionStep;
  sign: SubmissionStep;
  confirm: SubmissionStep;
}

export interface QuestionComposerViewProps {
  pageState: SetterPageState;
  exam: SetterAssignment | null;
  submissions: readonly SetterSubmission[];
  importErrors: readonly import('./question-import').QuestionImportError[];
  progress: SubmissionProgress;
  statusMessage?: string | null;
  actionError?: string | null;
  hasPreparedBatch?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onImport: (file: File) => Promise<import('./question-import').QuestionImportResult>;
  onSubmit: (sectionId: number, questions: readonly import('@sigil/core/types').QuestionPlain[]) => Promise<void>;
}
