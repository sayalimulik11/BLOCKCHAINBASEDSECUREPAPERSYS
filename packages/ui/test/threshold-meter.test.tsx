import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ThresholdMeter } from '../src/components/ThresholdMeter';

describe('ThresholdMeter', () => {
  it.each([
    [0, 3, 3],
    [1, 3, 3],
    [2, 3, 3],
    [3, 3, 3],
    [1, 5, 5],
    [2, 5, 5],
    [3, 5, 5],
  ])('renders %i of %i threshold across %i holders', (current, threshold, total) => {
    const markup = renderToStaticMarkup(
      <ThresholdMeter current={current} threshold={threshold} total={total} />,
    );

    expect(markup).toContain(`aria-valuenow="${current}"`);
    expect(markup).toContain(`aria-valuemax="${total}"`);
    expect(markup).toContain(`${current} / ${threshold} required (${total} total holders)`);
    expect(markup.match(/sigil-threshold-notch--filled/g) ?? []).toHaveLength(current);
    expect(markup.match(/sigil-threshold-notch--empty/g) ?? []).toHaveLength(total - current);
  });

  it.each([
    { current: -1, threshold: 2, total: 3 },
    { current: 4, threshold: 2, total: 3 },
    { current: 1, threshold: 4, total: 3 },
    { current: 1, threshold: 2, total: 0 },
    { current: Number.NaN, threshold: 2, total: 3 },
    { threshold: 2, total: 3 },
  ])('reports unavailable for invalid or missing values: %o', (props) => {
    const markup = renderToStaticMarkup(<ThresholdMeter {...props} />);

    expect(markup).toContain('aria-label="Threshold status unavailable"');
    expect(markup).toContain('aria-valuetext="Threshold status unavailable"');
    expect(markup).not.toContain('aria-valuenow=');
    expect(markup).toContain('Threshold status unavailable');
    expect(markup).not.toContain('sigil-threshold-notch--filled');
  });
});
