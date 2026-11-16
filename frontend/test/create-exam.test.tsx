import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreateExamView } from '../src/pages/create-exam/CreateExamView';
import { timestampInputValue } from '../src/pages/create-exam/validation';
import type { ExamWizardContext } from '../src/pages/create-exam/types';

const now = 1_800_000_000;
const holderAddresses = [
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
];
const setterAddress = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';
const centreAddress = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';

const context: ExamWizardContext = {
  participants: [
    ...holderAddresses.map((address) => ({ address, roles: ['HOLDER'] })),
    { address: setterAddress, roles: ['SETTER'] },
    { address: centreAddress, roles: ['CENTRE'] },
  ],
  encryptionKeys: Object.fromEntries(holderAddresses.map((address) => [address.toLowerCase(), true])),
  chainTime: now,
  minLeadSeconds: 60,
};

function renderWizard(props: Partial<React.ComponentProps<typeof CreateExamView>> = {}) {
  return render(
    <CreateExamView
      pageState="ready"
      context={context}
      onCreate={vi.fn()}
      {...props}
    />,
  );
}

describe('FA-06a: Create Exam wizard', () => {
  it('renders loading, empty, error, and permission-denied page states', () => {
    const { rerender } = renderWizard({ pageState: 'loading' });
    expect(screen.getByLabelText('Loading exam setup')).toBeInTheDocument();

    rerender(<CreateExamView pageState="empty" context={context} onCreate={vi.fn()} />);
    expect(screen.getByText('No registered participants')).toBeInTheDocument();

    const onRetry = vi.fn();
    rerender(
      <CreateExamView pageState="error" error={new Error('RPC unavailable')} retry={onRetry} context={context} onCreate={vi.fn()} />,
    );
    expect(screen.getByText('RPC unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry connection/i }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender(<CreateExamView pageState="permission" context={context} onCreate={vi.fn()} />);
    expect(screen.getByText('Exam Authority role required')).toBeInTheDocument();
  });

  it('shows all six steps and validates on blur', () => {
    renderWizard();
    for (const step of [
      'Details',
      'Sections and quotas',
      'Schedule',
      'Panel and threshold',
      'Setters and centres',
      'Review and sign',
    ]) {
      expect(screen.getByRole('button', { name: step })).toBeInTheDocument();
    }

    fireEvent.blur(screen.getByLabelText('Exam title'));
    expect(screen.getByRole('alert')).toHaveTextContent(/>=5/);
  });

  it('shows holder key status and the square-notch threshold meter', () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Panel and threshold' }));
    holderAddresses.forEach((address, index) => {
      fireEvent.change(screen.getByLabelText(`Key holder ${index + 1} address`), {
        target: { value: address },
      });
    });
    expect(screen.getAllByText('Key registered')).toHaveLength(3);
    expect(screen.getByRole('progressbar', { name: 'Key-holder threshold' })).toBeInTheDocument();
  });

  it('completes the six-step flow and submits validated API metadata plus contract config', () => {
    const onCreate = vi.fn();
    renderWizard({ onCreate });

    fireEvent.change(screen.getByLabelText('Exam title'), {
      target: { value: 'Regional Physics Examination' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.change(screen.getByLabelText('Section 1 name'), { target: { value: 'Physics' } });
    fireEvent.change(screen.getByLabelText('Section 1 question quota'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.change(screen.getByLabelText('Release window opens'), {
      target: { value: timestampInputValue(now + 3_600) },
    });
    fireEvent.change(screen.getByLabelText('Exam starts'), {
      target: { value: timestampInputValue(now + 7_200) },
    });
    fireEvent.change(screen.getByLabelText('Exam ends'), {
      target: { value: timestampInputValue(now + 14_400) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    holderAddresses.forEach((address, index) => {
      fireEvent.change(screen.getByLabelText(`Key holder ${index + 1} address`), {
        target: { value: address },
      });
    });
    fireEvent.change(screen.getByLabelText('Share threshold'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.change(screen.getByLabelText('Paper setter 1 address'), {
      target: { value: setterAddress },
    });
    fireEvent.change(screen.getByLabelText('Examination centre 1 address'), {
      target: { value: centreAddress },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText(/Canonical metadata hash/)).toBeInTheDocument();
    expect(screen.getByText(/^0x[0-9a-f]{64}$/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create exam' }));

    expect(onCreate).toHaveBeenCalledOnce();
    expect(onCreate.mock.calls[0]?.[0]).toMatchObject({
      title: 'Regional Physics Examination',
      sections: [{ name: 'Physics', quota: 45 }],
    });
    expect(onCreate.mock.calls[0]?.[1]).toMatchObject({
      threshold: 2,
      holders: holderAddresses,
      setters: [setterAddress],
      centres: [centreAddress],
      quotas: [45],
    });
  });

  it('offers metadata retry after on-chain creation without allowing a duplicate create', () => {
    renderWizard({
      createdExamId: '7',
      metadataError: 'Exam No. 0007 was created on-chain, but metadata storage failed.',
      onRetryMetadata: vi.fn(),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review and sign' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/metadata storage failed/i);
    expect(screen.getByRole('button', { name: 'Create exam' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Retry metadata storage' })).toBeInTheDocument();
  });
});
