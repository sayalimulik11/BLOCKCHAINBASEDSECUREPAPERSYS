import React from 'react';

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/**
 * Generates a deterministic SVG path for a guilloche rosette (hypotrochoid)
 * from a hash string, with fixed 2-decimal precision coordinates.
 */
export function rosettePath(hash: string): string {
  // Normalize hash and extract bytes
  const clean = (hash || '').replace(/^0x/i, '').toLowerCase();
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    const byte = parseInt(clean.substring(i, i + 2), 16);
    if (!isNaN(byte)) {
      bytes.push(byte);
    }
  }

  // Fallback bytes if hash is too short or empty
  while (bytes.length < 8) {
    bytes.push((bytes.length * 37 + 101) % 256);
  }

  const b0 = bytes[0] ?? 42;
  const b1 = bytes[1] ?? 89;
  const b2 = bytes[2] ?? 137;
  const b3 = bytes[3] ?? 201;

  // Parameters for hypotrochoid
  // R: radius of fixed outer circle
  // r: radius of rolling circle
  // d: distance from center of rolling circle
  const R = 18 + (b0 % 5);      // 18..22
  let r = 5 + (b1 % 6);         // 5..10
  if (r === R) r = 7;
  const d = 8 + (b2 % 8);       // 8..15

  // Calculate revolutions to close curve
  const diff = Math.abs(R - r);
  let g = gcd(diff, r);
  let revolutions = Math.floor(r / g);
  if (revolutions < 3) revolutions = 3 + (b3 % 4);
  if (revolutions > 12) revolutions = 6 + (b3 % 5);

  const totalPoints = revolutions * 72; // smooth curve
  const maxRadius = diff + d;
  const scale = 23 / (maxRadius || 1);
  const centerX = 26;
  const centerY = 26;

  const pathParts: string[] = [];

  for (let i = 0; i <= totalPoints; i++) {
    const theta = (i / totalPoints) * 2 * Math.PI * revolutions;
    const x = centerX + scale * (diff * Math.cos(theta) + d * Math.cos((diff / r) * theta));
    const y = centerY + scale * (diff * Math.sin(theta) - d * Math.sin((diff / r) * theta));

    const xStr = x.toFixed(2);
    const yStr = y.toFixed(2);

    if (i === 0) {
      pathParts.push(`M ${xStr} ${yStr}`);
    } else {
      pathParts.push(`L ${xStr} ${yStr}`);
    }
  }

  pathParts.push('Z');
  return pathParts.join(' ');
}

export interface RosetteProps {
  hash: string;
  size?: number;
  className?: string;
  title?: string;
}

export const Rosette: React.FC<RosetteProps> = ({
  hash,
  size = 52,
  className = '',
  title = 'Visual checksum rosette',
}) => {
  const pathData = React.useMemo(() => rosettePath(hash), [hash]);

  return (
    <svg
      className={`sigil-rosette ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 52 52"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <circle cx="26" cy="26" r="25" fill="none" stroke="currentColor" strokeWidth="0.5" strokeOpacity="0.3" />
      <path
        d={pathData}
        fill="none"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
