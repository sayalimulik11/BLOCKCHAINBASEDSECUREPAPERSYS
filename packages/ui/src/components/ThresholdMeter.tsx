import React from 'react';

export interface ThresholdMeterProps {
  current: number;
  threshold: number;
  total: number;
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
  const notches = Array.from({ length: total }, (_, i) => i);

  return (
    <div
      className={`sigil-threshold-meter ${className}`.trim()}
      role="progressbar"
      aria-label={label || `Threshold status: ${current} of ${total} shares (threshold ${threshold})`}
      aria-valuenow={current}
      aria-valuemin={0}
      aria-valuemax={total}
    >
      <div className="sigil-threshold-notches">
        {notches.map((idx) => {
          const isFilled = idx < current;
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
        {current} / {threshold} required ({total} total holders)
      </div>
    </div>
  );
};
