import React from 'react';
import { Button, EmptyState } from '@sigil/ui';
import type { HolderAssignmentsViewProps } from './types';
import './holder.css';

function PageState({
  state,
  error,
  retry,
}: {
  state: HolderAssignmentsViewProps['pageState'];
  error?: Error | null;
  retry?: () => void;
}) {
  if (state === 'loading') {
    return (
      <section className="holder-state holder-state--assignments-loading" aria-label="Loading holder assignments">
        <div className="holder-skeleton" />
        <div className="holder-skeleton holder-skeleton--table" />
      </section>
    );
  }
  if (state === 'permission') {
    return (
      <section className="holder-state" role="alert">
        <h1>Key Holder role required</h1>
        <p>This wallet is not registered as a key holder.</p>
      </section>
    );
  }
  if (state === 'empty') {
    return (
      <EmptyState
        title="No exams assigned"
        description="No examinations currently list this wallet as a key holder."
      />
    );
  }
  if (state === 'error') {
    return (
      <section className="holder-state" role="alert">
        <h1>Unable to load holder assignments</h1>
        <p>{error?.message ?? 'Exam assignments could not be loaded.'}</p>
        <Button type="button" onClick={retry}>Retry connection</Button>
      </section>
    );
  }
  return null;
}

export function HolderAssignmentsView({
  pageState,
  assignments,
  error,
  onRetry,
  onOpenExam,
}: HolderAssignmentsViewProps) {
  if (pageState !== 'ready') {
    return <PageState state={pageState} error={error} retry={onRetry} />;
  }

  return (
    <section className="holder-page" aria-labelledby="holder-assignments-title">
      <header className="holder-page__header">
        <p className="sigil-mono">KEY HOLDER / ASSIGNMENTS</p>
        <h1 id="holder-assignments-title">Assigned examinations</h1>
        <p>Exams where this wallet is an assigned holder, with the published section quotas.</p>
      </header>
      <div className="holder-table-scroll">
        <table className="holder-table">
          <thead>
            <tr>
              <th scope="col">Serial</th>
              <th scope="col">Examination</th>
              <th scope="col">State</th>
              <th scope="col">Sections and quotas</th>
              <th scope="col">Panel</th>
              <th scope="col"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((exam) => (
              <tr key={exam.examId}>
                <th scope="row" className="sigil-mono">No. {exam.examId.padStart(4, '0')}</th>
                <td>{exam.title}</td>
                <td>{exam.state}</td>
                <td>{exam.sections.map((section) => `${section.name}: ${section.quota}`).join(' · ')}</td>
                <td>{exam.holderCount} holders · threshold {exam.threshold}</td>
                <td>
                  <Button type="button" variant="secondary" onClick={() => onOpenExam(exam.examId)}>
                    Open holder console
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
