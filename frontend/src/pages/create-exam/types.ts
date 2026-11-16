import type { ExamConfig } from '../../../../packages/contracts-types/src/index';
import type { paths } from '../../api/generated';

export type ExamMetadata =
  paths['/api/exams/{id}/meta']['post']['requestBody']['content']['application/json'];

export type ExamMetadataConfig = Omit<ExamConfig, 'metaHash'>;

export interface ExamWizardParticipant {
  address: string;
  roles: readonly string[];
}

export interface ExamWizardDraft {
  title: string;
  sections: Array<{ name: string; quota: string }>;
  releaseOpensAt: string;
  examStartsAt: string;
  examEndsAt: string;
  threshold: string;
  holders: string[];
  setters: string[];
  centres: string[];
}

export interface ExamWizardContext {
  participants: readonly ExamWizardParticipant[];
  encryptionKeys: Readonly<Record<string, boolean>>;
  chainTime: number | null;
  minLeadSeconds: number | null;
}

export interface ExamWizardValidation {
  metadata: ExamMetadata | null;
  config: ExamMetadataConfig | null;
  errors: Readonly<Record<string, string>>;
}
