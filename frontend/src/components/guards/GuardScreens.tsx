import React from 'react';
import { Button, HashChip } from '@sigil/ui';

export interface ConnectWalletGuardProps {
  onConnect: () => void;
  isConnecting?: boolean;
  error?: string | null;
}

export const ConnectWalletGuard: React.FC<ConnectWalletGuardProps> = ({
  onConnect,
  isConnecting,
  error,
}) => {
  return (
    <div className="sigil-guard-screen" data-testid="guard-connect-wallet">
      <div className="sigil-guard-card">
        <span className="sigil-guard-mark">S</span>
        <h2 className="sigil-guard-title">Connect your wallet</h2>
        <p className="sigil-guard-desc">
          Connect an authorized Web3 wallet (such as MetaMask) to authenticate against the SIGIL examination custody ledger.
        </p>
        <Button
          variant="primary"
          size="lg"
          onClick={onConnect}
          disabled={isConnecting}
        >
          {isConnecting ? 'Connecting wallet...' : 'Connect MetaMask wallet'}
        </Button>
        {error && <div className="sigil-guard-error">{error}</div>}
      </div>
    </div>
  );
};

export interface SignInGuardProps {
  account: string;
  onSignIn: () => void;
  isLoggingIn?: boolean;
  error?: string | null;
}

export const SignInGuard: React.FC<SignInGuardProps> = ({
  account,
  onSignIn,
  isLoggingIn,
  error,
}) => {
  return (
    <div className="sigil-guard-screen" data-testid="guard-sign-in">
      <div className="sigil-guard-card">
        <span className="sigil-guard-mark">SIWE</span>
        <h2 className="sigil-guard-title">Sign in with Ethereum</h2>
        <p className="sigil-guard-desc">
          Prove control of your address by signing an EIP-4361 cryptographic message. This establishes an authenticated custody session.
        </p>
        <div style={{ marginBottom: '16px' }}>
          <span style={{ fontSize: '13px', color: 'var(--sigil-color-slate)', marginRight: '8px' }}>
            Connected account:
          </span>
          <HashChip hash={account} />
        </div>
        <Button
          variant="primary"
          size="lg"
          onClick={onSignIn}
          disabled={isLoggingIn}
        >
          {isLoggingIn ? 'Awaiting signature...' : 'Sign-In With Ethereum'}
        </Button>
        {error && <div className="sigil-guard-error">{error}</div>}
      </div>
    </div>
  );
};

export interface WrongNetworkGuardProps {
  currentChainId?: string | null;
  onSwitchNetwork: () => void;
}

export const WrongNetworkGuard: React.FC<WrongNetworkGuardProps> = ({
  currentChainId,
  onSwitchNetwork,
}) => {
  return (
    <div className="sigil-guard-screen" data-testid="guard-wrong-network">
      <div className="sigil-guard-card sigil-guard-card--alert">
        <span className="sigil-guard-mark sigil-guard-mark--alert">!</span>
        <h2 className="sigil-guard-title" style={{ color: 'var(--sigil-color-alert)' }}>
          Wrong network detected
        </h2>
        <p className="sigil-guard-desc">
          Your wallet is currently connected to an unsupported chain ({currentChainId || 'unknown'}). SIGIL requires the local development network (Chain ID: 31337).
        </p>
        <Button variant="alert" size="lg" onClick={onSwitchNetwork}>
          Switch to authorized network
        </Button>
      </div>
    </div>
  );
};

export interface NoRoleGuardProps {
  account: string;
  onDisconnect?: () => void;
}

export const NoRoleGuard: React.FC<NoRoleGuardProps> = ({
  account,
  onDisconnect,
}) => {
  return (
    <div className="sigil-guard-screen" data-testid="guard-no-role">
      <div className="sigil-guard-card">
        <span className="sigil-guard-mark">∅</span>
        <h2 className="sigil-guard-title">No authorized role assigned</h2>
        <p className="sigil-guard-desc">
          Your wallet is authenticated, but this address holds no active permissions in the ExamVault smart contract participant registry.
        </p>
        <div style={{ margin: '8px 0 16px 0' }}>
          <span style={{ fontSize: '13px', color: 'var(--sigil-color-slate)', marginRight: '8px' }}>
            Unregistered address:
          </span>
          <HashChip hash={account} />
        </div>
        <p style={{ fontSize: '13px', color: 'var(--sigil-color-slate)', marginBottom: '16px' }}>
          Please contact the System Administrator to register your address for an assigned role (Authority, Setter, Key holder, Centre, or Auditor).
        </p>
        {onDisconnect && (
          <Button variant="secondary" size="md" onClick={onDisconnect}>
            Disconnect session
          </Button>
        )}
      </div>
    </div>
  );
};
