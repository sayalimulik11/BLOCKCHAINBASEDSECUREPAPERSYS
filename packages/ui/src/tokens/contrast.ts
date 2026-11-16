/**
 * Calculates WCAG 2.1 relative luminance and contrast ratio.
 */

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b];
  }
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b];
}

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function getRelativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function getContrastRatio(fgHex: string, bgHex: string): number {
  const l1 = getRelativeLuminance(fgHex);
  const l2 = getRelativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  return Math.round(ratio * 100) / 100;
}

export interface ContrastAuditResult {
  fgName: string;
  fgHex: string;
  bgName: string;
  bgHex: string;
  ratio: number;
  passNormal: boolean; // >= 4.5
  passLarge: boolean;  // >= 3.0
  passUI: boolean;     // >= 3.0
  useCase: string;
}

export function auditPair(
  fgName: string,
  fgHex: string,
  bgName: string,
  bgHex: string,
  useCase: string
): ContrastAuditResult {
  const ratio = getContrastRatio(fgHex, bgHex);
  return {
    fgName,
    fgHex,
    bgName,
    bgHex,
    ratio,
    passNormal: ratio >= 4.5,
    passLarge: ratio >= 3.0,
    passUI: ratio >= 3.0,
    useCase,
  };
}

export const standardAuditPairs: ContrastAuditResult[] = [
  auditPair('ink', '#0F2740', 'mist', '#E7EDEA', 'Body text on page background'),
  auditPair('ink', '#0F2740', 'sheet', '#F9FBFA', 'Body text / headings on panels & sheets'),
  auditPair('slate', '#566A7B', 'sheet', '#F9FBFA', 'Secondary text on panel sheets'),
  auditPair('slate', '#566A7B', 'mist', '#E7EDEA', 'Secondary text on page background'),
  auditPair('verified', '#1D7A57', 'sheet', '#F9FBFA', 'Verified / matched status indicators on panel'),
  auditPair('alert', '#B03A2E', 'sheet', '#F9FBFA', 'Alert / error text on panel'),
  auditPair('pending', '#2C5D8F', 'sheet', '#F9FBFA', 'Pending transaction badge text on sheet'),
  auditPair('sheet', '#F9FBFA', 'ink', '#0F2740', 'Primary button text (sheet on ink fill)'),
  auditPair('hairline', '#C3D0CB', 'mist', '#E7EDEA', 'Hairline border contrast on page'),
  auditPair('hairline', '#C3D0CB', 'sheet', '#F9FBFA', 'Hairline table divider contrast on sheet'),
  auditPair('marigold', '#E59A0E', 'ink', '#0F2740', 'Marigold focus / accent on dark ink'),
];
