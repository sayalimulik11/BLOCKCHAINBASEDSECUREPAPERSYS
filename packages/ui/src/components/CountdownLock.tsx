import React, { useEffect, useState } from 'react';

export interface CountdownLockProps {
  targetTimestamp: number; // Unix timestamp in seconds or ms
  currentTimestamp?: number; // Optional chain timestamp
  label?: string;
  onTargetReached?: () => void;
  className?: string;
}

export const CountdownLock: React.FC<CountdownLockProps> = ({
  targetTimestamp,
  currentTimestamp,
  label = 'Release window opens in',
  onTargetReached,
  className = '',
}) => {
  // Normalize target to seconds
  const targetSec = targetTimestamp > 1e11 ? Math.floor(targetTimestamp / 1000) : targetTimestamp;

  const [remaining, setRemaining] = useState<number>(() => {
    const nowSec = currentTimestamp
      ? (currentTimestamp > 1e11 ? Math.floor(currentTimestamp / 1000) : currentTimestamp)
      : Math.floor(Date.now() / 1000);
    return Math.max(0, targetSec - nowSec);
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const nowSec = currentTimestamp
        ? (currentTimestamp > 1e11 ? Math.floor(currentTimestamp / 1000) : currentTimestamp)
        : Math.floor(Date.now() / 1000);
      const diff = Math.max(0, targetSec - nowSec);
      setRemaining(diff);
      if (diff === 0 && onTargetReached) {
        onTargetReached();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetSec, currentTimestamp, onTargetReached]);

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <div
      className={`sigil-countdown-lock ${className}`.trim()}
      role="timer"
      aria-label={`${label} ${formattedTime}`}
    >
      <div className="sigil-countdown-lock__square" aria-hidden="true" />
      <div>
        {label && <div className="sigil-countdown-lock__label">{label}</div>}
        <div className="sigil-countdown-lock__time">{formattedTime}</div>
      </div>
    </div>
  );
};
