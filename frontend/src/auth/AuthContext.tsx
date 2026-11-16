import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { ethers } from 'ethers';


export type SystemRole = 'ADMIN' | 'AUTHORITY' | 'SETTER' | 'HOLDER' | 'CENTRE' | 'AUDITOR';

export interface AuthContextType {
  account: string | null;
  chainId: string | null;
  isNetworkCorrect: boolean;
  isAuthenticated: boolean;
  roles: SystemRole[];
  chainTime: number | null;
  pendingTxCount: number;
  isConnecting: boolean;
  isLoggingIn: boolean;
  error: string | null;
  connectWallet: () => Promise<void>;
  switchNetwork: () => Promise<void>;
  loginSIWE: () => Promise<void>;
  logout: () => Promise<void>;
  incrementPendingTx: () => void;
  decrementPendingTx: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TARGET_CHAIN_IDS = ['0x7a69', '31337', '0x539', '1337'];
const TARGET_CHAIN_ID_HEX = '0x7a69';

const apiOrigin = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:4000';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const isGalleryRoute = pathname === '/dev/gallery';
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [roles, setRoles] = useState<SystemRole[]>([]);
  const [chainTime, setChainTime] = useState<number | null>(null);
  const [pendingTxCount, setPendingTxCount] = useState<number>(0);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isNetworkCorrect = Boolean(
    chainId && TARGET_CHAIN_IDS.includes(chainId.toLowerCase())
  );

  // Poll chain liveness and time from /api/health
  const fetchChainHealth = useCallback(async () => {
    try {
      const res = await fetch(`${apiOrigin}/api/health`);
      if (res.ok) {
        const data = await res.json();
        if (data.timestamp) {
          setChainTime(Math.floor(new Date(data.timestamp).getTime() / 1000));
        }
      }
    } catch {
      // Offline fallback: keep last known or null
    }
  }, []);

  useEffect(() => {
    if (isGalleryRoute) {
      return;
    }
    void fetchChainHealth();
    const interval = setInterval(fetchChainHealth, 10000);
    return () => clearInterval(interval);
  }, [fetchChainHealth, isGalleryRoute]);

  // Check active SIWE session with backend
  const checkCurrentSession = useCallback(async () => {
    if (isGalleryRoute) {
      setIsAuthenticated(false);
      setRoles([]);
      return;
    }
    try {
      const res = await fetch(`${apiOrigin}/api/auth/me`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setIsAuthenticated(true);
        if (data.roles && Array.isArray(data.roles)) {
          setRoles(data.roles as SystemRole[]);
        }
        if (data.address && !account) {
          setAccount(data.address);
        }
      } else {
        setIsAuthenticated(false);
        setRoles([]);
      }
    } catch {
      setIsAuthenticated(false);
      setRoles([]);
    }
  }, [account, isGalleryRoute]);

  useEffect(() => {
    if (isGalleryRoute) {
      return;
    }
    void checkCurrentSession();
  }, [checkCurrentSession, isGalleryRoute]);

  // MetaMask integration
  useEffect(() => {
    const eth = (window as any).ethereum;
    if (!eth) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts && accounts.length > 0) {
        try {
          setAccount(ethers.getAddress(accounts[0]));
        } catch {
          setError('Invalid wallet address.');
          return;
        }
        void checkCurrentSession();
      } else {
        setAccount(null);
        setIsAuthenticated(false);
        setRoles([]);
      }
    };

    const handleChainChanged = (newChainId: string) => {
      setChainId(newChainId);
    };

    eth.request({ method: 'eth_accounts' })
      .then((accs: string[]) => {
        if (accs && accs.length > 0) {
          try {
            setAccount(ethers.getAddress(accs[0]));
          } catch {
            setError('Invalid wallet address.');
          }
        }
      })
      .catch(() => {});

    eth.request({ method: 'eth_chainId' })
      .then((cId: string) => {
        setChainId(cId);
      })
      .catch(() => {});

    eth.on?.('accountsChanged', handleAccountsChanged);
    eth.on?.('chainChanged', handleChainChanged);

    return () => {
      eth.removeListener?.('accountsChanged', handleAccountsChanged);
      eth.removeListener?.('chainChanged', handleChainChanged);
    };
  }, [checkCurrentSession]);

  const connectWallet = async () => {
    const eth = (window as any).ethereum;
    if (!eth) {
      setError('MetaMask or a Web3 wallet is required to connect.');
      return;
    }
    setIsConnecting(true);
    setError(null);
    try {
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts.length > 0) {
        try {
          setAccount(ethers.getAddress(accounts[0]));
        } catch {
          setError('Invalid wallet address.');
          return;
        }
      }
      const cId = await eth.request({ method: 'eth_chainId' });
      setChainId(cId);
    } catch (err: any) {
      setError(err?.message || 'Wallet connection was refused.');
    } finally {
      setIsConnecting(false);
    }
  };

  const switchNetwork = async () => {
    const eth = (window as any).ethereum;
    if (!eth) return;
    try {
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: TARGET_CHAIN_ID_HEX }],
      });
    } catch (err: any) {
      setError('Failed to switch network in wallet.');
    }
  };

  const loginSIWE = async () => {
    const eth = (window as any).ethereum;
    if (!eth || !account) {
      setError('Connect wallet before signing in.');
      return;
    }
    setIsLoggingIn(true);
    setError(null);

    try {
      // 1. Fetch nonce
      let nonceRes: Response;
      try {
        nonceRes = await fetch(`${apiOrigin}/api/auth/nonce`, {
          credentials: 'include',
        });
      } catch {
        throw new Error('Server unreachable.');
      }
      if (!nonceRes.ok) throw new Error('Server unreachable.');
      const { nonce } = await nonceRes.json();

      // 2. Prepare SIWE message
      const domain = window.location.host;
      const origin = window.location.origin;
      const numericChainId = chainId ? parseInt(chainId, 16) : 31337;
      const issuedAt = new Date().toISOString();

      const message = `${domain} wants you to sign in with your Ethereum account:\n${account}\n\nSign in with Ethereum to the app.\n\nURI: ${origin}\nVersion: 1\nChain ID: ${numericChainId}\nNonce: ${nonce}\nIssued At: ${issuedAt}`;

      // 3. Request personal_sign from wallet
      let signature: string;
      try {
        signature = await eth.request({
          method: 'personal_sign',
          params: [message, account],
        });
      } catch (err: any) {
        if (err?.code === 4001) throw new Error('Wallet request rejected.');
        throw err;
      }

      // 4. Verify with backend
      let verifyRes: Response;
      try {
        verifyRes = await fetch(`${apiOrigin}/api/auth/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ message, signature }),
        });
      } catch {
        throw new Error('Server unreachable.');
      }

      if (!verifyRes.ok) {
        if (verifyRes.status === 429 || verifyRes.status >= 500) {
          throw new Error('Server unreachable.');
        }
        let code = '';
        try {
          const errorData = await verifyRes.json();
          code = errorData?.error?.code || '';
          if (verifyRes.status === 401 || code === 'INVALID_SIGNATURE') {
            throw new Error('Server rejected the signature.');
          }
          if (code === 'INVALID_NONCE') {
            throw new Error('Session expired.');
          }
          throw new Error('Server rejected the signature.');
        } catch (e: any) {
          if (e instanceof Error && e.message) throw e;
          throw new Error('Server rejected the signature.');
        }
      }

      const verifyData = await verifyRes.json();
      setIsAuthenticated(true);
      setRoles(verifyData.roles || []);
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg === 'Wallet request rejected.' || msg === 'Server unreachable.' || msg === 'Server rejected the signature.' || msg === 'Session expired.') {
        setError(msg);
      } else if (/fetch|network|failed to fetch/i.test(msg)) {
        setError('Server unreachable.');
      } else {
        setError(msg || 'Sign-in failed.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = async () => {
    try {
      await fetch(`${apiOrigin}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // continue clearing local state
    }
    setIsAuthenticated(false);
    setRoles([]);
  };

  const incrementPendingTx = () => setPendingTxCount((c) => c + 1);
  const decrementPendingTx = () => setPendingTxCount((c) => Math.max(0, c - 1));

  return (
    <AuthContext.Provider
      value={{
        account,
        chainId,
        isNetworkCorrect,
        isAuthenticated,
        roles,
        chainTime,
        pendingTxCount,
        isConnecting,
        isLoggingIn,
        error,
        connectWallet,
        switchNetwork,
        loginSIWE,
        logout,
        incrementPendingTx,
        decrementPendingTx,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};
