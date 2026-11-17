import React from 'react';

export interface ThresholdMeterProps {
  current?: number;
  threshold?: number;
  total?: number;
  className?: string;
  label?: string;
}

export const ThresholdMeter: React.FC<ThresholdMeterProps> = ({
  current,
  threshold,
  total,
  className = '',
  label,
}) => {
  const hasValidValues =
    typeof current === 'number' &&
    Number.isSafeInteger(current) &&
    current >= 0 &&
    typeof threshold === 'number' &&
    Number.isSafeInteger(threshold) &&
    threshold > 0 &&
    typeof total === 'number' &&
    Number.isSafeInteger(total) &&
    total > 0 &&
    current <= total &&
    threshold <= total;
  const notches = hasValidValues
    ? Array.from({ length: total }, (_, i) => i)
    : [];
  const accessibleLabel = hasValidValues
    ? label || `Threshold status: ${current} of ${total} shares (threshold ${threshold})`
    : label || 'Threshold status unavailable';

  return (
    <div
      className={`sigil-threshold-meter ${className}`.trim()}
      role="progressbar"
      aria-label={accessibleLabel}
      aria-valuetext={hasValidValues ? undefined : 'Threshold status unavailable'}
      aria-valuenow={hasValidValues ? current : undefined}
      aria-valuemin={0}
      aria-valuemax={hasValidValues ? total : undefined}
    >
      <div className="sigil-threshold-notches">
        {notches.map((idx) => {
          const isFilled = idx < (current ?? 0);
          return (
            <div
              key={idx}
              className={`sigil-threshold-notch ${
                isFilled ? 'sigil-threshold-notch--filled' : 'sigil-threshold-notch--empty'
              }`}
              title={`Share ${idx + 1}: ${isFilled ? 'Submitted' : 'Pending'}`}
              aria-hidden="true"
            />
          );
        })}
      </div>
      <div className="sigil-threshold-label">
        {hasValidValues
          ? `${current} / ${threshold} required (${total} total holders)`
          : 'Threshold status unavailable'}
      </div>
    </div>
  );
};
