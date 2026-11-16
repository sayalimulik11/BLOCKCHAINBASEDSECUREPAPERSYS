import { describe, it, expect } from 'vitest';
import { rosettePath } from '../src/components/Rosette';

describe('Rosette determinism and formatting', () => {
  const sampleHash1 = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const sampleHash2 = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

  it('produces identical output for identical hashes (determinism)', () => {
    const pathA = rosettePath(sampleHash1);
    const pathB = rosettePath(sampleHash1);
    expect(pathA).toBe(pathB);
    expect(pathA.length).toBeGreaterThan(100);
  });

  it('produces different outputs for different hashes', () => {
    const path1 = rosettePath(sampleHash1);
    const path2 = rosettePath(sampleHash2);
    expect(path1).not.toBe(path2);
  });

  it('enforces fixed 2-decimal precision on all numeric coordinates', () => {
    const path = rosettePath(sampleHash1);
    // Find all numbers in the path
    const numbers = path.match(/-?\d+\.\d+/g);
    expect(numbers).not.toBeNull();
    expect(numbers!.length).toBeGreaterThan(0);

    for (const num of numbers!) {
      const decimals = num.split('.')[1];
      expect(decimals?.length).toBe(2);
    }
  });

  it('closes the SVG path with Z', () => {
    const path = rosettePath(sampleHash1);
    expect(path.startsWith('M ')).toBe(true);
    expect(path.endsWith(' Z')).toBe(true);
  });

  it('matches snapshot for a known test vector hash', () => {
    const knownHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const path = rosettePath(knownHash);
    expect(path).toMatchSnapshot();
  });
});
