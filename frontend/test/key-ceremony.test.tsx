import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KeyCeremonyView } from '../src/pages/key-ceremony/KeyCeremonyView';
import { runCeremonyWorkflow } from '../src/pages/key-ceremony/workflow';
import type { PreparedCeremony } from '../src/pages/key-ceremony/workflow';

const holders = [
  { address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', keyRegistered: true },
  { address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', keyRegistered: true },
  { address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906', keyRegistered: true },
];
const prepared: PreparedCeremony = {
  examPublicKey: new Uint8Array(65),
  encryptedShares: holders.map(({ address }) => ({ holder: address, envelope: new Uint8Array([1, 2, 3]) })),
};

function renderCeremony(props: Partial<React.ComponentProps<typeof KeyCeremonyView>> = {}) {
  return render(
    <KeyCeremonyView
      pageState="ready"
      examId="7"
      threshold={2}
      holders={holders}
      stepStatuses={Array.from({ length: 6 }, () => 'pending')}
      onRun={vi.fn()}
      {...props}
    />,
  );
}

describe('FA-06b: Key Ceremony', () => {
  it('renders loading, empty, error, and permission-denied page states', () => {
    const { rerender } = renderCeremony({ pageState: 'loading' });
    expect(screen.getByLabelText('Loading key ceremony')).toBeInTheDocument();

    rerender(
      <KeyCeremonyView
        pageState="empty"
        examId="7"
        threshold={2}
        holders={[]}
        stepStatuses={[]}
        onRun={vi.fn()}
      />,
    );
    expect(screen.getByText('Examination not found')).toBeInTheDocument();

    const retryRead = vi.fn();
    rerender(
      <KeyCeremonyView
        pageState="error"
        error={new Error('Exam query failed')}
        retryRead={retryRead}
        examId="7"
        threshold={2}
        holders={[]}
        stepStatuses={[]}
        onRun={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /retry connection/i }));
    expect(retryRead).toHaveBeenCalledOnce();

    rerender(
      <KeyCeremonyView
        pageState="permission"
        examId="7"
        threshold={2}
        holders={[]}
        stepStatuses={[]}
        onRun={vi.fn()}
      />,
    );
    expect(screen.getByText('Exam Authority role required')).toBeInTheDocument();
  });

  it('shows the required browser-only privacy statement and blocks until all keys are registered', () => {
    const missingKey = holders.map((holder, index) => ({
      ...holder,
      keyRegistered: index !== 1,
    }));
    renderCeremony({ holders: missingKey });

    expect(screen.getByText('This runs in your browser. The exam private key is never sent or stored.')).toBeInTheDocument();
    expect(screen.getByText('Every assigned holder must have a registered encryption key.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open collection' })).toBeDisabled();
  });

  it('displays the six ceremony phases and enables Open collection when prerequisites are met', () => {
    renderCeremony();
    for (const label of [
      'Generate exam keypair',
      'Split into 3 shares with threshold 2',
      'Encrypt shares to each holder',
      'Upload encrypted shares',
      'Open collection on-chain',
      'Wipe private key',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Open collection' })).toBeEnabled();
  });

  it('runs the core, upload, and on-chain steps in order', async () => {
    const events: string[] = [];
    const progress: Array<[number, string]> = [];
    await runCeremonyWorkflow({
      prepare: async () => {
        events.push('core');
        return prepared;
      },
      upload: async () => {
        events.push('upload');
      },
      openCollection: async () => {
        events.push('open');
      },
      onPrepared: () => undefined,
      onUploaded: () => undefined,
      onStep: (index, status) => progress.push([index, status]),
    });

    expect(events).toEqual(['core', 'upload', 'open']);
    expect(progress).toEqual([
      [0, 'active'],
      [0, 'complete'],
      [1, 'complete'],
      [2, 'complete'],
      [3, 'active'],
      [3, 'complete'],
      [4, 'active'],
      [4, 'complete'],
      [5, 'pending'],
    ]);
  });

  it('retries a failed core step without exposing key material', async () => {
    const privateKeySentinel = 'private-key-must-never-be-rendered';
    const onPrepared = vi.fn();
    const prepare = vi.fn()
      .mockRejectedValueOnce(new Error('WebCrypto unavailable'))
      .mockResolvedValueOnce(prepared);
    const upload = vi.fn().mockResolvedValue(undefined);
    const openCollection = vi.fn().mockResolvedValue(undefined);
    const common = {
      prepare,
      upload,
      openCollection,
      onPrepared,
      onUploaded: vi.fn(),
      onStep: vi.fn(),
    };

    await expect(runCeremonyWorkflow(common)).rejects.toThrow('WebCrypto unavailable');
    await runCeremonyWorkflow(common);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(onPrepared).toHaveBeenCalledWith(prepared);

    renderCeremony({
      isComplete: true,
      stepStatuses: ['complete', 'complete', 'complete', 'complete', 'complete', 'pending'],
    });
    expect(document.body).not.toHaveTextContent(privateKeySentinel);
    expect(screen.getByText(/does not confirm that its internal secret buffers were wiped/i)).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('retries upload without regenerating the exam key and skips upload after it succeeds', async () => {
    const onPrepared = vi.fn();
    const onUploaded = vi.fn();
    const prepare = vi.fn().mockResolvedValue(prepared);
    const upload = vi.fn()
      .mockRejectedValueOnce(new Error('Upload unavailable'))
      .mockResolvedValue(undefined);
    const openCollection = vi.fn()
      .mockRejectedValueOnce(new Error('Wallet rejected'))
      .mockResolvedValue(undefined);
    const common = {
      prepare,
      upload,
      openCollection,
      onPrepared,
      onUploaded,
      onStep: vi.fn(),
    };

    await expect(runCeremonyWorkflow(common)).rejects.toThrow('Upload unavailable');
    expect(onPrepared).toHaveBeenCalledOnce();
    expect(onUploaded).not.toHaveBeenCalled();

    await expect(
      runCeremonyWorkflow({ ...common, prepared, uploaded: false }),
    ).rejects.toThrow('Wallet rejected');
    expect(prepare).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledTimes(2);
    expect(onUploaded).toHaveBeenCalledOnce();

    await runCeremonyWorkflow({ ...common, prepared, uploaded: true });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(openCollection).toHaveBeenCalledTimes(2);
  });

  it('keeps the coupon dimmed with a visible contract-state reason', () => {
    renderCeremony({ disabledReason: 'The exam is not in Draft state.' });
    expect(screen.getByText('The exam is not in Draft state.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open collection' })).toBeDisabled();
  });
});
