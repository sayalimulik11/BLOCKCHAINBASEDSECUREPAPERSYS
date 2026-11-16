import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  examState: 1,
  bankHash: `0x${'0'.repeat(64)}`,
  transactionResponse: {
    hash: `0x${'a'.repeat(64)}`,
    wait: vi.fn(),
  },
  contractFunctions: {} as Record<string, (...args: unknown[]) => unknown>,
  contract: {
    runner: {
      provider: { getBlock: vi.fn(async () => ({ timestamp: 1_800_000_000 })) },
    },
    getFunction: vi.fn(),
  },
  navigate: vi.fn(),
  transaction: {
    startTx: vi.fn(),
    setTxAwaitingSignature: vi.fn(),
    setTxPending: vi.fn(),
    setTxConfirmed: vi.fn(),
    setTxFailed: vi.fn(),
    setActiveTx: vi.fn(),
  },
  panel: {
    holders: ['0x70997970C51812dc3A010C7d01b50e0d17dc79C8'],
    setters: ['0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  },
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useParams: () => ({ examId: '7' }),
  };
});

vi.mock('../src/auth/useAuthGuard', () => ({
  useAuthGuard: () => ({ isAuthorized: true, guardState: 'authorized' }),
}));

vi.mock('../src/contracts/useExamVaultContract', () => ({
  useExamVaultContract: () => ({
    contract: mocks.contract,
    error: null,
    isLoading: false,
  }),
}));

vi.mock('../src/hooks/useExams', () => ({
  useExamPanel: () => mocks.panel,
}));

vi.mock('../src/shell/AppShell', () => ({
  useTransaction: () => mocks.transaction,
}));

vi.mock('@sigil/core/canonical', () => ({
  keccakJson: () => `0x${'1'.repeat(64)}`,
}));

vi.mock('@sigil/core/schemas', () => ({
  ExamMetaSchema: {
    safeParse: (value: unknown) => ({ success: true, data: value }),
  },
}));

import { CommandCentreContainer } from '../src/pages/command-centre/CommandCentreContainer';

const examMetadata = {
  title: 'Regional Physics Examination',
  sections: [{ name: 'Physics', quota: 45 }],
};
const zeroHash = `0x${'0'.repeat(64)}`;
const bankHash = `0x${'2'.repeat(64)}`;
const txHash = `0x${'a'.repeat(64)}`;

function installData() {
  mocks.contractFunctions = {
    getExam: async () => ({
      state: mocks.examState,
      metaHash: `0x${'1'.repeat(64)}`,
      bankHash: mocks.bankHash,
      releaseOpensAt: 1_800_000_000,
      examStartsAt: 1_800_003_600,
      examEndsAt: 1_800_000_000,
      threshold: 1,
    }),
    getSectionQuestionCount: async () => 45,
    encryptionKeys: async () => `0x${'1'.repeat(130)}`,
    hasCommittedRandomness: async () => true,
    sealExam: async () => mocks.transactionResponse,
    concludeExam: async () => mocks.transactionResponse,
    cancelExam: async () => mocks.transactionResponse,
  };
  mocks.contract.getFunction.mockImplementation((name: string) => mocks.contractFunctions[name]);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => ({
      ok: true,
      json: async () => String(input).includes('/readiness')
        ? { setters: [], notTrackedByServer: ['shareVerified'] }
        : { metaJson: examMetadata },
    })),
  );
}

function setActionState(state: number) {
  mocks.examState = state;
  mocks.bankHash = state >= 2 ? bankHash : zeroHash;
}

const actions = [
  { label: 'Seal exam', method: 'sealExam', state: 1 },
  { label: 'Conclude exam', method: 'concludeExam', state: 3 },
  { label: 'Cancel exam', method: 'cancelExam', state: 1 },
] as const;

async function clickAction(label: string) {
  await screen.findByRole('heading', { name: 'Regional Physics Examination' });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument(),
  );
  if (label === 'Cancel exam') {
    fireEvent.change(
      screen.getByLabelText('Type No. 0007 to confirm cancellation'),
      { target: { value: 'No. 0007' } },
    );
  }
  fireEvent.click(screen.getByRole('button', { name: label }));
}

describe('FA-07 command-centre transaction lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActionState(1);
    mocks.transactionResponse.wait = vi.fn();
    installData();
  });

  it.each(actions)('$label shows awaiting-signature and pending before confirmation', async ({ label, method, state }) => {
    setActionState(state);
    let resolveReceipt!: (receipt: { status: number }) => void;
    mocks.transactionResponse.wait = vi.fn(() => new Promise((resolve) => {
      resolveReceipt = resolve;
    }));

    render(<CommandCentreContainer />);
    await clickAction(label);

    await waitFor(() => {
      expect(mocks.contract.getFunction).toHaveBeenCalledWith(method);
      expect(mocks.transaction.startTx).toHaveBeenCalledWith(label);
      expect(mocks.transaction.setTxAwaitingSignature).toHaveBeenCalledOnce();
      expect(mocks.transaction.setTxPending).toHaveBeenCalledWith(txHash);
    });
    expect(screen.getAllByRole('button', { name: 'Transaction pending' }))
      .toHaveLength(3);
    screen.getAllByRole('button', { name: 'Transaction pending' })
      .forEach((button) => expect(button).toBeDisabled());
    resolveReceipt({ status: 1 });
    await waitFor(() => expect(mocks.transaction.setTxConfirmed).toHaveBeenCalledWith(txHash));
  });

  it.each(actions)('$label reports a failed receipt through the shared transaction decoder', async ({ label, method, state }) => {
    setActionState(state);
    mocks.transactionResponse.wait = vi.fn().mockRejectedValue(new Error('execution reverted: action failed'));

    render(<CommandCentreContainer />);
    await clickAction(label);

    await waitFor(() => {
      expect(mocks.contract.getFunction).toHaveBeenCalledWith(method);
      expect(mocks.transaction.setTxFailed).toHaveBeenCalledOnce();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(mocks.transaction.setTxConfirmed).not.toHaveBeenCalled();
  });
});
