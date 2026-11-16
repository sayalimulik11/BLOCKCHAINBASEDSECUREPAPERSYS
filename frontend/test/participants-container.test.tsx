import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getFunction: vi.fn(),
  transaction: {
    startTx: vi.fn(),
    setTxAwaitingSignature: vi.fn(),
    setTxPending: vi.fn(),
    setTxConfirmed: vi.fn(),
    setTxFailed: vi.fn(),
    setActiveTx: vi.fn(),
  },
}));

vi.mock('../src/contracts/useExamVaultContract', () => ({
  useExamVaultContract: () => ({
    contract: { getFunction: mocks.getFunction },
    error: null,
    isLoading: false,
  }),
}));

vi.mock('../src/auth/useAuthGuard', () => ({
  useAuthGuard: () => ({ isAuthorized: true, guardState: 'authorized' }),
}));

vi.mock('../src/shell/AppShell', () => ({
  useTransaction: () => mocks.transaction,
}));

import { ParticipantsContainer } from '../src/pages/participants/ParticipantsContainer';

const holderAddress = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const transactionHash = `0x${'a'.repeat(64)}`;

function installParticipantsApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => ({
      ok: true,
      json: async () => ({
        events: String(input).includes('ParticipantRegistered')
          ? [
              {
                payloadJson: {
                  account: holderAddress,
                  role: 3,
                  profileHash: null,
                },
              },
            ]
          : [],
      }),
    })),
  );
}

describe('FA-05: participant transaction container', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installParticipantsApi();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('runs registration through awaiting-signature, pending, and confirmed states', async () => {
    const wait = vi.fn().mockResolvedValue({ status: 1 });
    mocks.getFunction.mockImplementation(() => async () => ({ hash: transactionHash, wait }));

    render(<ParticipantsContainer />);
    await screen.findByRole('button', { name: /revoke holder/i });
    fireEvent.click(screen.getByRole('button', { name: /register participant/i }));
    fireEvent.change(screen.getByLabelText(/ethereum account address/i), {
      target: { value: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign & register/i }));

    await waitFor(() => {
      expect(mocks.transaction.startTx).toHaveBeenCalledWith('Registering participant as AUTHORITY');
      expect(mocks.transaction.setTxAwaitingSignature).toHaveBeenCalledOnce();
      expect(mocks.transaction.setTxPending).toHaveBeenCalledWith(transactionHash);
      expect(mocks.transaction.setTxConfirmed).toHaveBeenCalledWith(transactionHash);
      expect(wait).toHaveBeenCalledOnce();
    });
  });

  it('decodes the live-holder revoke rejection into a plain-language transaction error', async () => {
    mocks.getFunction.mockImplementation(() => async () => {
      throw new Error('execution reverted: HolderInLiveExam()');
    });

    render(<ParticipantsContainer />);
    fireEvent.click(await screen.findByRole('button', { name: /revoke holder/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm revocation/i }));

    await waitFor(() => {
      expect(mocks.transaction.setActiveTx).toHaveBeenCalledWith({
        status: 'failed',
        title: 'Revoking HOLDER role',
        errorMessage:
          'This key holder is currently participating in an active exam. Conclude or cancel live exams before revoking roles or updating keys.',
      });
    });
    expect(mocks.transaction.setTxPending).not.toHaveBeenCalled();
    expect(mocks.transaction.setTxFailed).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /confirm revocation/i })).toBeInTheDocument();
  });
});
