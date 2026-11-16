export const tokens = {
  colors: {
    mist: '#E7EDEA',
    sheet: '#F9FBFA',
    ink: '#0F2740',
    slate: '#566A7B',
    hairline: '#C3D0CB',
    marigold: '#E59A0E',
    verified: '#1D7A57',
    alert: '#B03A2E',
    pending: '#2C5D8F',
  },
  fonts: {
    sans: "'Atkinson Hyperlegible Next', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    mono: "'Atkinson Hyperlegible Mono', ui-monospace, SFMono-Regular, monospace",
  },
  fontSizes: {
    xs: '13px',
    base: '15px',
    md: '17px',
    lg: '22px',
    xl: '28px',
    '2xl': '40px',
  },
  spacing: {
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    8: '32px',
    10: '40px',
    12: '48px',
  },
  radii: {
    input: '3px',
    button: '3px',
    table: '0px',
    coupon: '0px',
    popover: '3px',
    stateStamp: '2px',
  },
  shadows: {
    popover: '0 4px 16px rgba(15, 39, 64, 0.12)',
  },
} as const;

export type Tokens = typeof tokens;
export type ColorToken = keyof typeof tokens.colors;
export type FontSizeToken = keyof typeof tokens.fontSizes;
export type SpacingToken = keyof typeof tokens.spacing;
