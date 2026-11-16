import { useAuth, SystemRole } from './AuthContext';

export type GuardState = 'connect-wallet' | 'wrong-network' | 'sign-in' | 'no-role' | 'authorized';

export interface AuthGuardResult {
  isAuthorized: boolean;
  guardState: GuardState;
  account: string | null;
  chainId: string | null;
  roles: SystemRole[];
  error: string | null;
}

export function useAuthGuard(requiredRoles?: SystemRole[]): AuthGuardResult {
  const { account, chainId, isNetworkCorrect, isAuthenticated, roles, error } = useAuth();

  // 1. Check if wallet is connected
  if (!account) {
    return {
      isAuthorized: false,
      guardState: 'connect-wallet',
      account: null,
      chainId,
      roles: [],
      error,
    };
  }

  // 2. Check if network is correct
  if (!isNetworkCorrect) {
    return {
      isAuthorized: false,
      guardState: 'wrong-network',
      account,
      chainId,
      roles,
      error,
    };
  }

  // 3. Check if SIWE session authenticated
  if (!isAuthenticated) {
    return {
      isAuthorized: false,
      guardState: 'sign-in',
      account,
      chainId,
      roles,
      error,
    };
  }

  // 4. Check role requirement
  if (roles.length === 0) {
    return {
      isAuthorized: false,
      guardState: 'no-role',
      account,
      chainId,
      roles,
      error,
    };
  }

  if (requiredRoles && requiredRoles.length > 0) {
    const hasRequiredRole = requiredRoles.some((r) => roles.includes(r));
    if (!hasRequiredRole) {
      return {
        isAuthorized: false,
        guardState: 'no-role',
        account,
        chainId,
        roles,
        error: `Required role (${requiredRoles.join(' or ')}) not held by this account.`,
      };
    }
  }

  // Authorized
  return {
    isAuthorized: true,
    guardState: 'authorized',
    account,
    chainId,
    roles,
    error: null,
  };
}
