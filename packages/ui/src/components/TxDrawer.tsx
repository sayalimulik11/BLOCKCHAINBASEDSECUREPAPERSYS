import React from 'react';
import { HashChip } from './HashChip';
import { Button } from './Button';

export type TxStatus = 'preparing' | 'awaiting-signature' | 'pending' | 'confirmed' | 'failed';

export interface TxDrawerProps {
  status: TxStatus;
  title?: string;
  txHash?: string;
  blockConfirmations?: number;
  requiredConfirmations?: number;
  errorMessage?: string;
  onRetry?: () => void;
  onClose?: () => void;
  className?: string;
}

export const TxDrawer: React.FC<TxDrawerProps> = ({
  status,
  title,
  txHash,
  blockConfirmations = 0,
  requiredConfirmations = 1,
  errorMessage,
  onRetry,
  onClose,
  className = '',
}) => {
  const getStatusBadge = () => {
    switch (status) {
      case 'preparing':
        return (
          <span className="sigil-tx-drawer__status-badge sigil-tx-drawer__status-badge--preparing">
            Preparing transaction
          </span>
        );
      case 'awaiting-signature':
        return (
          <span className="sigil-tx-drawer__status-badge sigil-tx-drawer__status-badge--awaiting-signature">
            Awaiting wallet signature
          </span>
        );
      case 'pending':
        return (
          <span className="sigil-tx-drawer__status-badge sigil-tx-drawer__status-badge--pending">
            Pending ({blockConfirmations} / {requiredConfirmations} blocks)
          </span>
        );
      case 'confirmed':
        return (
          <span className="sigil-tx-drawer__status-badge sigil-tx-drawer__status-badge--confirmed">
            Transaction confirmed
          </span>
        );
      case 'failed':
        return (
          <span className="sigil-tx-drawer__status-badge sigil-tx-drawer__status-badge--failed">
            Transaction failed
          </span>
        );
    }
  };

  return (
    <div
      className={`sigil-tx-drawer ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label="Transaction status drawer"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0, fontSize: 'var(--sigil-font-size-base)' }}>
          {title || 'Blockchain Transaction'}
        </h4>
        {getStatusBadge()}
      </div>

      {txHash && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
          <span style={{ color: 'var(--sigil-color-slate)' }}>Tx Hash:</span>
          <HashChip hash={txHash} />
        </div>
      )}

      {status === 'failed' && errorMessage && (
        <div
          style={{
            color: 'var(--sigil-color-alert)',
            fontSize: 'var(--sigil-font-size-xs)',
            borderLeft: '2px solid var(--sigil-color-alert)',
            paddingLeft: '8px',
          }}
        >
          {errorMessage}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        {status === 'failed' && onRetry && (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Retry transaction
          </Button>
        )}
        {onClose && (
          <Button size="sm" variant="ghost" onClick={onClose}>
            Dismiss
          </Button>
        )}
      </div>
    </div>
  );
};
