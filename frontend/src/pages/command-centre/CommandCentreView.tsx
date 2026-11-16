import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  Coupon,
  CountdownLock,
  CustodyBubbles,
  EmptyState,
  Rosette,
  Serial,
  StateStamp,
} from '@sigil/ui';
import type { CommandCentreViewProps, ReadinessCell } from './types';
import './command-centre.css';

function ReadinessBubble({ status }: { status: ReadinessCell }) {
  const labels: Record<ReadinessCell, string> = {
    complete: 'Complete',
    pending: 'Pending',
    'not-applicable': 'Not applicable',
    'not-tracked': 'Not tracked',
    unknown: 'Unavailable',
  };
  return (
    <span
      className={`command-centre__readiness-bubble is-${status}`}
      role="img"
      aria-label={labels[status]}
      title={labels[status]}
    />
  );
}

function pageStateContent(
  state: CommandCentreViewProps['pageState'],
  error: Error | null | undefined,
  onRetry: (() => void) | undefined,
  onBackToDocket: (() => void) | undefined,
) {
  if (state === 'loading') {
    return (
      <section className="command-centre__state command-centre__state--loading" aria-label="Loading exam command centre">
        <div className="command-centre__skeleton command-centre__skeleton--header" />
        <div className="command-centre__skeleton command-centre__skeleton--body" />
      </section>
    );
  }
  if (state === 'permission') {
    return (
      <section className="command-centre__state" role="alert">
        <h1>Exam Authority role required</h1>
        <p>This account cannot manage this examination.</p>
      </section>
    );
  }
  if (state === 'empty') {
    return (
      <EmptyState
        title="Examination not found"
        description="Open an examination from the Authority docket to manage its custody."
        action={<Button type="button" variant="secondary" onClick={onBackToDocket}>Open exam docket</Button>}
      />
    );
  }
  if (state === 'error') {
    return (
      <section className="command-centre__state" role="alert">
        <h1>Unable to load exam command centre</h1>
        <p>{error?.message ?? 'The examination data could not be loaded.'}</p>
        <Button type="button" onClick={onRetry}>Retry connection</Button>
      </section>
    );
  }
  return null;
}

export function CommandCentreView(props: CommandCentreViewProps) {
  const [cancelConfirmation, setCancelConfirmation] = useState('');
  const [sealBreaking, setSealBreaking] = useState(false);
  const previousState = useRef(props.exam?.state ?? null);
  const {
    pageState,
    error,
    exam,
    countdownTarget,
    readinessRows,
    sectionCounts,
    sealDisabledReason,
    concludeDisabledReason,
    actionError,
    isActionPending = false,
    onRetry,
    onBackToDocket,
    onSeal,
    onConclude,
    onCancel,
  } = props;

  useEffect(() => {
    if (exam?.state === 'Released' && previousState.current !== 'Released') {
      setSealBreaking(true);
      const timeout = window.setTimeout(() => setSealBreaking(false), 520);
      previousState.current = exam.state;
      return () => window.clearTimeout(timeout);
    }
    previousState.current = exam?.state ?? null;
    return undefined;
  }, [exam?.state]);

  const statePage = pageStateContent(pageState, error, onRetry, onBackToDocket);
  if (statePage) {
    return statePage;
  }
  if (!exam) {
    return null;
  }

  const serial = `No. ${exam.examId.padStart(4, '0')}`;
  const cancelDisabledReason = isActionPending
    ? 'A transaction is in progress.'
    : exam.state === 'Cancelled'
      ? 'This exam is already cancelled.'
      : cancelConfirmation !== serial
        ? `Type ${serial} to confirm cancellation.`
        : undefined;

  return (
    <section className="command-centre">
      <header className="command-centre__header">
        <div
          className={`command-centre__rosette${sealBreaking ? ' is-breaking' : ''}`}
          data-exam-state={exam.state}
        >
          <Rosette hash={exam.rosetteHash} size={52} title="Exam custody checksum" />
        </div>
        <div className="command-centre__heading">
          <Serial id={exam.examId} padLength={4} />
          <h1 id="command-centre-title">{exam.title}</h1>
        </div>
        <StateStamp state={exam.state} />
      </header>

      <div className="command-centre__custody">
        <CustodyBubbles currentState={exam.state} />
      </div>

      <div className="command-centre__grid">
        <section className="command-centre__readiness" aria-labelledby="readiness-title">
          <h2 id="readiness-title">Readiness</h2>
          {readinessRows.length === 0 ? (
            <p className="command-centre__empty-readiness">
              No holders or setters are assigned to this examination.
            </p>
          ) : (
            <div className="command-centre__table-scroll" tabIndex={0} aria-label="Readiness table">
              <table className="command-centre__table">
                <thead>
                  <tr>
                    <th scope="col">Participant</th>
                    <th scope="col">Key registered</th>
                    <th scope="col">Share verified</th>
                    <th scope="col">Randomness committed</th>
                    <th scope="col">Batches submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {readinessRows.map((row) => (
                    <tr key={`${row.role}:${row.address}`}>
                      <th scope="row">
                        <span className="command-centre__participant-role">{row.role}</span>
                        <span className="command-centre__participant-address">{row.address}</span>
                      </th>
                      <td><ReadinessBubble status={row.keyRegistered} /></td>
                      <td><ReadinessBubble status={row.shareVerified} /></td>
                      <td><ReadinessBubble status={row.randomnessCommitted} /></td>
                      <td>
                        <div className="command-centre__batch-readiness">
                          <ReadinessBubble status={row.batchesSubmitted} />
                          {row.batchCount !== null && (
                            <span className="command-centre__batch-count">{row.batchCount}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <section className="command-centre__quota" aria-labelledby="quota-title">
            <h2 id="quota-title">Question-bank quotas</h2>
            <table className="command-centre__quota-table">
              <thead>
                <tr>
                  <th scope="col">Section</th>
                  <th scope="col">Questions</th>
                  <th scope="col">Required</th>
                </tr>
              </thead>
              <tbody>
                {sectionCounts.map((section) => (
                  <tr key={section.name}>
                    <th scope="row">{section.name}</th>
                    <td>{section.questionCount}</td>
                    <td>{section.quota}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </section>

        <aside className="command-centre__actions" aria-label="Exam actions">
          <CountdownLock
            targetTimestamp={countdownTarget}
            label={exam.state === 'Released' ? 'Exam ends in' : 'Release window opens in'}
          />

          {actionError && <p className="command-centre__action-error" role="alert">{actionError}</p>}

          <Coupon
            title="Seal exam (permanent)"
            consequence="Closes question collection and records the bank hash on-chain."
            actionLabel={isActionPending ? 'Transaction pending' : 'Seal exam'}
            onAction={onSeal}
            isReady={!sealDisabledReason && !isActionPending}
            disabledReason={isActionPending ? 'A transaction is in progress.' : sealDisabledReason ?? undefined}
          />

          <Coupon
            title="Conclude exam (permanent)"
            consequence="Closes the examination lifecycle after the scheduled exam end."
            actionLabel={isActionPending ? 'Transaction pending' : 'Conclude exam'}
            onAction={onConclude}
            isReady={!concludeDisabledReason && !isActionPending}
            disabledReason={isActionPending ? 'A transaction is in progress.' : concludeDisabledReason ?? undefined}
          />

          <Coupon
            title="Cancel exam (permanent)"
            consequence="Marks this examination as cancelled on-chain; its audit history remains available."
            actionLabel={isActionPending ? 'Transaction pending' : 'Cancel exam'}
            onAction={onCancel}
            variant="alert"
            isReady={!cancelDisabledReason}
            disabledReason={cancelDisabledReason}
          >
            <label className="command-centre__cancel-label" htmlFor="command-centre-cancel-confirmation">
              Type {serial} to confirm cancellation
            </label>
            <input
              id="command-centre-cancel-confirmation"
              className="command-centre__cancel-input"
              autoComplete="off"
              spellCheck={false}
              value={cancelConfirmation}
              onChange={(event) => setCancelConfirmation(event.target.value)}
              aria-describedby="command-centre-cancel-help"
            />
            <span id="command-centre-cancel-help" className="command-centre__cancel-help">
              The value must match the exam serial exactly.
            </span>
          </Coupon>
        </aside>
      </div>
    </section>
  );
}
