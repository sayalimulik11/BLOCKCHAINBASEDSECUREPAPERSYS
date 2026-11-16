import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  contractFunctions: {} as Record<string, (...args: unknown[]) => unknown>,
  contract: {
    runner: {
      provider: { getBlock: vi.fn(async () => ({ timestamp: 1_800_000_000 })) },
    },
    getFunction: vi.fn(),
  },
  response: { hash: `0x${'a'.repeat(64)}`, wait: vi.fn() },
  navigate: vi.fn(),
  transaction: {
    startTx: vi.fn(),
    setTxAwaitingSignature: vi.fn(),
    setTxPending: vi.fn(),
    setTxConfirmed: vi.fn(),
    setTxFailed: vi.fn(),
    setActiveTx: vi.fn(),
  },
  participants: [{
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    roles: ['HOLDER'],
  }],
  metadata: { title: 'Regional Physics Examination', sections: [{ name: 'Physics', quota: 45 }] },
  config: {
    holders: ['0x70997970C51812dc3A010C7d01b50e0d17dc79C8'],
    setters: [],
    centres: [],
    threshold: 1,
    quotas: [45],
    releaseOpensAt: 1_800_003_600,
    examStartsAt: 1_800_007_200,
    examEndsAt: 1_800_010_800,
  },
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock('../src/auth/useAuthGuard', () => ({
  useAuthGuard: () => ({ isAuthorized: true, guardState: 'authorized' }),
}));

vi.mock('../src/hooks/useParticipants', () => ({
  useParticipants: () => ({
    participants: mocks.participants,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('../src/contracts/useExamVaultContract', () => ({
  useExamVaultContract: () => ({
    contract: mocks.contract,
    error: null,
    isLoading: false,
  }),
}));

vi.mock('../src/shell/AppShell', () => ({
  useTransaction: () => mocks.transaction,
}));

vi.mock('@sigil/core/canonical', () => ({
  keccakJson: () => `0x${'1'.repeat(64)}`,
}));

vi.mock('../src/pages/create-exam/CreateExamView', () => ({
  CreateExamView: ({
    isSubmitting,
    metadataError,
    onCreate,
  }: {
    isSubmitting?: boolean;
    metadataError?: string | null;
    onCreate: (metadata: typeof mocks.metadata, config: typeof mocks.config) => void;
  }) => (
    <div>
      <button
        type="button"
        disabled={isSubmitting}
        onClick={() => onCreate(mocks.metadata, mocks.config)}
      >
        {isSubmitting ? 'Awaiting confirmation' : 'Create exam'}
      </button>
      {metadataError && <p role="alert">{metadataError}</p>}
    </div>
  ),
}));

import { CreateExamContainer } from '../src/pages/create-exam/CreateExamContainer';

describe('FA-06 create-exam transaction lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.contractFunctions = {
      minLeadSeconds: async () => 60,
      encryptionKeys: async () => `0x${'1'.repeat(130)}`,
      createExam: async () => mocks.response,
    };
    mocks.contract.getFunction.mockImplementation((name: string) => mocks.contractFunctions[name]);
    mocks.response.wait = vi.fn();
  });

  it('disables submission while awaiting confirmation and records a confirmed transaction', async () => {
    let resolveReceipt!: (receipt: { status: number; logs: never[] }) => void;
    mocks.response.wait = vi.fn(() => new Promise((resolve) => {
      resolveReceipt = resolve;
    }));

    render(<CreateExamContainer />);
    await screen.findByRole('button', { name: 'Create exam' });
    fireEvent.click(screen.getByRole('button', { name: 'Create exam' }));

    await waitFor(() => {
      expect(mocks.transaction.startTx).toHaveBeenCalledWith('Create exam');
      expect(mocks.transaction.setTxAwaitingSignature).toHaveBeenCalledOnce();
      expect(mocks.transaction.setTxPending).toHaveBeenCalledWith(mocks.response.hash);
    });
    expect(screen.getByRole('button', { name: 'Awaiting confirmation' })).toBeDisabled();
    resolveReceipt({ status: 1, logs: [] });
    await waitFor(() => expect(mocks.transaction.setTxConfirmed).toHaveBeenCalledWith(mocks.response.hash));
  });

  it('decodes a failed pending transaction and makes the action available again', async () => {
    mocks.response.wait = vi.fn().mockRejectedValue(new Error('execution reverted: InvalidTimes'));

    render(<CreateExamContainer />);
    await screen.findByRole('button', { name: 'Create exam' });
    fireEvent.click(screen.getByRole('button', { name: 'Create exam' }));

    await waitFor(() => expect(mocks.transaction.setTxFailed).toHaveBeenCalledOnce());
    expect(mocks.transaction.setTxConfirmed).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Create exam' })).toBeEnabled();
  });
});
