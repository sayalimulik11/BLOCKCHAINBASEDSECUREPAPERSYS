import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommandCentreView } from '../src/pages/command-centre/CommandCentreView';
import {
  concludeDisabledReason,
  examStateFromChain,
  sealDisabledReason,
  selectRosetteHash,
} from '../src/pages/command-centre/logic';
import type {
  CommandCentreExam,
  CommandCentreReadinessRow,
  SectionQuestionCount,
} from '../src/pages/command-centre/types';

const metaHash = `0x${'1'.repeat(64)}`;
const bankHash = `0x${'2'.repeat(64)}`;
const exam: CommandCentreExam = {
  examId: '7',
  title: 'Regional Physics Examination',
  state: 'Collecting',
  metaHash,
  bankHash: null,
  rosetteHash: metaHash,
  releaseOpensAt: 1_800_000_000,
  examStartsAt: 1_800_003_600,
  examEndsAt: 1_800_010_800,
  threshold: 2,
  holderCount: 3,
};

const rows: CommandCentreReadinessRow[] = [
  {
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    role: 'Holder',
    keyRegistered: 'complete',
    shareVerified: 'not-tracked',
    randomnessCommitted: 'complete',
    batchesSubmitted: 'not-applicable',
    batchCount: null,
  },
  {
    address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    role: 'Setter',
    keyRegistered: 'not-applicable',
    shareVerified: 'not-applicable',
    randomnessCommitted: 'not-applicable',
    batchesSubmitted: 'complete',
    batchCount: 4,
  },
];

const sections: SectionQuestionCount[] = [
  { name: 'Physics', quota: 45, questionCount: 45 },
];

const baseProps: React.ComponentProps<typeof CommandCentreView> = {
  pageState: 'ready',
  exam,
  countdownTarget: exam.releaseOpensAt,
  readinessRows: rows,
  sectionCounts: sections,
  sealDisabledReason: null,
  concludeDisabledReason: 'Conclude exam is available only after the exam is released.',
  actionError: null,
  onSeal: vi.fn(),
  onConclude: vi.fn(),
  onCancel: vi.fn(),
};

function renderCommandCentre(
  overrides: Partial<React.ComponentProps<typeof CommandCentreView>> = {},
) {
  return render(<CommandCentreView {...baseProps} {...overrides} />);
}

describe('FA-07: Exam command centre', () => {
  it('renders loading, empty, error, and permission-denied page states', () => {
    const { rerender } = renderCommandCentre({ pageState: 'loading' });
    expect(screen.getByLabelText('Loading exam command centre')).toBeInTheDocument();

    rerender(<CommandCentreView {...baseProps} pageState="empty" />);
    expect(screen.getByText('Examination not found')).toBeInTheDocument();

    const onRetry = vi.fn();
    rerender(
      <CommandCentreView
        {...baseProps}
        pageState="error"
        error={new Error('Contract read failed')}
        onRetry={onRetry}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender(<CommandCentreView {...baseProps} pageState="permission" />);
    expect(screen.getByText('Exam Authority role required')).toBeInTheDocument();
  });

  it('shows every custody state from the on-chain state map', () => {
    const states = ['Draft', 'Collecting', 'Sealed', 'Released', 'Concluded', 'Cancelled'] as const;
    const { rerender } = renderCommandCentre();

    states.forEach((state, index) => {
      rerender(
        <CommandCentreView
          {...baseProps}
          exam={{ ...exam, state }}
          sealDisabledReason="Seal exam is available only while collection is open."
        />,
      );
      expect(screen.getByRole('progressbar', { name: `Exam custody state: ${state}` })).toBeInTheDocument();
        expect(screen.getByRole('status', { name: `Exam status: ${state}` })).toBeInTheDocument();
      expect(examStateFromChain(index)).toBe(state);
    });
    expect(examStateFromChain(6)).toBeNull();
  });

  it('uses the metadata hash before sealing and bank hash after sealing', () => {
    expect(selectRosetteHash('Draft', metaHash, bankHash)).toBe(metaHash);
    expect(selectRosetteHash('Collecting', metaHash, bankHash)).toBe(metaHash);
    expect(selectRosetteHash('Sealed', metaHash, bankHash)).toBe(bankHash);
    expect(selectRosetteHash('Released', metaHash, bankHash)).toBe(bankHash);
    expect(selectRosetteHash('Concluded', metaHash, bankHash)).toBe(bankHash);
    expect(selectRosetteHash('Cancelled', metaHash, bankHash)).toBe(bankHash);
    expect(selectRosetteHash('Cancelled', metaHash, `0x${'0'.repeat(64)}`)).toBe(metaHash);
  });

  it('explains each seal blocker, including exact section quota counts', () => {
    expect(sealDisabledReason('Draft', sections, true))
      .toBe('Seal exam is available only while collection is open.');
    expect(sealDisabledReason(
      'Collecting',
      [{ name: 'Physics', quota: 45, questionCount: 38 }],
      true,
    )).toBe('Seal needs 45 Physics questions; the bank has 38.');
    expect(sealDisabledReason(
      'Collecting',
      [{ name: 'Physics', quota: 45, questionCount: 46 }],
      true,
    )).toBe('Seal needs exactly 45 Physics questions; the bank has 46.');
    expect(sealDisabledReason('Collecting', sections, false))
      .toBe('Seal needs randomness commitments from every key holder.');
    expect(sealDisabledReason('Collecting', sections, true)).toBeNull();
  });

  it('shows each blocked-seal reason beside the disabled Coupon', () => {
    const { rerender } = renderCommandCentre({
      sealDisabledReason: 'Seal needs 45 Physics questions; the bank has 38.',
    });
    expect(screen.getByText('Seal needs 45 Physics questions; the bank has 38.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seal exam' })).toBeDisabled();

    rerender(
      <CommandCentreView
        {...baseProps}
        sealDisabledReason="Seal needs exactly 45 Physics questions; the bank has 46."
      />,
    );
    expect(screen.getByText('Seal needs exactly 45 Physics questions; the bank has 46.')).toBeInTheDocument();

    rerender(
      <CommandCentreView
        {...baseProps}
        sealDisabledReason="Seal needs randomness commitments from every key holder."
      />,
    );
    expect(screen.getByText('Seal needs randomness commitments from every key holder.')).toBeInTheDocument();
  });

  it('blocks conclusion until the exam is released and its scheduled end passes', () => {
    expect(concludeDisabledReason('Sealed', 2_000, 1_000))
      .toBe('Conclude exam is available only after the exam is released.');
    expect(concludeDisabledReason('Released', 999, 1_000))
      .toBe('Conclude exam is available after the exam ends at 1970-01-01 00:16 UTC.');
    expect(concludeDisabledReason('Released', 1_000, 1_000)).toBeNull();
    expect(concludeDisabledReason('Concluded', 1_000, 1_000))
      .toBe('This exam is already concluded.');
    expect(concludeDisabledReason('Cancelled', 1_000, 1_000))
      .toBe('A cancelled exam cannot be concluded.');
  });

  it('shows a bubble per readiness cell and labels untracked share verification', () => {
    const { container } = renderCommandCentre();
    expect(container.querySelectorAll('.command-centre__readiness-bubble')).toHaveLength(8);
    expect(screen.getAllByRole('img', { name: 'Complete' })).toHaveLength(3);
    expect(screen.getAllByRole('img', { name: 'Not applicable' })).toHaveLength(4);
    expect(screen.getByRole('img', { name: 'Not tracked' })).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('requires the exact displayed serial before enabling cancel', () => {
    const onCancel = vi.fn();
    renderCommandCentre({ onCancel });
    const cancelButton = screen.getByRole('button', { name: 'Cancel exam' });
    const serialField = screen.getByLabelText('Type No. 0007 to confirm cancellation');

    expect(cancelButton).toBeDisabled();
    fireEvent.change(serialField, { target: { value: '0007' } });
    expect(cancelButton).toBeDisabled();
    fireEvent.change(serialField, { target: { value: 'No. 0007' } });
    expect(cancelButton).toBeEnabled();
    fireEvent.click(cancelButton);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('keeps cancellation unavailable after the chain reports Cancelled', () => {
    renderCommandCentre({
      exam: { ...exam, state: 'Cancelled' },
    });
    expect(screen.getByText('This exam is already cancelled.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel exam' })).toBeDisabled();
  });

  it('passes ready seal and conclude actions through their Coupons', () => {
    const onSeal = vi.fn();
    const onConclude = vi.fn();
    const { rerender } = renderCommandCentre({ onSeal });
    fireEvent.click(screen.getByRole('button', { name: 'Seal exam' }));
    expect(onSeal).toHaveBeenCalledOnce();

    rerender(
      <CommandCentreView
        {...baseProps}
        exam={{ ...exam, state: 'Released' }}
        sealDisabledReason="Seal exam is available only while collection is open."
        concludeDisabledReason={null}
        onConclude={onConclude}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Conclude exam' }));
    expect(onConclude).toHaveBeenCalledOnce();
  });
});
