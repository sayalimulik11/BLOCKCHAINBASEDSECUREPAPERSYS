import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuestionComposerContainer } from '../src/pages/setter/QuestionComposerContainer';

const mocks = vi.hoisted(() => {
  const methods: Record<string, ReturnType<typeof vi.fn>> = {};
  const contract = {
    runner: { provider: { waitForTransaction: vi.fn(async () => ({ status: 1 })) } },
    getFunction: (name: string) => methods[name],
  };
  const exams = {
    exams: [{ examId: '7', state: 1 }],
    isLoading: false,
    error: null,
    refetch: vi.fn(async () => []),
  };
  const panel = {
    holders: [],
    setters: ['0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'],
    centres: [],
    totalMembers: 1,
    isLoading: false,
    error: null,
    refetch: vi.fn(async () => ({ holders: [], setters: [], centres: [] })),
  };
  const tx = {
    startTx: vi.fn(),
    setTxAwaitingSignature: vi.fn(),
    setTxPending: vi.fn(),
    setTxConfirmed: vi.fn(),
    setTxFailed: vi.fn(),
    setActiveTx: vi.fn(),
  };
  return {
    methods,
    contract,
    exams,
    panel,
    tx,
    account: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
  };
});

vi.mock('../src/auth/useAuthGuard', () => ({
  useAuthGuard: () => ({
    isAuthorized: true,
    guardState: 'authorized',
    account: mocks.account,
    chainId: '0x7a69',
    roles: ['SETTER'],
    error: null,
  }),
}));

vi.mock('../src/contracts/useExamVaultContract', () => ({
  useExamVaultContract: () => ({
    contract: mocks.contract,
    error: null,
    isLoading: false,
  }),
}));

vi.mock('../src/hooks/useExams', () => ({
  useExams: () => mocks.exams,
  useExamPanel: () => mocks.panel,
}));

vi.mock('../src/shell/AppShell', () => ({
  useTransaction: () => mocks.tx,
}));

vi.mock('@sigil/core/batch', () => ({
  encryptBatch: vi.fn(async () => ({
    envelope: new Uint8Array([0x01, 0x02, 0x03]),
    hash: `0x${'a'.repeat(64)}`,
  })),
}));

const examPublicKey = `0x04${'11'.repeat(64)}`;
let apiFetch: ReturnType<typeof vi.fn>;
let submitBatch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  submitBatch = vi.fn(async () => ({ hash: `0x${'b'.repeat(64)}` }));
  mocks.methods.getExam = vi.fn(async () => ({
    state: 1,
    quotas: [45],
    examPublicKey,
  }));
  mocks.methods.getSectionTotals = vi.fn(async () => [12]);
  mocks.methods.getPanel = vi.fn(async () => [[], [mocks.account], []]);
  mocks.methods.submitBatch = submitBatch;
  apiFetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/api/events')) {
      return { ok: true, json: async () => ({ events: [], nextCursor: null }) };
    }
    if (url.includes('/api/exams/7')) {
      return {
        ok: true,
        json: async () => ({
          metaJson: {
            title: 'Regional Physics Examination',
            sections: [{ name: 'Physics', quota: 45 }],
            releaseOpensAt: 1_800_003_600,
            examStartsAt: 1_800_005_400,
            examEndsAt: 1_800_007_200,
          },
        }),
      };
    }
    if (init?.method === 'POST') return { ok: true, status: 201, json: async () => ({ status: 'pending' }) };
    throw new Error(`Unexpected API request: ${url}`);
  });
  vi.stubGlobal('fetch', apiFetch);
});

function renderContainer() {
  return render(
    <MemoryRouter initialEntries={['/setter/exams/7/questions']}>
      <Routes>
        <Route path="/setter/exams/:examId/questions" element={<QuestionComposerContainer />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FA-09 setter submission container', () => {
  it('encrypts before upload, sends only the ciphertext, calls the checked-in submitBatch signature, and confirms in TxDrawer', async () => {
    renderContainer();
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector('h1')?.textContent).toBe('Question composer'));

    fireEvent.change(screen.getByLabelText('Question text'), {
      target: { value: 'Which value is the acceleration due to gravity?' },
    });
    for (let index = 0; index < 4; index += 1) {
      fireEvent.change(screen.getByLabelText(`Option ${index + 1}`), {
        target: { value: `Option ${index + 1}` },
      });
    }
    fireEvent.click(screen.getAllByLabelText('Correct', { selector: 'input' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Add question to preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit encrypted batch' }));

    await screen.findByText('The encrypted batch was confirmed on-chain.');
    expect(submitBatch).toHaveBeenCalledWith(
      7n,
      0,
      `0x${'a'.repeat(64)}`,
      1,
    );
    expect(mocks.tx.startTx).toHaveBeenCalledWith('Submit encrypted question batch');
    expect(mocks.tx.setTxAwaitingSignature).toHaveBeenCalledOnce();
    expect(mocks.tx.setTxPending).toHaveBeenCalledWith(`0x${'b'.repeat(64)}`);
    expect(mocks.tx.setTxConfirmed).toHaveBeenCalledWith(`0x${'b'.repeat(64)}`);

    const uploadCall = apiFetch.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(uploadCall).toBeDefined();
    const uploadBody = uploadCall?.[1]?.body as FormData;
    expect(uploadBody.get('sectionId')).toBe('0');
    expect(uploadBody.get('questionCount')).toBe('1');
    expect(uploadBody.get('file')).toBeInstanceOf(File);
    expect(String(uploadBody.get('file'))).not.toContain('acceleration due to gravity');
    await waitFor(() => expect(mocks.tx.setTxConfirmed).toHaveBeenCalledOnce());
  });
});
