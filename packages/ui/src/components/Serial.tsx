import React from 'react';

export interface SerialProps {
  id: number | bigint | string;
  padLength?: number;
  className?: string;
}

export const Serial: React.FC<SerialProps> = ({
  id,
  padLength = 4,
  className = '',
}) => {
  const numStr = String(id).padStart(padLength, '0');
  return (
    <span className={`sigil-serial ${className}`.trim()} aria-label={`Exam number ${id}`}>
      No. {numStr}
    </span>
  );
};
