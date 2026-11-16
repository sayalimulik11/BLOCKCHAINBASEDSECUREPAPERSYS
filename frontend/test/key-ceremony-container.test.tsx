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
  response: { hash: `0x${'b'.repeat(64)}`, wait: vi.fn() },
  runCeremony: vi.fn(),
  transaction: {
    startTx: vi.fn(),
    setTxAwaitingSignature: vi.fn(),
    setTxPending: vi.fn(),
    setTxConfirmed: vi.fn(),
    setTxFailed: vi.fn(),
    setActiveTx: vi.fn(),
  },
  exams: [{
    examId: '7',
    chainId: 31337,
    state: 0,
    metaHash: `0x${'1'.repeat(64)}`,
    releaseOpensAt: '1800003600',
    examStartsAt: '1800007200',
    examEndsAt: '1800010800',
    threshold: 2,
    bankHash: null,
    seed: null,
  }],
  holders: [
    '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  ],
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useParams: () => ({ examId: '7' }) };
});

vi.mock('../src/auth/useAuthGuard', () => ({
  useAuthGuard: () => ({ isAuthorized: true, guardState: 'authorized' }),
}));

vi.mock('../src/hooks/useExams', () => ({
  useExams: () => ({ exams: mocks.exams, isLoading: false, error: null, refetch: vi.fn() }),
  useExamPanel: () => ({
    holders: mocks.holders,
    setters: [],
    centres: [],
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

vi.mock('@sigil/core/ceremony', () => ({
  runCeremony: (...args: unknown[]) => mocks.runCeremony(...args),
}));

import { KeyCeremonyContainer } from '../src/pages/key-ceremony/KeyCeremonyContainer';

describe('FA-06 key-ceremony transaction lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.contractFunctions = {
      getExam: async () => ({ state: 0 }),
      encryptionKeys: async () => new Uint8Array(65).fill(1),
      openCollection: async () => mocks.response,
    };
    mocks.contract.getFunction.mockImplementation((name: string) => mocks.contractFunctions[name]);
    mocks.runCeremony.mockResolvedValue({
      examPublicKey: new Uint8Array([9, 8, 7]),
      encryptedShares: mocks.holders.map((holder) => ({
        holder,
        envelope: new Uint8Array([1, 2, 3]),
      })),
    });
    mocks.response.wait = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));
  });

  it('shows the in-flight Open collection transaction and confirms it after receipt', async () => {
    let resolveReceipt!: (receipt: { status: number }) => void;
    mocks.response.wait = vi.fn(() => new Promise((resolve) => {
      resolveReceipt = resolve;
    }));

    render(<KeyCeremonyContainer />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open collection' }));

    await waitFor(() => {
      expect(mocks.runCeremony).toHaveBeenCalledOnce();
      expect(mocks.contract.getFunction).toHaveBeenCalledWith('openCollection');
      expect(mocks.transaction.startTx).toHaveBeenCalledWith('Open collection');
      expect(mocks.transaction.setTxAwaitingSignature).toHaveBeenCalledOnce();
      expect(mocks.transaction.setTxPending).toHaveBeenCalledWith(mocks.response.hash);
    });
    expect(screen.getByRole('button', { name: 'Running ceremony' })).toBeDisabled();
    resolveReceipt({ status: 1 });
    await waitFor(() => expect(mocks.transaction.setTxConfirmed).toHaveBeenCalledWith(mocks.response.hash));
  });

  it('reports an Open collection failure and retries without re-uploading encrypted shares', async () => {
    mocks.response.wait = vi.fn()
      .mockRejectedValueOnce(new Error('execution reverted: WrongState'))
      .mockResolvedValueOnce({ status: 1 });

    render(<KeyCeremonyContainer />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open collection' }));

    await waitFor(() => {
      expect(mocks.transaction.setTxFailed).toHaveBeenCalledOnce();
      expect(screen.getByRole('alert')).toHaveTextContent(/wrong lifecycle state/i);
    });
    const uploadCalls = vi.mocked(fetch).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Retry failed step' }));

    await waitFor(() => expect(mocks.transaction.setTxConfirmed).toHaveBeenCalledWith(mocks.response.hash));
    expect(mocks.runCeremony).toHaveBeenCalledOnce();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(uploadCalls);
  });
});
