import React, { useState } from 'react';
import {
  LedgerTable,
  Column,
  Button,
  Field,
  Select,
  Dialog,
  Coupon,
  HashChip,
  EmptyState,
} from '@sigil/ui';
import { ethers } from 'ethers';
import { PARTICIPANT_ROLES, ParticipantRecord, ParticipantRole } from './types';

export interface ParticipantsViewProps {
  participants: ParticipantRecord[];
  isLoading?: boolean;
  error?: Error | string | null;
  permissionDenied?: boolean;
  roleFilter: ParticipantRole | 'ALL';
  onRoleFilterChange: (role: ParticipantRole | 'ALL') => void;
  onRegister: (input: { address: string; role: ParticipantRole; profileHash?: string | null }) => Promise<void>;
  onRevoke: (input: { address: string; role: ParticipantRole }) => Promise<void>;
  isRegistering?: boolean;
  isRevoking?: boolean;
  onRetry?: () => void;
}

export function validateAddress(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Ethereum address is required.';
  }
  if (!ethers.isAddress(trimmed)) {
    return 'Invalid Ethereum address format (must be 40 hex characters with 0x prefix).';
  }
  if (trimmed.toLowerCase() === ethers.ZeroAddress.toLowerCase()) {
    return 'Zero address (0x000...000) cannot be registered as a participant.';
  }
  return null;
}

export function validateProfileHash(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null; // Optional
  if (!/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    return 'Profile hash must be a 32-byte hex string (64 characters with 0x prefix).';
  }
  return null;
}

export const ParticipantsView: React.FC<ParticipantsViewProps> = ({
  participants,
  isLoading = false,
  error = null,
  permissionDenied = false,
  roleFilter,
  onRoleFilterChange,
  onRegister,
  onRevoke,
  isRegistering = false,
  isRevoking = false,
  onRetry,
}) => {
  // Modal states
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<{ record: ParticipantRecord; role: ParticipantRole } | null>(null);

  // Form states
  const [formAddress, setFormAddress] = useState('');
  const [formRole, setFormRole] = useState<ParticipantRole>('AUTHORITY');
  const [formProfileHash, setFormProfileHash] = useState('');
  const [addressError, setAddressError] = useState<string | null>(null);
  const [hashError, setHashError] = useState<string | null>(null);

  // Filter participants
  const filteredParticipants = React.useMemo(() => {
    if (roleFilter === 'ALL') return participants;
    return participants.filter((p) => p.roles.includes(roleFilter));
  }, [participants, roleFilter]);

  const handleOpenRegister = () => {
    setFormAddress('');
    setFormRole('AUTHORITY');
    setFormProfileHash('');
    setAddressError(null);
    setHashError(null);
    setIsRegisterOpen(true);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const addrErr = validateAddress(formAddress);
    const hErr = validateProfileHash(formProfileHash);

    setAddressError(addrErr);
    setHashError(hErr);

    if (addrErr || hErr) return;

    try {
      const checksummed = ethers.getAddress(formAddress.trim());
      await onRegister({
        address: checksummed,
        role: formRole,
        profileHash: formProfileHash.trim() || null,
      });
      setIsRegisterOpen(false);
    } catch {
      // Error handled by container / TxDrawer
    }
  };

  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await onRevoke({
        address: revokeTarget.record.address,
        role: revokeTarget.role,
      });
      setRevokeTarget(null);
    } catch {
      // Error handled by container / TxDrawer
    }
  };

  // Table column configuration
  const columns: Column<ParticipantRecord>[] = [
    {
      key: 'address',
      header: 'Account',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <HashChip hash={row.address} leadLength={6} tailLength={4} />
            {row.displayName && (
              <span style={{ fontWeight: 600, color: 'var(--sigil-color-ink)', fontSize: '13px' }}>
                {row.displayName}
              </span>
            )}
          </div>
          {row.organisation && (
            <span style={{ fontSize: '11px', color: 'var(--sigil-color-slate)' }}>
              {row.organisation}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'Assigned Roles',
      render: (row) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {row.roles.map((r) => (
            <span
              key={r}
              style={{
                display: 'inline-block',
                padding: '2px 8px',
                fontSize: '11px',
                fontFamily: 'var(--sigil-font-mono)',
                borderRadius: '2px',
                border: '1px solid var(--sigil-color-hairline)',
                backgroundColor: 'var(--sigil-color-sheet)',
                color: 'var(--sigil-color-ink)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {r}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'profileHash',
      header: 'Profile Hash',
      render: (row) =>
        row.profileHash && row.profileHash !== ethers.ZeroHash ? (
          <HashChip hash={row.profileHash} leadLength={6} tailLength={4} />
        ) : (
          <span style={{ color: 'var(--sigil-color-slate)', fontSize: '12px' }}>—</span>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="participants-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
          {row.roles.map((r) => (
            <Button
              key={r}
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                setRevokeTarget({ record: row, role: r });
              }}
              style={{ fontSize: '11px', padding: '3px 8px', height: '24px' }}
            >
              Revoke {r}
            </Button>
          ))}
        </div>
      ),
    },
  ];

  // 1. Permission Denied State
  if (permissionDenied) {
    return (
      <div className="sigil-page-container" style={{ padding: '32px 0' }}>
        <div
          style={{
            border: '2px solid var(--sigil-color-alert)',
            backgroundColor: 'var(--sigil-color-sheet)',
            padding: '32px',
            maxWidth: '640px',
            margin: '0 auto',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: '18px', color: 'var(--sigil-color-alert)', marginBottom: '8px' }}>
            Access restricted: Administrator role required
          </h2>
          <p style={{ color: 'var(--sigil-color-slate)', fontSize: '14px', lineHeight: 1.5, margin: 0 }}>
            The participant registry requires the Administrator (ADMIN) role. Switch to an authorized administrator account or contact the system deployment authority.
          </p>
        </div>
      </div>
    );
  }

  // 2. Loading Skeleton State
  if (isLoading && participants.length === 0) {
    return (
      <div className="sigil-page-container participants-page-container--loading" style={{ padding: '32px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--sigil-color-ink)' }}>
              Participant registry
            </h1>
            <p style={{ color: 'var(--sigil-color-slate)', fontSize: '13px', margin: 0 }}>
              Loading on-chain participants...
            </p>
          </div>
        </div>
        <div
          data-testid="participants-loading-skeleton"
          style={{
            border: '1px solid var(--sigil-color-hairline)',
            backgroundColor: 'var(--sigil-color-sheet)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ height: '36px', backgroundColor: 'var(--sigil-color-mist)', width: '100%', opacity: 0.6 }} />
          <div style={{ height: '48px', backgroundColor: 'var(--sigil-color-mist)', width: '100%', opacity: 0.4 }} />
          <div style={{ height: '48px', backgroundColor: 'var(--sigil-color-mist)', width: '100%', opacity: 0.4 }} />
          <div style={{ height: '48px', backgroundColor: 'var(--sigil-color-mist)', width: '100%', opacity: 0.4 }} />
        </div>
      </div>
    );
  }

  // 3. Error State
  if (error && participants.length === 0) {
    const errorText = typeof error === 'string' ? error : error?.message || 'Failed to load participants';
    return (
      <div className="sigil-page-container" style={{ padding: '32px 0' }}>
        <div
          style={{
            border: '1px solid var(--sigil-color-alert)',
            backgroundColor: 'var(--sigil-color-sheet)',
            padding: '24px',
            maxWidth: '600px',
            margin: '0 auto',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: '16px', color: 'var(--sigil-color-alert)', margin: '0 0 8px 0' }}>
            Unable to load participant registry
          </h2>
          <p style={{ color: 'var(--sigil-color-slate)', fontSize: '13px', margin: '0 0 16px 0' }}>
            {errorText}
          </p>
          {onRetry && (
            <Button variant="primary" onClick={onRetry}>
              Retry connection
            </Button>
          )}
        </div>
      </div>
    );
  }

  // 4. Main Page View
  return (
    <div className="sigil-page-container" style={{ padding: '32px 0', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Page Header */}
      <div className="participants-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--sigil-color-ink)' }}>
            Participant registry
          </h1>
          <p style={{ color: 'var(--sigil-color-slate)', fontSize: '13px', margin: 0 }}>
            Manage examination panel accounts and on-chain role assignments.
          </p>
        </div>
        <Button variant="primary" onClick={handleOpenRegister}>
          Register participant
        </Button>
      </div>

      {/* Role Filter Bar */}
      <div
        className="participants-role-filter"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          alignItems: 'center',
          marginBottom: '16px',
          borderBottom: '1px solid var(--sigil-color-hairline)',
          paddingBottom: '12px',
        }}
      >
        <span style={{ fontSize: '12px', color: 'var(--sigil-color-slate)', fontWeight: 600 }}>
          Filter by role:
        </span>
        {(['ALL', ...PARTICIPANT_ROLES] as (ParticipantRole | 'ALL')[]).map((r) => {
          const isActive = roleFilter === r;
          return (
            <button
              key={r}
              type="button"
              onClick={() => onRoleFilterChange(r)}
              aria-pressed={isActive}
              style={{
                border: '1px solid',
                borderColor: isActive ? 'var(--sigil-color-ink)' : 'var(--sigil-color-hairline)',
                backgroundColor: isActive ? 'var(--sigil-color-ink)' : 'var(--sigil-color-sheet)',
                color: isActive ? 'var(--sigil-color-sheet)' : 'var(--sigil-color-ink)',
                fontSize: '11px',
                fontFamily: 'var(--sigil-font-mono)',
                padding: '4px 10px',
                borderRadius: '3px',
                cursor: 'pointer',
                fontWeight: isActive ? 600 : 400,
              }}
            >
              {r === 'ALL' ? 'All roles' : r}
            </button>
          );
        })}
      </div>

      {error && participants.length > 0 && (
        <p role="alert" style={{ color: 'var(--sigil-color-alert)', margin: '0 0 16px' }}>
          Participant data may be out of date: {typeof error === 'string' ? error : error.message}
        </p>
      )}

      {/* EmptyState is reserved for an actually empty participant registry. */}
      {participants.length === 0 ? (
        <EmptyState
          title="No participants registered"
          description="Register examiners, key holders, and examination centres to begin setting up exams."
          action={
            <Button variant="primary" onClick={handleOpenRegister}>
              Register participant
            </Button>
          }
        />
      ) : filteredParticipants.length === 0 ? (
        <div role="status" style={{ borderTop: '1px solid var(--sigil-color-hairline)', padding: '20px 0' }}>
          <p style={{ margin: '0 0 12px', color: 'var(--sigil-color-slate)' }}>
            No participants match the {roleFilter} role filter.
          </p>
          <Button variant="secondary" onClick={() => onRoleFilterChange('ALL')}>
            Clear role filter
          </Button>
        </div>
      ) : (
        <LedgerTable
          caption="Registered participants and their active roles"
          columns={columns}
          data={filteredParticipants}
          keyField={(row) => row.address}
        />
      )}

      {/* Register Participant Dialog */}
      <Dialog
        open={isRegisterOpen}
        onOpenChange={setIsRegisterOpen}
        title="Register participant"
        description="Assign an Ethereum address to an on-chain examination role. This action writes to the ledger."
      >
        <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Field
            label="Ethereum account address"
            placeholder="0x..."
            value={formAddress}
            onChange={(e) => {
              setFormAddress(e.target.value);
              if (addressError) setAddressError(validateAddress(e.target.value));
            }}
            onBlur={() => setAddressError(validateAddress(formAddress))}
            error={addressError ?? undefined}
            mono
            disabled={isRegistering}
          />

          <Select
            label="Assigned role"
            value={formRole}
            onValueChange={(val) => setFormRole(val as ParticipantRole)}
            options={PARTICIPANT_ROLES.map((role) => ({
              value: role,
              label: role.charAt(0) + role.slice(1).toLowerCase(),
            }))}
            disabled={isRegistering}
          />

          <Field
            label="Profile metadata hash (optional)"
            description="32-byte hex hash of the off-chain participant profile (leave empty for zero hash)"
            placeholder="0x0000000000000000000000000000000000000000000000000000000000000000"
            value={formProfileHash}
            onChange={(e) => {
              setFormProfileHash(e.target.value);
              if (hashError) setHashError(validateProfileHash(e.target.value));
            }}
            onBlur={() => setHashError(validateProfileHash(formProfileHash))}
            error={hashError ?? undefined}
            mono
            disabled={isRegistering}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <Button variant="secondary" onClick={() => setIsRegisterOpen(false)} disabled={isRegistering} type="button">
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isRegistering}>
              {isRegistering ? 'Registering...' : 'Sign & register'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Revoke Confirmation Coupon Dialog */}
      <Dialog
        open={Boolean(revokeTarget)}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title="Revoke participant role"
      >
        {revokeTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Coupon
              title={`Revoke ${revokeTarget.role} role (permanent)`}
              consequence={`This removes ${revokeTarget.role} authorization for account ${revokeTarget.record.address.slice(0, 8)}...${revokeTarget.record.address.slice(-6)} on the blockchain. Key holders assigned to active exams cannot be revoked.`}
              actionLabel={isRevoking ? 'Revoking...' : 'Confirm revocation'}
              variant="alert"
              isReady={!isRevoking}
              onAction={handleConfirmRevoke}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setRevokeTarget(null)} disabled={isRevoking}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};
