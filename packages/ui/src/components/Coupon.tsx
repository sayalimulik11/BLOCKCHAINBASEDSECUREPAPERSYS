import React from 'react';
import { Button } from './Button';

export interface CouponProps {
  title: string;
  consequence: string;
  actionLabel: string;
  onAction?: () => void;
  isReady?: boolean;
  disabledReason?: string;
  variant?: 'primary' | 'alert';
  className?: string;
  children?: React.ReactNode;
}

export const Coupon: React.FC<CouponProps> = ({
  title,
  consequence,
  actionLabel,
  onAction,
  isReady = true,
  disabledReason,
  variant = 'primary',
  className = '',
  children,
}) => {
  return (
    <div className={`sigil-coupon ${className}`.trim()}>
      <div className="sigil-coupon__header">
        <h3 className="sigil-coupon__title">{title}</h3>
      </div>
      <p className="sigil-coupon__consequence">{consequence}</p>
      {children}
      <div>
        <Button
          variant={variant}
          disabled={!isReady}
          onClick={onAction}
          aria-describedby={!isReady && disabledReason ? 'coupon-disabled-reason' : undefined}
        >
          {actionLabel}
        </Button>
        {!isReady && disabledReason && (
          <div id="coupon-disabled-reason" className="sigil-coupon__reason">
            {disabledReason}
          </div>
        )}
      </div>
    </div>
  );
};
