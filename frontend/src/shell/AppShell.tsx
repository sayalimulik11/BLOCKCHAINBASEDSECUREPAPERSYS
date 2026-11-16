import React, { createContext, useContext, useState } from 'react';
import { TopBar } from './TopBar';
import { useAuth, SystemRole } from '../auth/AuthContext';
import { useAuthGuard } from '../auth/useAuthGuard';
import {
  ConnectWalletGuard,
  SignInGuard,
  WrongNetworkGuard,
  NoRoleGuard,
} from '../components/guards/GuardScreens';
import { TxDrawer, TxStatus } from '@sigil/ui';

export interface ActiveTxState {
  status: TxStatus;
  title?: string;
  txHash?: string;
  blockConfirmations?: number;
  requiredConfirmations?: number;
  errorMessage?: string;
}

interface TxContextType {
  activeTx: ActiveTxState | null;
  setActiveTx: (tx: ActiveTxState | null) => void;
  startTx: (title: string) => void;
  setTxAwaitingSignature: () => void;
  setTxPending: (txHash: string) => void;
  setTxConfirmed: (txHash: string) => void;
  setTxFailed: (error: string) => void;
  clearTx: () => void;
}

const TxContext = createContext<TxContextType | null>(null);

export const useTransaction = () => {
  const ctx = useContext(TxContext);
  if (!ctx) {
    throw new Error('useTransaction must be used within AppShell');
  }
  return ctx;
};

export interface AppShellProps {
  children: React.ReactNode;
  requiredRoles?: SystemRole[];
  requireAuth?: boolean;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  requiredRoles,
  requireAuth = false,
}) => {
  const {
    connectWallet,
    switchNetwork,
    loginSIWE,
    logout,
    isConnecting,
    isLoggingIn,
    error,
    incrementPendingTx,
    decrementPendingTx,
  } = useAuth();

  const guard = useAuthGuard(requiredRoles);

  const [activeTx, setActiveTx] = useState<ActiveTxState | null>(null);

  const startTx = (title: string) => {
    setActiveTx({ status: 'preparing', title });
  };

  const setTxAwaitingSignature = () => {
    setActiveTx((prev) => ({
      status: 'awaiting-signature',
      title: prev?.title || 'Transaction in progress',
    }));
  };

  const setTxPending = (txHash: string) => {
    incrementPendingTx();
    setActiveTx((prev) => ({
      status: 'pending',
      title: prev?.title || 'Transaction in progress',
      txHash,
      blockConfirmations: 0,
      requiredConfirmations: 1,
    }));
  };

  const setTxConfirmed = (txHash: string) => {
    decrementPendingTx();
    setActiveTx((prev) => ({
      status: 'confirmed',
      title: prev?.title || 'Transaction confirmed',
      txHash,
      blockConfirmations: 1,
      requiredConfirmations: 1,
    }));
  };

  const setTxFailed = (errorMessage: string) => {
    decrementPendingTx();
    setActiveTx((prev) => ({
      status: 'failed',
      title: prev?.title || 'Transaction failed',
      txHash: prev?.txHash,
      errorMessage,
    }));
  };

  const clearTx = () => {
    setActiveTx(null);
  };

  const renderContent = () => {
    if (!requireAuth && (!requiredRoles || requiredRoles.length === 0)) {
      return children;
    }

    switch (guard.guardState) {
      case 'connect-wallet':
        return (
          <ConnectWalletGuard
            onConnect={() => void connectWallet()}
            isConnecting={isConnecting}
            error={error}
          />
        );
      case 'wrong-network':
        return (
          <WrongNetworkGuard
            currentChainId={guard.chainId}
            onSwitchNetwork={() => void switchNetwork()}
          />
        );
      case 'sign-in':
        return (
          <SignInGuard
            account={guard.account!}
            onSignIn={() => void loginSIWE()}
            isLoggingIn={isLoggingIn}
            error={error}
          />
        );
      case 'no-role':
        return (
          <NoRoleGuard
            account={guard.account!}
            onDisconnect={() => void logout()}
          />
        );
      case 'authorized':
      default:
        return children;
    }
  };

  return (
    <TxContext.Provider
      value={{
        activeTx,
        setActiveTx,
        startTx,
        setTxAwaitingSignature,
        setTxPending,
        setTxConfirmed,
        setTxFailed,
        clearTx,
      }}
    >
      <div className="sigil-shell-container">
        <TopBar />
        <main className="sigil-main-content">
          {renderContent()}
        </main>
        {activeTx && (
          <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 120, width: '400px', maxWidth: '90vw' }}>
            <TxDrawer
              status={activeTx.status}
              title={activeTx.title}
              txHash={activeTx.txHash}
              blockConfirmations={activeTx.blockConfirmations}
              requiredConfirmations={activeTx.requiredConfirmations}
              errorMessage={activeTx.errorMessage}
              onClose={clearTx}
            />
          </div>
        )}
      </div>
    </TxContext.Provider>
  );
};
