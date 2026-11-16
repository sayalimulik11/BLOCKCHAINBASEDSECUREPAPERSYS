export interface PreparedSetterBatch {
  envelope: Uint8Array;
  hash: string;
  fingerprint: string;
  sectionId: number;
  questionCount: number;
  uploaded: boolean;
  transactionHash?: string;
}

export type SetterSubmissionStage = 'encrypt' | 'upload' | 'sign' | 'confirm';
export type SetterSubmissionStep = 'pending' | 'active' | 'complete' | 'error';

export interface SetterSubmissionWorkflowInput {
  prepared?: PreparedSetterBatch | null;
  fingerprint: string;
  encrypt: () => Promise<PreparedSetterBatch>;
  upload: (prepared: PreparedSetterBatch) => Promise<void>;
  sign: (prepared: PreparedSetterBatch) => Promise<string>;
  confirm: (transactionHash: string, prepared: PreparedSetterBatch) => Promise<void>;
  onPrepared: (prepared: PreparedSetterBatch) => void;
  onUploaded: (prepared: PreparedSetterBatch) => void;
  onPending?: (transactionHash: string) => void;
  onStep: (stage: SetterSubmissionStage, step: SetterSubmissionStep) => void;
}

async function runStage<T>(
  input: SetterSubmissionWorkflowInput,
  stage: SetterSubmissionStage,
  operation: () => Promise<T>,
): Promise<T> {
  input.onStep(stage, 'active');
  try {
    const result = await operation();
    input.onStep(stage, 'complete');
    return result;
  } catch (error) {
    input.onStep(stage, 'error');
    throw error;
  }
}

export async function runSetterSubmissionWorkflow(
  input: SetterSubmissionWorkflowInput,
): Promise<{ prepared: PreparedSetterBatch; transactionHash: string }> {
  let prepared = input.prepared ?? null;
  if (prepared && prepared.fingerprint !== input.fingerprint) {
    throw new Error('A previous batch is waiting for retry. Complete it before composing another batch.');
  }

  if (!prepared) {
    prepared = await runStage(input, 'encrypt', input.encrypt);
    input.onPrepared(prepared);
  } else {
    input.onStep('encrypt', 'complete');
  }

  if (!prepared.uploaded) {
    await runStage(input, 'upload', () => input.upload(prepared as PreparedSetterBatch));
    prepared.uploaded = true;
    input.onUploaded(prepared);
  } else {
    input.onStep('upload', 'complete');
  }

  const existingTransactionHash = prepared.transactionHash;
  const transactionHash = existingTransactionHash ?? await runStage(input, 'sign', () => input.sign(prepared as PreparedSetterBatch));
  prepared.transactionHash = transactionHash;
  if (existingTransactionHash) {
    input.onStep('sign', 'complete');
    input.onPending?.(existingTransactionHash);
  }
  await runStage(input, 'confirm', () => input.confirm(transactionHash, prepared as PreparedSetterBatch));
  return { prepared, transactionHash };
}
