import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  ConnectWalletGuard,
  SignInGuard,
  WrongNetworkGuard,
  NoRoleGuard,
} from '../src/components/guards/GuardScreens';
import { TopBar } from '../src/shell/TopBar';
import * as AuthContextModule from '../src/auth/AuthContext';
import { useAuthGuard } from '../src/auth/useAuthGuard';

// Helper component to test useAuthGuard
function TestAuthGuardComponent({ requiredRoles }: { requiredRoles?: AuthContextModule.SystemRole[] }) {
  const guard = useAuthGuard(requiredRoles);
  return (
    <div data-testid="guard-result">
      <span data-testid="guard-state">{guard.guardState}</span>
      <span data-testid="is-authorized">{String(guard.isAuthorized)}</span>
    </div>
  );
}

describe('FA-04: Guard Screens & Auth Guard Tests', () => {
  it('renders ConnectWalletGuard and invokes onConnect', () => {
    const handleConnect = vi.fn();
    render(<ConnectWalletGuard onConnect={handleConnect} isConnecting={false} />);

    expect(screen.getByText('Connect your wallet')).toBeDefined();
    expect(screen.getByText('Connect MetaMask wallet')).toBeDefined();

    fireEvent.click(screen.getByText('Connect MetaMask wallet'));
    expect(handleConnect).toHaveBeenCalledTimes(1);
  });

  it('renders SignInGuard with address and invokes onSignIn', () => {
    const handleSignIn = vi.fn();
    const testAccount = '0x1234567890abcdef1234567890abcdef12345678';
    render(<SignInGuard account={testAccount} onSignIn={handleSignIn} isLoggingIn={false} />);

    expect(screen.getByText('Sign in with Ethereum')).toBeDefined();
    expect(screen.getByText('Sign-In With Ethereum')).toBeDefined();

    fireEvent.click(screen.getByText('Sign-In With Ethereum'));
    expect(handleSignIn).toHaveBeenCalledTimes(1);
  });

  it('renders WrongNetworkGuard with alert border and switch action', () => {
    const handleSwitch = vi.fn();
    render(<WrongNetworkGuard currentChainId="0x1" onSwitchNetwork={handleSwitch} />);

    expect(screen.getByText('Wrong network detected')).toBeDefined();
    const switchBtn = screen.getByText('Switch to authorized network');
    expect(switchBtn).toBeDefined();

    fireEvent.click(switchBtn);
    expect(handleSwitch).toHaveBeenCalledTimes(1);
  });

  it('renders NoRoleGuard with instructions to contact Admin', () => {
    const handleDisconnect = vi.fn();
    const testAccount = '0x9999999999999999999999999999999999999999';
    render(<NoRoleGuard account={testAccount} onDisconnect={handleDisconnect} />);

    expect(screen.getByText('No authorized role assigned')).toBeDefined();
    expect(screen.getByText(/contact the System Administrator/i)).toBeDefined();

    fireEvent.click(screen.getByText('Disconnect session'));
    expect(handleDisconnect).toHaveBeenCalledTimes(1);
  });

  describe('useAuthGuard lifecycle states', () => {
    const mockUseAuth = vi.spyOn(AuthContextModule, 'useAuth');

    it('returns connect-wallet when account is null', () => {
      mockUseAuth.mockReturnValue({
        account: null,
        chainId: '0x7a69',
        isNetworkCorrect: true,
        isAuthenticated: false,
        roles: [],
        chainTime: 1730000000,
        pendingTxCount: 0,
        isConnecting: false,
        isLoggingIn: false,
        error: null,
        connectWallet: vi.fn(),
        switchNetwork: vi.fn(),
        loginSIWE: vi.fn(),
        logout: vi.fn(),
        incrementPendingTx: vi.fn(),
        decrementPendingTx: vi.fn(),
      });

      render(<TestAuthGuardComponent />);
      expect(screen.getByTestId('guard-state').textContent).toBe('connect-wallet');
      expect(screen.getByTestId('is-authorized').textContent).toBe('false');
    });

    it('returns wrong-network when network is incorrect', () => {
      mockUseAuth.mockReturnValue({
        account: '0x123',
        chainId: '0x1',
        isNetworkCorrect: false,
        isAuthenticated: false,
        roles: [],
        chainTime: null,
        pendingTxCount: 0,
        isConnecting: false,
        isLoggingIn: false,
        error: null,
        connectWallet: vi.fn(),
        switchNetwork: vi.fn(),
        loginSIWE: vi.fn(),
        logout: vi.fn(),
        incrementPendingTx: vi.fn(),
        decrementPendingTx: vi.fn(),
      });

      render(<TestAuthGuardComponent />);
      expect(screen.getByTestId('guard-state').textContent).toBe('wrong-network');
      expect(screen.getByTestId('is-authorized').textContent).toBe('false');
    });

    it('returns sign-in when wallet connected on correct network but not SIWE authenticated', () => {
      mockUseAuth.mockReturnValue({
        account: '0x123',
        chainId: '0x7a69',
        isNetworkCorrect: true,
        isAuthenticated: false,
        roles: [],
        chainTime: 1730000000,
        pendingTxCount: 0,
        isConnecting: false,
        isLoggingIn: false,
        error: null,
        connectWallet: vi.fn(),
        switchNetwork: vi.fn(),
        loginSIWE: vi.fn(),
        logout: vi.fn(),
        incrementPendingTx: vi.fn(),
        decrementPendingTx: vi.fn(),
      });

      render(<TestAuthGuardComponent />);
      expect(screen.getByTestId('guard-state').textContent).toBe('sign-in');
      expect(screen.getByTestId('is-authorized').textContent).toBe('false');
    });

    it('returns no-role when authenticated but has no roles', () => {
      mockUseAuth.mockReturnValue({
        account: '0x123',
        chainId: '0x7a69',
        isNetworkCorrect: true,
        isAuthenticated: true,
        roles: [],
        chainTime: 1730000000,
        pendingTxCount: 0,
        isConnecting: false,
        isLoggingIn: false,
        error: null,
        connectWallet: vi.fn(),
        switchNetwork: vi.fn(),
        loginSIWE: vi.fn(),
        logout: vi.fn(),
        incrementPendingTx: vi.fn(),
        decrementPendingTx: vi.fn(),
      });

      render(<TestAuthGuardComponent />);
      expect(screen.getByTestId('guard-state').textContent).toBe('no-role');
      expect(screen.getByTestId('is-authorized').textContent).toBe('false');
    });

    it('returns authorized when all conditions and required role match', () => {
      mockUseAuth.mockReturnValue({
        account: '0x123',
        chainId: '0x7a69',
        isNetworkCorrect: true,
        isAuthenticated: true,
        roles: ['AUTHORITY'],
        chainTime: 1730000000,
        pendingTxCount: 0,
        isConnecting: false,
        isLoggingIn: false,
        error: null,
        connectWallet: vi.fn(),
        switchNetwork: vi.fn(),
        loginSIWE: vi.fn(),
        logout: vi.fn(),
        incrementPendingTx: vi.fn(),
        decrementPendingTx: vi.fn(),
      });

      render(<TestAuthGuardComponent requiredRoles={['AUTHORITY']} />);
      expect(screen.getByTestId('guard-state').textContent).toBe('authorized');
      expect(screen.getByTestId('is-authorized').textContent).toBe('true');
    });
  });

  describe('Role-aware TopBar navigation', () => {
    const mockUseAuth = vi.spyOn(AuthContextModule, 'useAuth');

    it('renders Admin navigation links when role is ADMIN', () => {
      mockUseAuth.mockReturnValue({
        account: '0xAdminAddress12345678901234567890123456',
        chainId: '0x7a69',
        isNetworkCorrect: true,
        isAuthenticated: true,
        roles: ['ADMIN'],
        chainTime: 1730000000,
        pendingTxCount: 0,
        isConnecting: false,
        isLoggingIn: false,
        error: null,
        connectWallet: vi.fn(),
        switchNetwork: vi.fn(),
        loginSIWE: vi.fn(),
        logout: vi.fn(),
        incrementPendingTx: vi.fn(),
        decrementPendingTx: vi.fn(),
      });

      render(
        <MemoryRouter>
          <TopBar />
        </MemoryRouter>
      );

      expect(screen.getByText('Participants')).toBeDefined();
      expect(screen.getByText('Audit log')).toBeDefined();
    });

    it('renders Authority navigation links when role is AUTHORITY', () => {
      mockUseAuth.mockReturnValue({
        account: '0xAuthority123456789012345678901234567890',
        chainId: '0x7a69',
        isNetworkCorrect: true,
        isAuthenticated: true,
        roles: ['AUTHORITY'],
        chainTime: 1730000000,
        pendingTxCount: 0,
        isConnecting: false,
        isLoggingIn: false,
        error: null,
        connectWallet: vi.fn(),
        switchNetwork: vi.fn(),
        loginSIWE: vi.fn(),
        logout: vi.fn(),
        incrementPendingTx: vi.fn(),
        decrementPendingTx: vi.fn(),
      });

      render(
        <MemoryRouter>
          <TopBar />
        </MemoryRouter>
      );

      expect(screen.getByText('Docket')).toBeDefined();
      expect(screen.getByText('Create exam')).toBeDefined();
      expect(screen.getByText('Key ceremony')).toBeDefined();
      expect(screen.getByText('Audit log')).toBeDefined();
    });
  });
});
