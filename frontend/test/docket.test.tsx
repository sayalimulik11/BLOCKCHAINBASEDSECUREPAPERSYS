import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { DocketView } from '../src/pages/docket/DocketView';
import { DocketExam } from '../src/pages/docket/types';

const exams: DocketExam[] = [
  {
    examId: '10',
    serialSort: '10'.padStart(78, '0'),
    chainId: 31337,
    state: 2,
    metaHash: `0x${'1'.repeat(64)}`,
    releaseOpensAt: '1793613600',
    examStartsAt: '1793617200',
    examEndsAt: '1793628000',
    threshold: 3,
    bankHash: null,
    seed: null,
    title: 'Organic Chemistry paper',
    holderCount: 5,
  },
  {
    examId: '7',
    serialSort: '7'.padStart(78, '0'),
    chainId: 31337,
    state: 1,
    metaHash: `0x${'2'.repeat(64)}`,
    releaseOpensAt: '1793527200',
    examStartsAt: '1793530800',
    examEndsAt: '1793541600',
    threshold: 3,
    bankHash: null,
    seed: null,
    title: 'Physics examination',
    holderCount: 5,
  },
];

function renderDocket(
  props: Partial<React.ComponentProps<typeof DocketView>> = {},
) {
  const onStateFilterChange = vi.fn();
  const onSearchChange = vi.fn();
  const view = render(
    <DocketView
      exams={exams}
      stateFilter="ALL"
      onStateFilterChange={onStateFilterChange}
      searchQuery=""
      onSearchChange={onSearchChange}
      {...props}
    />,
  );
  return { ...view, onStateFilterChange, onSearchChange };
}

describe('FA-05: Authority docket page', () => {
  it('renders the loading skeleton', () => {
    renderDocket({ exams: [], isLoading: true });
    expect(screen.getByTestId('docket-loading-skeleton')).toBeInTheDocument();
  });

  it('renders the empty state only when the exam list is truly empty', () => {
    renderDocket({ exams: [] });
    expect(screen.getByText('No examinations scheduled')).toBeInTheDocument();
  });

  it('renders a retryable error state', () => {
    const onRetry = vi.fn();
    renderDocket({ exams: [], error: new Error('Indexer unavailable'), onRetry });
    expect(screen.getByText('Unable to load examination docket')).toBeInTheDocument();
    expect(screen.getByText('Indexer unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry connection/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('denies access to users without the Authority role', () => {
    renderDocket({ permissionDenied: true });
    expect(screen.getByText(/Exam Authority role required/)).toBeInTheDocument();
    expect(screen.queryByText('Physics examination')).not.toBeInTheDocument();
  });

  it('shows live exam titles, serials, custody, release time, and threshold panel', () => {
    renderDocket();
    expect(screen.getByText('No. 0007')).toBeInTheDocument();
    expect(screen.getByText('Physics examination')).toBeInTheDocument();
    expect(screen.getAllByText('Collecting')).toHaveLength(2);
    expect(screen.getAllByText('3 of 5')).toHaveLength(2);
    expect(screen.getByText('2026-11-01 10:00 UTC')).toBeInTheDocument();
  });

  it('sorts numerically by serial and supports keyboard row activation', () => {
    const onRowClick = vi.fn();
    renderDocket({ onRowClick });
    fireEvent.click(screen.getByRole('button', { name: /serial/i }));

    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('No. 0007');
    expect(rows[2]).toHaveTextContent('No. 0010');

    fireEvent.keyDown(rows[1], { key: 'Enter' });
    expect(onRowClick).toHaveBeenCalledWith(exams[1]);
  });

  it('filters by state and search, without showing the global empty state', () => {
    const { onStateFilterChange, onSearchChange, rerender } = renderDocket();
    fireEvent.click(screen.getByRole('button', { name: /^sealed$/i }));
    expect(onStateFilterChange).toHaveBeenCalledWith('Sealed');

    rerender(
      <DocketView
        exams={exams}
        stateFilter="Sealed"
        onStateFilterChange={onStateFilterChange}
        searchQuery="physics"
        onSearchChange={onSearchChange}
      />,
    );
    expect(screen.getByText('No examinations match the current search and state filter.')).toBeInTheDocument();
    expect(screen.queryByText('No examinations scheduled')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(onSearchChange).toHaveBeenCalledWith('');
    expect(onStateFilterChange).toHaveBeenCalledWith('ALL');
  });

  it('links the create action to the wizard callback', () => {
    const onCreateExam = vi.fn();
    renderDocket({ onCreateExam });
    fireEvent.click(screen.getByRole('button', { name: /create exam/i }));
    expect(onCreateExam).toHaveBeenCalledOnce();
  });
});
