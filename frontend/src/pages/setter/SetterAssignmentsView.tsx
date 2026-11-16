import React from 'react';
import { Button, EmptyState, Serial } from '@sigil/ui';
import type { SetterAssignmentsViewProps } from './types';
import './setter.css';

function AssignmentState({ pageState, error, onRetry }: Pick<SetterAssignmentsViewProps, 'pageState' | 'error' | 'onRetry'>) {
  if (pageState === 'loading') {
    return (
      <section className="setter-state setter-state--assignments-loading" aria-label="Loading setter assignments">
        <div className="setter-skeleton" />
        <div className="setter-skeleton setter-skeleton--table" />
      </section>
    );
  }
  if (pageState === 'permission') {
    return (
      <section className="setter-state" role="alert">
        <h1>Paper Setter role required</h1>
        <p>This account cannot view setter assignments.</p>
      </section>
    );
  }
  if (pageState === 'error') {
    return (
      <section className="setter-state" role="alert">
        <h1>Unable to load setter assignments</h1>
        <p>{error?.message ?? 'Exam assignment data is unavailable.'}</p>
        <Button type="button" onClick={onRetry}>Retry connection</Button>
      </section>
    );
  }
  if (pageState === 'empty') {
    return (
      <EmptyState
        title="No exams assigned"
        description="Exams assigned to this setter will appear here with their section quotas."
      />
    );
  }
  return null;
}

export function SetterAssignmentsView({
  pageState,
  assignments,
  error,
  onRetry,
  onOpenQuestions,
}: SetterAssignmentsViewProps) {
  if (pageState !== 'ready') {
    return <AssignmentState pageState={pageState} error={error} onRetry={onRetry} />;
  }

  return (
    <section className="setter-page" aria-labelledby="setter-assignments-title">
      <header className="setter-page__header">
        <div>
          <h1 id="setter-assignments-title">Setter assignments</h1>
          <p>Exams assigned to this wallet and the question quotas for each section.</p>
        </div>
      </header>
      <div className="setter-table-scroll">
        <table className="setter-table">
          <thead>
            <tr>
              <th scope="col">Exam</th>
              <th scope="col">State</th>
              <th scope="col">Section quotas</th>
              <th scope="col">Questions</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((assignment) => (
              <tr key={assignment.examId}>
                <th scope="row">
                  <Serial id={assignment.examId} padLength={4} />
                  <span className="setter-table__title">{assignment.title}</span>
                </th>
                <td>{assignment.state}</td>
                <td>
                  <ul className="setter-quota-list">
                    {assignment.sections.map((section) => (
                      <li key={section.sectionId}>
                        {section.name}: {section.quota}
                      </li>
                    ))}
                  </ul>
                </td>
                <td>
                  <Button type="button" variant="secondary" onClick={() => onOpenQuestions(assignment.examId)}>
                    Compose questions
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
