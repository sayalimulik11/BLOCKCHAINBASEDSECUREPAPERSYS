import React, { useState } from 'react';
import { Tooltip } from './Tooltip';

export interface HashChipProps {
  hash: string;
  leadLength?: number;
  tailLength?: number;
  txUrl?: string;
  className?: string;
}

export const HashChip: React.FC<HashChipProps> = ({
  hash,
  leadLength = 6,
  tailLength = 4,
  txUrl,
  className = '',
}) => {
  const [copied, setCopied] = useState(false);

  const truncated = React.useMemo(() => {
    if (!hash) return '';
    if (hash.length <= leadLength + tailLength + 3) return hash;
    return `${hash.slice(0, leadLength)}...${hash.slice(-tailLength)}`;
  }, [hash, leadLength, tailLength]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hash) return;
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <span className="sigil-hash-chip-group">
      <Tooltip content={copied ? 'Copied full hash' : hash}>
        <button
          type="button"
          className={`sigil-hash-chip ${className}`.trim()}
          onClick={handleCopy}
          aria-label={`Copy hash ${truncated}`}
        >
          <span>{truncated}</span>
          <span className="sigil-hash-chip__copy-icon" aria-hidden="true">
            {copied ? '✓' : '⧉'}
          </span>
        </button>
      </Tooltip>
      {txUrl && (
        <a
          className="sigil-hash-chip__link"
          href={txUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="↗ View transaction details"
        >
          ↗
        </a>
      )}
    </span>
  );
};
