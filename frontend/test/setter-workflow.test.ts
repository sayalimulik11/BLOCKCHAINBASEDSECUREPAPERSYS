import { describe, expect, it, vi } from 'vitest';
import {
  runSetterSubmissionWorkflow,
  type PreparedSetterBatch,
  type SetterSubmissionStage,
  type SetterSubmissionStep,
} from '../src/pages/setter/workflow';

const prepared: PreparedSetterBatch = {
  envelope: new Uint8Array([1, 2, 3]),
  hash: `0x${'a'.repeat(64)}`,
  fingerprint: 'fingerprint',
  sectionId: 0,
  questionCount: 2,
  uploaded: false,
};

function harness(overrides: Partial<{
  encrypt: () => Promise<PreparedSetterBatch>;
  upload: (batch: PreparedSetterBatch) => Promise<void>;
  sign: (batch: PreparedSetterBatch) => Promise<string>;
  confirm: (hash: string, batch: PreparedSetterBatch) => Promise<void>;
}> = {}) {
  const state = {
    prepared: null as PreparedSetterBatch | null,
    steps: [] as Array<[SetterSubmissionStage, SetterSubmissionStep]>,
  };
  const functions = {
    encrypt: vi.fn(overrides.encrypt ?? (async () => ({ ...prepared, envelope: new Uint8Array([1, 2, 3]) }))),
    upload: vi.fn(overrides.upload ?? (async () => {})),
    sign: vi.fn(overrides.sign ?? (async () => '0xtransaction')),
    confirm: vi.fn(overrides.confirm ?? (async () => {})),
  };
  const input = {
    get prepared() {
      return state.prepared;
    },
    fingerprint: 'fingerprint',
    encrypt: functions.encrypt,
    upload: functions.upload,
    sign: functions.sign,
    confirm: functions.confirm,
    onPrepared: (batch: PreparedSetterBatch) => { state.prepared = batch; },
    onUploaded: (batch: PreparedSetterBatch) => { state.prepared = batch; },
    onStep: (stage: SetterSubmissionStage, step: SetterSubmissionStep) => {
      state.steps.push([stage, step]);
    },
  };
  return { state, functions, input };
}

describe('FA-09 encrypted batch submission workflow', () => {
  it('encrypts, uploads, signs, and confirms in order', async () => {
    const { state, functions, input } = harness();
    const result = await runSetterSubmissionWorkflow(input);
    expect(result.transactionHash).toBe('0xtransaction');
    expect(functions.encrypt).toHaveBeenCalledOnce();
    expect(functions.upload).toHaveBeenCalledOnce();
    expect(functions.sign).toHaveBeenCalledOnce();
    expect(functions.confirm).toHaveBeenCalledOnce();
    expect(result.prepared.uploaded).toBe(true);
    expect(state.steps.filter(([, step]) => step === 'complete').map(([stage]) => stage))
      .toEqual(['encrypt', 'upload', 'sign', 'confirm']);
  });

  it('retries encryption safely without uploading or signing after an encryption failure', async () => {
    const encrypt = vi.fn()
      .mockRejectedValueOnce(new Error('Encryption unavailable'))
      .mockResolvedValueOnce({ ...prepared, envelope: new Uint8Array([1, 2, 3]) });
    const { state, functions, input } = harness({ encrypt });
    await expect(runSetterSubmissionWorkflow(input)).rejects.toThrow('Encryption unavailable');
    expect(state.steps).toContainEqual(['encrypt', 'error']);
    await runSetterSubmissionWorkflow(input);
    expect(encrypt).toHaveBeenCalledTimes(2);
    expect(functions.upload).toHaveBeenCalledOnce();
    expect(functions.sign).toHaveBeenCalledOnce();
  });

  it.each(['upload', 'sign', 'confirm'] as const)('retries a %s failure without repeating completed prerequisites', async (failureStage) => {
    const failure = new Error(`${failureStage} unavailable`);
    const operation = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const options = failureStage === 'upload'
      ? { upload: operation }
      : failureStage === 'sign'
        ? { sign: operation }
        : { confirm: operation };
    const { state, functions, input } = harness(options);

    await expect(runSetterSubmissionWorkflow(input)).rejects.toThrow(failure);
    expect(state.steps).toContainEqual([failureStage, 'error']);
    await runSetterSubmissionWorkflow(input);

    expect(functions.encrypt).toHaveBeenCalledOnce();
    if (failureStage === 'upload') {
      expect(functions.upload).toHaveBeenCalledTimes(2);
      expect(functions.sign).toHaveBeenCalledOnce();
    } else {
      expect(functions.upload).toHaveBeenCalledOnce();
      expect(functions.sign).toHaveBeenCalledTimes(failureStage === 'sign' ? 2 : 1);
    }
    expect(functions.confirm).toHaveBeenCalledTimes(failureStage === 'confirm' ? 2 : 1);
  });

  it('refuses to reuse an encrypted payload for changed questions', async () => {
    const { input, functions } = harness();
    await expect(runSetterSubmissionWorkflow({
      ...input,
      prepared: { ...prepared, uploaded: true },
      fingerprint: 'different-question-content',
    })).rejects.toThrow(/previous batch is waiting for retry/i);
    expect(functions.upload).not.toHaveBeenCalled();
    expect(functions.sign).not.toHaveBeenCalled();
  });
});
