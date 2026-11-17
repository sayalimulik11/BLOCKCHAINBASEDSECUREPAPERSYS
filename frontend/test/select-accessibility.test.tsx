import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import { Select } from '@sigil/ui';

describe('FA-02 Select accessibility', () => {
  it('keeps hidden background controls out of the accessibility and keyboard focus order', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const { container } = render(
      <main>
        <button type="button">Background action</button>
        <Select
          label="Section"
          options={[
            { value: 'physics', label: 'Physics' },
            { value: 'chemistry', label: 'Chemistry' },
          ]}
        />
        <button type="button">Next action</button>
      </main>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Section' });

    trigger.focus();
    await user.keyboard('{Enter}');

    const listbox = await screen.findByRole('listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(listbox).toHaveAccessibleName('Section');
    expect(container).not.toHaveAttribute('aria-hidden');

    const { violations } = await act(async () => axe.run(document.body, {
      runOnly: {
        type: 'rule',
        values: [
          'aria-allowed-attr',
          'aria-hidden-focus',
          'aria-required-children',
          'aria-required-parent',
          'aria-valid-attr',
          'button-name',
          'label',
        ],
      },
    }));
    expect(violations.filter(({ id }) => id === 'aria-hidden-focus')).toEqual([]);

    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(trigger).toHaveTextContent('Chemistry'));
    expect(trigger).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    await user.keyboard('{Enter}');
    await screen.findByRole('listbox');
    await user.keyboard('{Tab}');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Next action' })).toHaveFocus();
    expect(container.querySelector('main')).toBeInTheDocument();
  });
});
