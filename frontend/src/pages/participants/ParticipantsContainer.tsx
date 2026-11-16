import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  useParticipants,
  useRegisterParticipant,
  useRevokeParticipant,
} from '../../hooks/useParticipants';
import type {
  ParticipantRegistrationInput,
  ParticipantRegistryContract,
  ParticipantRevocationInput,
  ParticipantRole,
} from '../../hooks/useParticipants';
import { useExamVaultContract } from '../../contracts/useExamVaultContract';
import { useTransaction } from '../../shell/AppShell';
import { decodeContractError } from '../../utils/errors';
import { useAuthGuard } from '../../auth/useAuthGuard';
import { ParticipantsView } from './ParticipantsView';

export const ParticipantsContainer: React.FC = () => {
  const guard = useAuthGuard(['ADMIN']);
  const contractState = useExamVaultContract();
  const rawContract = contractState.contract;
  const tx = useTransaction();
  const submittedTransactionHash = useRef<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<ParticipantRole | 'ALL'>('ALL');
  const [refreshError, setRefreshError] = useState<Error | null>(null);

  const { participants, isLoading, error, refetch } = useParticipants({ enabled: guard.isAuthorized });
  const contract = useMemo<ParticipantRegistryContract | null>(() => {
    if (!rawContract) {
      return null;
    }

    return {
      registerParticipant: async (account, role, profileHash) => {
        const response = await rawContract.getFunction('registerParticipant')(account, role, profileHash);
        submittedTransactionHash.current = response.hash;
        tx.setTxPending(response.hash);
        return response;
      },
      revokeParticipant: async (account, role) => {
        const response = await rawContract.getFunction('revokeParticipant')(account, role);
        submittedTransactionHash.current = response.hash;
        tx.setTxPending(response.hash);
        return response;
      },
    };
  }, [rawContract, tx.setTxPending]);

  const registerMutation = useRegisterParticipant({ contract });
  const revokeMutation = useRevokeParticipant({ contract });

  const refreshParticipants = useCallback(async () => {
    setRefreshError(null);
    try {
      await refetch();
    } catch (error) {
      setRefreshError(error instanceof Error ? error : new Error('Failed to refresh participant data.'));
    }
  }, [refetch]);

  const handleMutationError = (error: unknown, title: string) => {
    const decoded = decodeContractError(error);
    if (submittedTransactionHash.current) {
      tx.setTxFailed(decoded.formatted);
    } else {
      tx.setActiveTx({ status: 'failed', title, errorMessage: decoded.formatted });
    }
  };

  const handleRegister = async (input: ParticipantRegistrationInput) => {
    submittedTransactionHash.current = null;
    const title = `Registering participant as ${input.role}`;
    tx.startTx(title);
    tx.setTxAwaitingSignature();
    try {
      await registerMutation.mutate(input);
      const transactionHash = submittedTransactionHash.current;
      if (!transactionHash) {
        throw new Error('The wallet did not return a registration transaction hash.');
      }
      tx.setTxConfirmed(transactionHash);
    } catch (error) {
      handleMutationError(error, title);
      throw error;
    }
    await refreshParticipants();
  };

  const handleRevoke = async (input: ParticipantRevocationInput) => {
    submittedTransactionHash.current = null;
    const title = `Revoking ${input.role} role`;
    tx.startTx(title);
    tx.setTxAwaitingSignature();
    try {
      await revokeMutation.mutate(input);
      const transactionHash = submittedTransactionHash.current;
      if (!transactionHash) {
        throw new Error('The wallet did not return a revocation transaction hash.');
      }
      tx.setTxConfirmed(transactionHash);
    } catch (error) {
      handleMutationError(error, title);
      throw error;
    }
    await refreshParticipants();
  };

  const isPermissionDenied = guard.guardState === 'no-role';

  return (
    <ParticipantsView
      participants={participants}
      isLoading={isLoading || (guard.isAuthorized && contractState.isLoading)}
      error={error ?? refreshError ?? contractState.error}
      permissionDenied={isPermissionDenied}
      roleFilter={roleFilter}
      onRoleFilterChange={setRoleFilter}
      onRegister={handleRegister}
      onRevoke={handleRevoke}
      isRegistering={registerMutation.isPending}
      isRevoking={revokeMutation.isPending}
      onRetry={() => void refreshParticipants()}
    />
  );
};
