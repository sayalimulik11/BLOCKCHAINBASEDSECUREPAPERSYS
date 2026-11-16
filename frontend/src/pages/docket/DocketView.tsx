import React, { useState } from 'react';
import {
  LedgerTable,
  Column,
  Button,
  Serial,
  CustodyBubbles,
  EmptyState,
  ExamState as CustodyExamState,
} from '@sigil/ui';
import { DocketExam } from './types';

export interface DocketViewProps {
  exams: DocketExam[];
  isLoading?: boolean;
  error?: Error | string | null;
  permissionDenied?: boolean;
  stateFilter: string | 'ALL';
  onStateFilterChange: (state: string | 'ALL') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onCreateExam?: () => void;
  onRowClick?: (exam: DocketExam) => void;
  onRetry?: () => void;
}

export const STATE_INT_MAP: Record<number, CustodyExamState> = {
  0: 'Draft',
  1: 'Collecting',
  2: 'Sealed',
  3: 'Released',
  4: 'Concluded',
  5: 'Cancelled',
};

export function formatTimestamp(raw: string | number): string {
  if (!raw) return '—';
  try {
    const s = Number(raw);
    const ms = s > 1e11 ? s : s * 1000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return String(raw);
    return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  } catch {
    return String(raw);
  }
}

export const DocketView: React.FC<DocketViewProps> = ({
  exams,
  isLoading = false,
  error = null,
  permissionDenied = false,
  stateFilter,
  onStateFilterChange,
  searchQuery,
  onSearchChange,
  onCreateExam,
  onRowClick,
  onRetry,
}) => {
  const filteredExams = React.useMemo(() => {
    return exams.filter((e) => {
      if (stateFilter !== 'ALL') {
        const stateName = STATE_INT_MAP[e.state] ?? 'Unknown';
        if (stateName.toLowerCase() !== stateFilter.toLowerCase()) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const serialStr = String(e.examId).padStart(4, '0');
        const title = e.title?.toLowerCase() ?? '';
        const meta = (e.metaHash ?? '').toLowerCase();
        if (!serialStr.includes(q) && !title.includes(q) && !meta.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [exams, stateFilter, searchQuery]);

  const columns: Column<DocketExam>[] = [
    {
      key: 'serialSort',
      header: 'Serial',
      sortable: true,
      render: (row) => (
        <span style={{ fontFamily: 'var(--sigil-font-mono)' }}>
          <Serial id={row.examId} padLength={4} />
        </span>
      ),
    },
    {
      key: 'title',
      header: 'Examination Title',
      sortable: true,
      render: (row) => {
        return (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 600, color: 'var(--sigil-color-ink)', fontSize: '13px' }}>
              {row.title ?? 'Title unavailable'}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--sigil-color-slate)', fontFamily: 'var(--sigil-font-mono)' }}>
              Chain #{row.chainId} · Hash {row.metaHash.slice(0, 10)}...
            </span>
          </div>
        );
      },
    },
    {
      key: 'state',
      header: 'Custody State',
      sortable: true,
      render: (row) => {
        const stateName = STATE_INT_MAP[row.state];
        if (!stateName) {
          return <span role="status">Unknown custody state ({row.state})</span>;
        }
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CustodyBubbles currentState={stateName} variant="inline" />
            <span
              style={{
                fontSize: '11px',
                fontFamily: 'var(--sigil-font-mono)',
                textTransform: 'uppercase',
                color: stateName === 'Cancelled' ? 'var(--sigil-color-alert)' : 'var(--sigil-color-ink)',
                fontWeight: 600,
              }}
            >
              {stateName}
            </span>
          </div>
        );
      },
    },
    {
      key: 'releaseOpensAt',
      header: 'Release time',
      sortable: true,
      render: (row) => (
        <span style={{ fontSize: '12px', fontFamily: 'var(--sigil-font-mono)', color: 'var(--sigil-color-ink)' }}>
          {formatTimestamp(row.releaseOpensAt)}
        </span>
      ),
    },
    {
      key: 'threshold',
      header: 'Panel',
      sortable: true,
      render: (row) => {
        return (
          <span
            style={{
              fontSize: '12px',
              fontFamily: 'var(--sigil-font-mono)',
              fontWeight: 600,
              color: 'var(--sigil-color-ink)',
            }}
          >
            {row.threshold} of {row.holderCount}
          </span>
        );
      },
    },
  ];

  // 1. Permission Denied State
  if (permissionDenied) {
    return (
      <div className="sigil-page-container" style={{ padding: '32px 0' }}>
        <div
          style={{
            border: '2px solid var(--sigil-color-alert)',
            backgroundColor: 'var(--sigil-color-sheet)',
            padding: '32px',
            maxWidth: '640px',
            margin: '0 auto',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: '18px', color: 'var(--sigil-color-alert)', marginBottom: '8px' }}>
            Access restricted: Exam Authority role required
          </h2>
          <p style={{ color: 'var(--sigil-color-slate)', fontSize: '14px', lineHeight: 1.5, margin: 0 }}>
            The examination docket requires the Exam Authority (AUTHORITY) role. Connect with an authorized authority wallet or ask the Administrator for panel assignment.
          </p>
        </div>
      </div>
    );
  }

  // 2. Loading Skeleton State
  if (isLoading) {
    return (
      <div className="sigil-page-container docket-page-container--loading" style={{ padding: '32px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--sigil-color-ink)' }}>
              Examination docket
            </h1>
            <p style={{ color: 'var(--sigil-color-slate)', fontSize: '13px', margin: 0 }}>
              Loading on-chain examinations...
            </p>
          </div>
        </div>
        <div
          data-testid="docket-loading-skeleton"
          style={{
            border: '1px solid var(--sigil-color-hairline)',
            backgroundColor: 'var(--sigil-color-sheet)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ height: '36px', backgroundColor: 'var(--sigil-color-mist)', width: '100%', opacity: 0.6 }} />
          <div style={{ height: '48px', backgroundColor: 'var(--sigil-color-mist)', width: '100%', opacity: 0.4 }} />
          <div style={{ height: '48px', backgroundColor: 'var(--sigil-color-mist)', width: '100%', opacity: 0.4 }} />
          <div style={{ height: '48px', backgroundColor: 'var(--sigil-color-mist)', width: '100%', opacity: 0.4 }} />
        </div>
      </div>
    );
  }

  // 3. Error State
  if (error && exams.length === 0) {
    const errorText = typeof error === 'string' ? error : error?.message || 'Failed to load examinations';
    return (
      <div className="sigil-page-container" style={{ padding: '32px 0' }}>
        <div
          style={{
            border: '1px solid var(--sigil-color-alert)',
            backgroundColor: 'var(--sigil-color-sheet)',
            padding: '24px',
            maxWidth: '600px',
            margin: '0 auto',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: '16px', color: 'var(--sigil-color-alert)', margin: '0 0 8px 0' }}>
            Unable to load examination docket
          </h2>
          <p style={{ color: 'var(--sigil-color-slate)', fontSize: '13px', margin: '0 0 16px 0' }}>
            {errorText}
          </p>
          {onRetry && (
            <Button variant="primary" onClick={onRetry}>
              Retry connection
            </Button>
          )}
        </div>
      </div>
    );
  }

  // 4. Main Page View
  const availableStates = ['ALL', 'Draft', 'Collecting', 'Sealed', 'Released', 'Concluded', 'Cancelled'];

  return (
    <div className="sigil-page-container" style={{ padding: '32px 0', maxWidth: '1200px', margin: '0 auto' }}>
      <div className="docket-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--sigil-color-ink)' }}>
            Examination docket
          </h1>
          <p style={{ color: 'var(--sigil-color-slate)', fontSize: '13px', margin: 0 }}>
            Authoritative registry of all scheduled, live, and concluded papers.
          </p>
        </div>
        {onCreateExam && (
          <Button variant="primary" onClick={onCreateExam}>
            Create exam
          </Button>
        )}
      </div>

      <div
        className="docket-filters"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          borderBottom: '1px solid var(--sigil-color-hairline)',
          paddingBottom: '14px',
        }}
      >
        <div className="docket-state-filter" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--sigil-color-slate)', fontWeight: 600 }}>
            State:
          </span>
          {availableStates.map((st) => {
            const isActive = stateFilter.toLowerCase() === st.toLowerCase();
            return (
              <button
                key={st}
                type="button"
                onClick={() => onStateFilterChange(st)}
                style={{
                  border: '1px solid',
                  borderColor: isActive ? 'var(--sigil-color-ink)' : 'var(--sigil-color-hairline)',
                  backgroundColor: isActive ? 'var(--sigil-color-ink)' : 'var(--sigil-color-sheet)',
                  color: isActive ? 'var(--sigil-color-sheet)' : 'var(--sigil-color-ink)',
                  fontSize: '11px',
                  fontFamily: 'var(--sigil-font-mono)',
                  padding: '4px 8px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {st}
              </button>
            );
          })}
        </div>

        <div className="docket-search" style={{ minWidth: '220px' }}>
          <input
            type="search"
            placeholder="Search serial, title..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="sigil-field__input"
            style={{ fontSize: '12px', padding: '6px 10px', height: '32px' }}
            aria-label="Search examinations"
          />
        </div>
      </div>

      {error && exams.length > 0 && (
        <p role="alert" style={{ color: 'var(--sigil-color-alert)', margin: '0 0 16px' }}>
          Exam data may be out of date: {typeof error === 'string' ? error : error.message}
        </p>
      )}

      {exams.length === 0 ? (
        <EmptyState
          title="No examinations scheduled"
          description="Create your first examination to configure the schedule, question bank, and key ceremony."
          action={onCreateExam ? <Button variant="primary" onClick={onCreateExam}>Create exam</Button> : undefined}
        />
      ) : filteredExams.length === 0 ? (
        <div role="status" style={{ borderTop: '1px solid var(--sigil-color-hairline)', padding: '20px 0' }}>
          <p style={{ margin: '0 0 12px', color: 'var(--sigil-color-slate)' }}>
            No examinations match the current search and state filter.
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              onSearchChange('');
              onStateFilterChange('ALL');
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <LedgerTable
          caption="Scheduled and active examination papers"
          columns={columns}
          data={filteredExams}
          keyField={(row) => row.examId}
          onRowClick={onRowClick}
        />
      )}
    </div>
  );
};
