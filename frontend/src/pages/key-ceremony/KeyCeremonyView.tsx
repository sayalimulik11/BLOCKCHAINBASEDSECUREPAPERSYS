import React from 'react';
import { Button, Coupon } from '@sigil/ui';
import type { CeremonyStepStatus } from './workflow';
import './key-ceremony.css';

const STEPS = [
  'Generate exam keypair',
  'Split into n shares with threshold t',
  'Encrypt shares to each holder',
  'Upload encrypted shares',
  'Open collection on-chain',
  'Wipe private key',
] as const;

export type KeyCeremonyPageState = 'loading' | 'error' | 'permission' | 'empty' | 'ready';

export interface KeyCeremonyViewProps {
  pageState: KeyCeremonyPageState;
  error?: Error | null;
  retryRead?: () => void;
  examId: string;
  threshold: number;
  holders: ReadonlyArray<{ address: string; keyRegistered: boolean }>;
  stepStatuses: readonly CeremonyStepStatus[];
  isRunning?: boolean;
  isComplete?: boolean;
  failureMessage?: string | null;
  disabledReason?: string | null;
  onRun: () => void;
}

export function KeyCeremonyView({
  pageState,
  error,
  retryRead,
  examId,
  threshold,
  holders,
  stepStatuses,
  isRunning = false,
  isComplete = false,
  failureMessage = null,
  disabledReason = null,
  onRun,
}: KeyCeremonyViewProps) {
  if (pageState === 'loading') {
    return (
      <section className="key-ceremony__state key-ceremony__state--loading" aria-label="Loading key ceremony">
        <div className="key-ceremony__skeleton" />
      </section>
    );
  }
  if (pageState === 'permission') {
    return (
      <section className="key-ceremony__state" role="alert">
        <h1>Exam Authority role required</h1>
        <p>This account cannot run the key ceremony.</p>
      </section>
    );
  }
  if (pageState === 'empty') {
    return (
      <section className="key-ceremony__state" role="status">
        <h1>Examination not found</h1>
        <p>Check the exam serial and open a Draft examination from the docket.</p>
      </section>
    );
  }
  if (pageState === 'error') {
    return (
      <section className="key-ceremony__state" role="alert">
        <h1>Unable to load key ceremony</h1>
        <p>{error?.message ?? 'Exam and holder data could not be loaded.'}</p>
        <Button onClick={retryRead}>Retry connection</Button>
      </section>
    );
  }

  const allKeysReady = holders.length >= 3 && holders.every((holder) => holder.keyRegistered);
  const canOpenCollection =
    allKeysReady && !isRunning && !isComplete && !disabledReason;
  const reason = disabledReason ?? (
    !holders.length
      ? 'Assign key holders before running the ceremony.'
      : !allKeysReady
        ? 'Every assigned holder must have a registered encryption key.'
        : isRunning
          ? 'The ceremony is in progress.'
          : isComplete
            ? 'Collection is open; this ceremony cannot be repeated.'
            : undefined
  );

  return (
    <section className="key-ceremony" aria-labelledby="key-ceremony-title">
      <header className="key-ceremony__header">
        <p className="sigil-mono">No. {examId.padStart(4, '0')}</p>
        <h1 id="key-ceremony-title">Key ceremony</h1>
        <p>This runs in your browser. The exam private key is never sent or stored.</p>
      </header>

      <div className="key-ceremony__layout">
        <ol className="key-ceremony__steps" aria-label="Key ceremony progress">
          {STEPS.map((label, index) => {
            const status = stepStatuses[index] ?? 'pending';
            const detail = index === 1
              ? `Split into ${holders.length} shares with threshold ${threshold}`
              : label;
            return (
              <li className={`key-ceremony__step is-${status}`} key={label}>
                <span className="key-ceremony__bubble" aria-hidden="true" />
                <span>{detail}</span>
                <span className="key-ceremony__step-status">
                  {status === 'complete' ? 'Complete' : status === 'active' ? 'In progress' : status === 'error' ? 'Failed' : 'Pending'}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="key-ceremony__action">
          <h2>Assigned key holders</h2>
          <ul className="key-ceremony__holders">
            {holders.map((holder) => (
              <li key={holder.address}>
                <span className="sigil-mono">{holder.address}</span>
                <span>{holder.keyRegistered ? 'Key registered' : 'Encryption key missing'}</span>
              </li>
            ))}
          </ul>

          {failureMessage && (
            <div className="key-ceremony__failure" role="alert">
              <p>{failureMessage}</p>
              <Button type="button" variant="secondary" disabled={isRunning} onClick={onRun}>
                Retry failed step
              </Button>
            </div>
          )}
          {isComplete && (
            <p className="key-ceremony__complete" role="status">
              Collection is open. @sigil/core did not return the private key to this screen, and no private key was sent or stored. This version of @sigil/core does not confirm that its internal secret buffers were wiped.
            </p>
          )}

          <Coupon
            title="Open collection (permanent)"
            consequence="Opens question-bank collection for this exam. The encrypted shares are stored before the on-chain state changes."
            actionLabel={isRunning ? 'Running ceremony' : isComplete ? 'Collection opened' : 'Open collection'}
            isReady={canOpenCollection}
            disabledReason={reason}
            onAction={onRun}
          />
        </div>
      </div>
    </section>
  );
}
