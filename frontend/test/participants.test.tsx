import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  ParticipantsView,
  validateAddress,
  validateProfileHash,
} from '../src/pages/participants/ParticipantsView';
import { ParticipantRecord } from '../src/pages/participants/types';
import { decodeContractError } from '../src/utils/errors';

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  value: vi.fn(),
});

describe('FA-05: Admin Participants Component Tests', () => {
  const sampleParticipants: ParticipantRecord[] = [
    {
      address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      roles: ['AUTHORITY'],
      displayName: 'Dr. Evelyn Vance',
      organisation: 'Examination Board',
      profileHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
    },
    {
      address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      roles: ['SETTER'],
      displayName: 'Prof. Marcus Brody',
      organisation: 'Physics Department',
      profileHash: null,
    },
    {
      address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
      roles: ['HOLDER'],
      displayName: 'Custodian Alistair',
      organisation: 'Security Vault Alpha',
      profileHash: null,
    },
  ];

  it('renders loading skeleton state', () => {
    render(
      <ParticipantsView
        participants={[]}
        isLoading={true}
        roleFilter="ALL"
        onRoleFilterChange={() => {}}
        onRegister={async () => {}}
        onRevoke={async () => {}}
      />
    );
    expect(screen.getByTestId('participants-loading-skeleton')).toBeInTheDocument();
  });

  it('renders empty state when no participants exist', () => {
    render(
      <ParticipantsView
        participants={[]}
        isLoading={false}
        roleFilter="ALL"
        onRoleFilterChange={() => {}}
        onRegister={async () => {}}
        onRevoke={async () => {}}
      />
    );
    expect(screen.getByText('No participants registered')).toBeInTheDocument();
    expect(
      screen.getByText('Register examiners, key holders, and examination centres to begin setting up exams.')
    ).toBeInTheDocument();
  });

  it('renders error state with retry button', () => {
    const retryFn = vi.fn();
    render(
      <ParticipantsView
        participants={[]}
        isLoading={false}
        error={new Error('Network connection dropped')}
        onRetry={retryFn}
        roleFilter="ALL"
        onRoleFilterChange={() => {}}
        onRegister={async () => {}}
        onRevoke={async () => {}}
      />
    );
    expect(screen.getByText('Unable to load participant registry')).toBeInTheDocument();
    expect(screen.getByText('Network connection dropped')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /retry connection/i });
    fireEvent.click(retryBtn);
    expect(retryFn).toHaveBeenCalledOnce();
  });

  it('renders permission-denied state when user lacks admin role', () => {
    render(
      <ParticipantsView
        participants={sampleParticipants}
        permissionDenied={true}
        roleFilter="ALL"
        onRoleFilterChange={() => {}}
        onRegister={async () => {}}
        onRevoke={async () => {}}
      />
    );
    expect(screen.getByText('Access restricted: Administrator role required')).toBeInTheDocument();
    expect(screen.queryByText('Dr. Evelyn Vance')).not.toBeInTheDocument();
  });

  it('filters participants by role', () => {
    const onFilterChange = vi.fn();
    const { rerender } = render(
      <ParticipantsView
        participants={sampleParticipants}
        roleFilter="ALL"
        onRoleFilterChange={onFilterChange}
        onRegister={async () => {}}
        onRevoke={async () => {}}
      />
    );

    expect(screen.getByText('Dr. Evelyn Vance')).toBeInTheDocument();
    expect(screen.getByText('Prof. Marcus Brody')).toBeInTheDocument();
    expect(screen.getByText('Custodian Alistair')).toBeInTheDocument();

    // Trigger role filter click
    const setterFilterBtn = screen.getByRole('button', { name: /^setter$/i });
    fireEvent.click(setterFilterBtn);
    expect(onFilterChange).toHaveBeenCalledWith('SETTER');

    // Rerender with SETTER filter active
    rerender(
      <ParticipantsView
        participants={sampleParticipants}
        roleFilter="SETTER"
        onRoleFilterChange={onFilterChange}
        onRegister={async () => {}}
        onRevoke={async () => {}}
      />
    );
    expect(screen.queryByText('Dr. Evelyn Vance')).not.toBeInTheDocument();
    expect(screen.getByText('Prof. Marcus Brody')).toBeInTheDocument();
    expect(screen.queryByText('Custodian Alistair')).not.toBeInTheDocument();
  });

  it('does not present a truly empty registry when a role filter has no matches', () => {
    render(
      <ParticipantsView
        participants={sampleParticipants}
        roleFilter="CENTRE"
        onRoleFilterChange={() => {}}
        onRegister={async () => {}}
        onRevoke={async () => {}}
      />
    );

    expect(screen.getByText('No participants match the CENTRE role filter.')).toBeInTheDocument();
    expect(screen.queryByText('No participants registered')).not.toBeInTheDocument();
  });

  describe('Address Validation per Section 11', () => {
    it('rejects empty address', () => {
      expect(validateAddress('')).toBe('Ethereum address is required.');
      expect(validateAddress('   ')).toBe('Ethereum address is required.');
    });

    it('rejects malformed address', () => {
      expect(validateAddress('0xinvalid')).toContain('Invalid Ethereum address format');
      expect(validateAddress('12345')).toContain('Invalid Ethereum address format');
      expect(validateAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C')).toContain('Invalid Ethereum address format');
    });

    it('rejects zero address', () => {
      expect(validateAddress('0x0000000000000000000000000000000000000000')).toContain(
        'Zero address (0x000...000) cannot be registered'
      );
    });

    it('accepts valid checksummed Ethereum address', () => {
      expect(validateAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')).toBeNull();
      expect(validateAddress('0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC')).toBeNull();
    });

    it('validates 32-byte hex profile hash', () => {
      expect(validateProfileHash('')).toBeNull(); // optional
      expect(validateProfileHash('0x123')).toContain('must be a 32-byte hex string');
      expect(
        validateProfileHash('0x1111111111111111111111111111111111111111111111111111111111111111')
      ).toBeNull();
    });
  });

  it('handles register participant modal and submission', async () => {
    const registerFn = vi.fn().mockResolvedValue(undefined);
    render(
      <ParticipantsView
        participants={sampleParticipants}
        roleFilter="ALL"
        onRoleFilterChange={() => {}}
        onRegister={registerFn}
        onRevoke={async () => {}}
      />
    );

    // Open register dialog
    const openBtn = screen.getByRole('button', { name: /register participant/i });
    fireEvent.click(openBtn);

    expect(screen.getByText(/Assign an Ethereum address to an on-chain examination role/)).toBeInTheDocument();

    // Fill valid address
    const addressInput = screen.getByLabelText(/ethereum account address/i);
    fireEvent.change(addressInput, { target: { value: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65' } });
    fireEvent.keyDown(screen.getByRole('combobox', { name: /assigned role/i }), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: 'Holder' }));
    fireEvent.change(screen.getByLabelText(/profile metadata hash/i), {
      target: { value: `0x${'a'.repeat(64)}` },
    });

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: /sign & register/i }));

    await waitFor(() => {
      expect(registerFn).toHaveBeenCalledWith({
        address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
        role: 'HOLDER',
        profileHash: `0x${'a'.repeat(64)}`,
      });
    });
  });

  it('shows inline address validation on blur and blocks an invalid registration', async () => {
    const registerFn = vi.fn().mockResolvedValue(undefined);
    render(
      <ParticipantsView
        participants={sampleParticipants}
        roleFilter="ALL"
        onRoleFilterChange={() => {}}
        onRegister={registerFn}
        onRevoke={async () => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /register participant/i }));
    const addressInput = screen.getByLabelText(/ethereum account address/i);
    fireEvent.change(addressInput, { target: { value: '0xinvalid' } });
    fireEvent.blur(addressInput);
    expect(screen.getByText(/Invalid Ethereum address format/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /sign & register/i }));
    expect(registerFn).not.toHaveBeenCalled();
  });

  it('handles revoke confirmation Coupon dialog', async () => {
    const revokeFn = vi.fn().mockResolvedValue(undefined);
    render(
      <ParticipantsView
        participants={sampleParticipants}
        roleFilter="ALL"
        onRoleFilterChange={() => {}}
        onRegister={async () => {}}
        onRevoke={revokeFn}
      />
    );

    // Click revoke on Evelyn Vance (AUTHORITY)
    const revokeBtn = screen.getByRole('button', { name: /revoke authority/i });
    fireEvent.click(revokeBtn);

    // Coupon appears with title containing (permanent) and warning
    expect(screen.getByText('Revoke AUTHORITY role (permanent)')).toBeInTheDocument();
    expect(
      screen.getByText(/Key holders assigned to active exams cannot be revoked/i)
    ).toBeInTheDocument();

    // Confirm revocation
    const confirmBtn = screen.getByRole('button', { name: /confirm revocation/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(revokeFn).toHaveBeenCalledWith({
        address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        role: 'AUTHORITY',
      });
    });
  });

  it('maps HolderInLiveExam contract error through FA-08 decoder', () => {
    // Contract revert error HolderInLiveExam()
    const rawError = 'execution reverted: HolderInLiveExam()';
    const decoded = decodeContractError(rawError);

    expect(decoded.name).toBe('HolderInLiveExam');
    expect(decoded.message).toBe('This key holder is currently participating in an active exam.');
    expect(decoded.action).toBe('Conclude or cancel live exams before revoking roles or updating keys.');
    expect(decoded.message).not.toContain('HolderInLiveExam');
    expect(decoded.message).not.toMatch(/0x[0-9a-fA-F]+/i);
  });
});
