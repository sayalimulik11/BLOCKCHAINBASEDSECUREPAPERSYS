import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { HashChip, Button } from '@sigil/ui';

export const TopBar: React.FC = () => {
  const {
    account,
    chainId,
    isNetworkCorrect,
    isAuthenticated,
    roles,
    chainTime,
    pendingTxCount,
    logout,
    connectWallet,
  } = useAuth();

  const location = useLocation();

  const formatChainTime = (timestampSec: number | null): string => {
    if (!timestampSec) return '--:--:--';
    const date = new Date(timestampSec * 1000);
    return date.toTimeString().split(' ')[0] ?? '--:--:--';
  };

  const navLinks = React.useMemo(() => {
    const links: { label: string; to: string }[] = [];

    if (roles.includes('ADMIN')) {
      links.push({ label: 'Participants', to: '/admin/participants' });
      links.push({ label: 'Audit log', to: '/audit' });
    }

    if (roles.includes('AUTHORITY')) {
      links.push({ label: 'Docket', to: '/authority/docket' });
      links.push({ label: 'Create exam', to: '/authority/create' });
      links.push({ label: 'Key ceremony', to: '/authority/ceremony' });
      links.push({ label: 'Audit log', to: '/audit' });
    }

    if (roles.includes('SETTER')) {
      links.push({ label: 'Question composer', to: '/setter/assignments' });
    }

    if (roles.includes('HOLDER')) {
      links.push({ label: 'Key holder console', to: '/holder/console' });
    }

    if (roles.includes('CENTRE')) {
      links.push({ label: 'Centre station', to: '/centre/station' });
    }

    if (roles.includes('AUDITOR')) {
      links.push({ label: 'Leak tracer', to: '/auditor/tracer' });
      links.push({ label: 'Audit log', to: '/audit' });
    }

    // Always provide link to the Component gallery
    links.push({ label: 'Component gallery', to: '/dev/gallery' });
    return links;
  }, [roles]);

  return (
    <header className="sigil-topbar" role="banner">
      <div className="sigil-topbar__left">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>SIGIL</span>
        </Link>

        <nav className="sigil-topbar__nav" aria-label="Main navigation">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`sigil-topbar__nav-link ${isActive ? 'sigil-topbar__nav-link--active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="sigil-topbar__right">
        {/* Role & Address Chip */}
        {account && (
          <div className="sigil-topbar__chip" title="Active role and wallet address">
            <span className="sigil-topbar__chip-label">
              {roles.length > 0 ? roles.join(', ') : 'No Role'}:
            </span>
            <HashChip hash={account} leadLength={6} tailLength={4} />
          </div>
        )}

        {/* Network Chip */}
        <div
          className={`sigil-topbar__chip ${
            !isNetworkCorrect && account ? 'sigil-topbar__chip--alert' : ''
          }`}
          title="Connected blockchain network"
        >
          <span className="sigil-mono" style={{ fontSize: '11px' }}>
            {chainId
              ? isNetworkCorrect
                ? `Chain: Hardhat (${parseInt(chainId, 16)})`
                : `Chain: ${chainId} (Wrong)`
              : 'Network: Disconnected'}
          </span>
        </div>

        {/* Chain Time Chip */}
        <div className="sigil-topbar__chip" title="Current block timestamp from chain">
          <span className="sigil-mono" style={{ fontSize: '11px' }}>
            Chain: {formatChainTime(chainTime)}
          </span>
        </div>

        {/* Pending Tx Count Chip */}
        <div className="sigil-topbar__chip" title="Pending blockchain transactions">
          <span className="sigil-mono" style={{ fontSize: '11px' }}>
            {pendingTxCount} pending tx
          </span>
        </div>

        {/* Connect / Logout Action */}
        {isAuthenticated ? (
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            Sign out
          </Button>
        ) : account ? (
          <Button variant="secondary" size="sm" onClick={() => void connectWallet()}>
            Wallet connected
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={() => void connectWallet()}>
            Connect wallet
          </Button>
        )}
      </div>
    </header>
  );
};
