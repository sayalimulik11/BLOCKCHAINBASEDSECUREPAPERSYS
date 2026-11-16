import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HolderConsoleContainer } from '../src/pages/holder/HolderConsoleContainer';

const mocks = vi.hoisted(() => {
  const account = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';
  const chain = {
    encryptionKey: new Uint8Array(),
    shareCommitment: `0x${'0'.repeat(64)}`,
    randomnessCommitted: false,
    shareSubmitted: false,
    submissionCount: 1,
    blockTimestamp: 1_800_000_000,
    submitError: null as { name: string; message: string } | null,
    submittedShare: null as Uint8Array | null,
  };
  const txResponse = {
    hash: `0x${'b'.repeat(64)}`,
    wait: vi.fn(async () => ({ status: 1 })),
  };
  const methods: Record<string, ReturnType<typeof vi.fn>> = {};
  const contract = {
    runner: {
      provider: { getBlock: vi.fn(async () => ({ timestamp: chain.blockTimestamp })) },
    },
    getFunction: (name: string) => methods[name],
  };
  const exams = {
    exams: [{
      examId: '7',
      chainId: 31_337,
      state: 1,
      metaHash: `0x${'c'.repeat(64)}`,
      releaseOpensAt: '1799999900',
      examStartsAt: '1800000100',
      examEndsAt: '1800001000',
      threshold: 3,
      bankHash: null,
      seed: null,
    }],
    isLoading: false,
    error: null,
    refetch: vi.fn(async () => exams.exams),
  };
  const panel = {
    holders: [account, '0x0000000000000000000000000000000000000002', '0x0000000000000000000000000000000000000003'],
    setters: [],
    centres: [],
    totalMembers: 3,
    isLoading: false,
    error: null,
    refetch: vi.fn(async () => ({ holders: panel.holders, setters: [], centres: [] })),
  };
  const tx = {
    startTx: vi.fn(),
    setTxAwaitingSignature: vi.fn(),
    setTxPending: vi.fn(),
    setTxConfirmed: vi.fn(),
    setTxFailed: vi.fn(),
    setActiveTx: vi.fn(),
  };
  const pubKey = new Uint8Array([4, ...new Array<number>(64).fill(0xab)]);
  const decryptedShare = new TextEncoder().encode('TEST_PLAINTEXT_SHARE');
  const crypto = {
    generatedKeystore: '{"v":1,"ciphertext":"encrypted-fixture"}',
    pubKey,
    decryptedShare,
    lastHolderKey: null as { privateKeyJwk: JsonWebKey; publicKey: Uint8Array } | null,
    shareCommitment: `0x${'a'.repeat(64)}`,
    randomnessCommitment: `0x${'d'.repeat(64)}`,
    reveal: `0x${'e'.repeat(64)}`,
    unlockError: null as Error | null,
  };
  const api = {
    fetch: vi.fn(),
  };
  return { account, chain, txResponse, methods, contract, exams, panel, tx, crypto, api };
});

vi.mock('../src/auth/useAuthGuard', () => ({
  useAuthGuard: () => ({
    isAuthorized: true,
    guardState: 'authorized',
    account: mocks.account,
    chainId: '0x7a69',
    roles: ['HOLDER'],
    error: null,
  }),
}));

vi.mock('../src/contracts/useExamVaultContract', () => ({
  useExamVaultContract: () => ({ contract: mocks.contract, error: null, isLoading: false }),
}));

vi.mock('../src/hooks/useExams', () => ({
  useExams: () => mocks.exams,
  useExamPanel: () => mocks.panel,
}));

vi.mock('../src/shell/AppShell', () => ({
  useTransaction: () => mocks.tx,
}));

vi.mock('@sigil/core/keystore', () => ({
  createKeystore: vi.fn(async () => ({
    keystore: mocks.crypto.generatedKeystore,
    pubKey: mocks.crypto.pubKey.slice(),
  })),
  unlockKeystore: vi.fn(async () => {
    if (mocks.crypto.unlockError) throw mocks.crypto.unlockError;
    const key = {
      privateKeyJwk: {
        kty: 'EC',
        crv: 'P-256',
        d: 'TEST_PRIVATE_KEY',
        x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        y: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      },
      publicKey: mocks.crypto.pubKey.slice(),
    };
    mocks.crypto.lastHolderKey = key;
    return key;
  }),
  deriveReveal: vi.fn(async () => mocks.crypto.reveal),
  randomnessCommitment: vi.fn(() => mocks.crypto.randomnessCommitment),
}));

vi.mock('@sigil/core/envelope', () => ({
  aadFor: vi.fn(() => 'SIGIL/v1:test:share'),
  decryptEnvelope: vi.fn(async () => mocks.crypto.decryptedShare),
}));

vi.mock('@sigil/core/shares', () => ({
  shareCommitment: vi.fn(() => mocks.crypto.shareCommitment),
}));

const examMetadata = {
  title: 'Regional Physics Examination',
  sections: [{ name: 'Physics', quota: 45 }],
  releaseOpensAt: 1_799_999_900,
  examStartsAt: 1_800_000_100,
  examEndsAt: 1_800_001_000,
};

function bytesFromHex(value: string) {
  const hex = value.replace(/^0x/, '');
  return Uint8Array.from({ length: hex.length / 2 }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  );
}

function createRoute() {
  return (
    <MemoryRouter initialEntries={['/holder/exams/7']}>
      <Routes>
        <Route path="/holder/exams/:examId" element={<HolderConsoleContainer />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderRoute() {
  return render(createRoute());
}

function configureContractMethods() {
  mocks.methods.encryptionKeys = vi.fn(async () => mocks.chain.encryptionKey);
  mocks.methods.getShareCommitment = vi.fn(async () => mocks.chain.shareCommitment);
  mocks.methods.hasCommittedRandomness = vi.fn(async () => mocks.chain.randomnessCommitted);
  mocks.methods.hasSubmittedShare = vi.fn(async () => mocks.chain.shareSubmitted);
  mocks.methods.getShareSubmissionCount = vi.fn(async () => mocks.chain.submissionCount);
  mocks.methods.setEncryptionKey = vi.fn(async (key: string) => {
    mocks.chain.encryptionKey = bytesFromHex(key);
    return mocks.txResponse;
  });
  mocks.methods.commitRandomness = vi.fn(async (
    _examId: bigint,
    shareCommitment: string,
    _randomnessCommitment: string,
  ) => {
    mocks.chain.shareCommitment = shareCommitment;
    mocks.chain.randomnessCommitted = true;
    return mocks.txResponse;
  });
  mocks.methods.submitShare = vi.fn(async (_examId: bigint, share: Uint8Array) => {
    if (mocks.chain.submitError) throw mocks.chain.submitError;
    mocks.chain.submittedShare = share.slice();
    mocks.chain.shareSubmitted = true;
    mocks.chain.submissionCount += 1;
    return mocks.txResponse;
  });
}

let apiFetch: ReturnType<typeof vi.fn>;
let createObjectUrl: ReturnType<typeof vi.fn>;
let revokeObjectUrl: ReturnType<typeof vi.fn>;
let anchorClick: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.chain.encryptionKey = new Uint8Array();
  mocks.chain.shareCommitment = `0x${'0'.repeat(64)}`;
  mocks.chain.randomnessCommitted = false;
  mocks.chain.shareSubmitted = false;
  mocks.chain.submissionCount = 1;
  mocks.chain.blockTimestamp = 1_800_000_000;
  mocks.chain.submitError = null;
  mocks.chain.submittedShare = null;
  mocks.exams.exams = [{
    examId: '7',
    chainId: 31_337,
    state: 1,
    metaHash: `0x${'c'.repeat(64)}`,
    releaseOpensAt: '1799999900',
    examStartsAt: '1800000100',
    examEndsAt: '1800001000',
    threshold: 3,
    bankHash: null,
    seed: null,
  }];
  mocks.panel.holders = [
    mocks.account,
    '0x0000000000000000000000000000000000000002',
    '0x0000000000000000000000000000000000000003',
  ];
  mocks.crypto.lastHolderKey = null;
  mocks.crypto.unlockError = null;
  mocks.crypto.decryptedShare = new TextEncoder().encode('TEST_PLAINTEXT_SHARE');
  mocks.crypto.shareCommitment = `0x${'a'.repeat(64)}`;
  configureContractMethods();
  apiFetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/exams/7/shares/me')) {
      return {
        ok: true,
        json: async () => ({ examId: '7', holder: mocks.account, envelope: '0x0102' }),
      };
    }
    if (url.endsWith('/api/exams/7')) {
      return { ok: true, json: async () => ({ metaJson: examMetadata }) };
    }
    throw new Error(`Unexpected holder API request: ${url}`);
  });
  vi.stubGlobal('fetch', apiFetch);
  createObjectUrl = vi.fn(() => 'blob:sigil-key');
  revokeObjectUrl = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
  anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

async function selectAndUnlockShare(passphrase = 'test-only-release-passphrase') {
  const file = new File(['test-only-encrypted-keystore'], 'holder.sigilkey', {
    type: 'application/json',
  });
  Object.defineProperty(file, 'text', {
    value: async () => 'test-only-encrypted-keystore',
  });
  fireEvent.change(screen.getByLabelText('Choose keystore file'), { target: { files: [file] } });
  await screen.findByText('Encrypted keystore selected for this session.');
  fireEvent.change(screen.getByLabelText('Keystore passphrase'), { target: { value: passphrase } });
  fireEvent.click(screen.getByRole('button', { name: 'Unlock and verify share' }));
}

describe('FA-10 holder container workflows', () => {
  it('generates, downloads exactly once, and registers the public key through TxDrawer', async () => {
    const setLocal = vi.spyOn(Storage.prototype, 'setItem');
    renderRoute();
    await screen.findByRole('heading', { name: 'Keystore setup' });
    const passphrase = screen.getByLabelText('New keystore passphrase');
    fireEvent.change(passphrase, { target: { value: 'test-only-setup-passphrase' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate keystore' }));

    await screen.findByRole('button', { name: 'Download .sigilkey keystore' });
    expect((screen.getByLabelText('New keystore passphrase') as HTMLInputElement).value).toBe('');
    expect(document.body.innerHTML).not.toContain('test-only-setup-passphrase');
    fireEvent.click(screen.getByRole('button', { name: 'Download .sigilkey keystore' }));
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledOnce();
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Download .sigilkey keystore' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate keystore' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Register public key' }));
    await screen.findByText('Key registered');
    expect(mocks.methods.setEncryptionKey).toHaveBeenCalledWith(
      `0x04${'ab'.repeat(64)}`,
    );
    expect(mocks.tx.startTx).toHaveBeenCalledWith('Register holder encryption key');
    expect(mocks.tx.setTxAwaitingSignature).toHaveBeenCalledOnce();
    expect(mocks.tx.setTxPending).toHaveBeenCalledWith(mocks.txResponse.hash);
    expect(mocks.tx.setTxConfirmed).toHaveBeenCalledWith(mocks.txResponse.hash);
    expect(setLocal).not.toHaveBeenCalled();
    expect(apiFetch.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  });

  it('verifies a decrypted share only after matching the on-chain commitment, commits randomness, and submits the share once', async () => {
    mocks.chain.encryptionKey = mocks.crypto.pubKey.slice();
    const localSet = vi.spyOn(localStorage, 'setItem');
    const sessionSet = vi.spyOn(sessionStorage, 'setItem');
    const { rerender } = renderRoute();
    await screen.findByRole('heading', { name: 'Regional Physics Examination' });

    await selectAndUnlockShare();
    await screen.findByText(/Share decrypted in memory/);
    expect(screen.queryByText('Share verified', { exact: true })).not.toBeInTheDocument();
    expect((screen.getByLabelText('Keystore passphrase') as HTMLInputElement).value).toBe('');
    expect(mocks.api.fetch).not.toHaveBeenCalled();
    expect(apiFetch.mock.calls.some(([url]) => String(url).endsWith('/api/exams/7/shares/me'))).toBe(true);
    expect(document.body.innerHTML).not.toContain('TEST_PRIVATE_KEY');
    expect(document.body.innerHTML).not.toContain('TEST_PLAINTEXT_SHARE');

    fireEvent.click(screen.getByRole('button', { name: 'Commit randomness' }));
    await waitFor(() => expect(mocks.methods.commitRandomness).toHaveBeenCalled());
    await screen.findByText('The decrypted share matches the current on-chain commitment.');
    expect(mocks.methods.commitRandomness).toHaveBeenCalledWith(
      7n,
      mocks.crypto.shareCommitment,
      mocks.crypto.randomnessCommitment,
    );
    expect(mocks.tx.startTx).toHaveBeenCalledWith('Commit holder randomness');
    expect(mocks.tx.setTxConfirmed).toHaveBeenCalledWith(mocks.txResponse.hash);
    expect(document.body.innerHTML).not.toContain(mocks.crypto.reveal);
    expect(document.body.innerHTML).not.toContain('TEST_PRIVATE_KEY');
    expect(document.body.innerHTML).not.toContain('TEST_PLAINTEXT_SHARE');

    mocks.exams.exams = [{ ...mocks.exams.exams[0]!, state: 2 }];
    rerender(createRoute());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit share and reveal' })).toBeEnabled());
    const expectedShare = mocks.crypto.decryptedShare.slice();
    fireEvent.click(screen.getByRole('button', { name: 'Submit share and reveal' }));
    await screen.findByText(/In-memory share and key references were cleared/);
    expect(mocks.methods.submitShare).toHaveBeenCalledWith(
      7n,
      mocks.crypto.decryptedShare,
      mocks.crypto.reveal,
    );
    expect(mocks.chain.submittedShare).toEqual(expectedShare);
    expect(mocks.crypto.decryptedShare.every((byte) => byte === 0)).toBe(true);
    expect(mocks.crypto.lastHolderKey?.privateKeyJwk.d).toBeUndefined();
    expect(document.body.innerHTML).not.toContain('TEST_PRIVATE_KEY');
    expect(document.body.innerHTML).not.toContain('TEST_PLAINTEXT_SHARE');
    expect(document.body.innerHTML).not.toContain('test-only-release-passphrase');
    expect(localSet).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
    expect(apiFetch.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  });

  it.each([
    ['wrong passphrase', new DOMException('decrypt failed', 'OperationError'), 'passphrase is incorrect'],
    ['corrupted keystore', new Error('Invalid keystore JSON'), 'keystore file is corrupted'],
  ])('clears the passphrase and reports %s safely', async (_label, error, expected) => {
    mocks.chain.encryptionKey = mocks.crypto.pubKey.slice();
    mocks.crypto.unlockError = error;
    renderRoute();
    await screen.findByRole('heading', { name: 'Regional Physics Examination' });
    await selectAndUnlockShare();
    await screen.findByText(new RegExp(expected, 'i'));
    expect((screen.getByLabelText('Keystore passphrase') as HTMLInputElement).value).toBe('');
    expect(document.body.innerHTML).not.toContain('test-only-release-passphrase');
    expect(document.body.innerHTML).not.toContain('TEST_PRIVATE_KEY');
    expect(document.body.innerHTML).not.toContain('TEST_PLAINTEXT_SHARE');
  });

  it('rejects a decrypted share when its calculated commitment differs from the chain', async () => {
    mocks.chain.encryptionKey = mocks.crypto.pubKey.slice();
    mocks.chain.shareCommitment = `0x${'9'.repeat(64)}`;
    renderRoute();
    await screen.findByRole('heading', { name: 'Regional Physics Examination' });
    await selectAndUnlockShare();
    await screen.findByText(/Share mismatch: the decrypted share does not match the on-chain commitment/);
    expect(screen.queryByText('Share verified', { exact: true })).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('TEST_PRIVATE_KEY');
    expect(document.body.innerHTML).not.toContain('TEST_PLAINTEXT_SHARE');
  });

  it.each([
    ['TooEarly', 'The release window has not opened at chain time (TooEarly).'],
    ['InvalidShare', 'The submitted share was rejected by the contract (InvalidShare).'],
    ['AlreadySubmitted', 'This holder has already submitted a share for this exam (AlreadySubmitted).'],
    ['TooLate', 'The release window has closed at chain time (TooLate).'],
    ['NotAssigned', 'This wallet is not assigned as a holder for this exam (NotAssigned).'],
  ])('maps contract rejection %s to a clear message', async (name, expected) => {
    const { holderContractMessage } = await import('../src/pages/holder/key-holder');
    expect(holderContractMessage(name)).toBe(expected);
  });

  it.each([
    ['TooEarly', 'The release window has not opened at chain time (TooEarly).'],
    ['InvalidShare', 'The submitted share was rejected by the contract (InvalidShare).'],
    ['AlreadySubmitted', 'This holder has already submitted a share for this exam (AlreadySubmitted).'],
    ['TooLate', 'The release window has closed at chain time (TooLate).'],
    ['NotAssigned', 'This wallet is not assigned as a holder for this exam (NotAssigned).'],
  ])('decodes an on-chain %s rejection into a retryable message', async (name, expected) => {
    mocks.chain.encryptionKey = mocks.crypto.pubKey.slice();
    mocks.chain.shareCommitment = mocks.crypto.shareCommitment;
    mocks.chain.randomnessCommitted = true;
    mocks.chain.submitError = { name, message: 'mock contract rejection' };
    mocks.exams.exams = [{ ...mocks.exams.exams[0]!, state: 2 }];
    mocks.crypto.decryptedShare = new TextEncoder().encode('TEST_PLAINTEXT_SHARE');
    renderRoute();
    await screen.findByRole('heading', { name: 'Regional Physics Examination' });
    await selectAndUnlockShare();
    await screen.findByText('The decrypted share matches the current on-chain commitment.');
    fireEvent.click(screen.getByRole('button', { name: 'Submit share and reveal' }));
    await screen.findByText(expected);
    expect(mocks.methods.submitShare).toHaveBeenCalledOnce();
    expect(mocks.tx.setActiveTx).toHaveBeenCalledWith({
      status: 'failed',
      title: 'Submit share and reveal',
      errorMessage: expected,
    });
    expect(document.body.innerHTML).not.toContain('TEST_PRIVATE_KEY');
    expect(document.body.innerHTML).not.toContain('TEST_PLAINTEXT_SHARE');
  });
});
