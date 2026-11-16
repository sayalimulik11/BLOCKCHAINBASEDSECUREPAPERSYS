export interface PreparedCeremony {
  examPublicKey: Uint8Array;
  encryptedShares: ReadonlyArray<{ holder: string; envelope: Uint8Array }>;
}

export type CeremonyStepStatus = 'pending' | 'active' | 'complete' | 'error';

export interface CeremonyWorkflowInput {
  prepared?: PreparedCeremony | null;
  uploaded?: boolean;
  prepare: () => Promise<PreparedCeremony>;
  upload: (prepared: PreparedCeremony) => Promise<void>;
  openCollection: (examPublicKey: Uint8Array) => Promise<void>;
  onPrepared: (prepared: PreparedCeremony) => void;
  onUploaded: () => void;
  onStep: (index: number, status: CeremonyStepStatus) => void;
}

export async function runCeremonyWorkflow(input: CeremonyWorkflowInput): Promise<void> {
  let prepared = input.prepared ?? null;
  let uploaded = input.uploaded ?? false;

  if (!prepared) {
    input.onStep(0, 'active');
    prepared = await input.prepare();
    input.onPrepared(prepared);
  }
  input.onStep(0, 'complete');
  input.onStep(1, 'complete');
  input.onStep(2, 'complete');

  if (!uploaded) {
    input.onStep(3, 'active');
    await input.upload(prepared);
    uploaded = true;
    input.onUploaded();
  }
  input.onStep(3, 'complete');

  input.onStep(4, 'active');
  await input.openCollection(prepared.examPublicKey);
  input.onStep(4, 'complete');
  input.onStep(5, 'pending');
}
