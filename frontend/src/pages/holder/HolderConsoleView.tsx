import React from 'react';
import {
  Button,
  Coupon,
  CountdownLock,
  EmptyState,
  Rosette,
  Serial,
  StateStamp,
  ThresholdMeter,
} from '@sigil/ui';
import type { HolderConsoleViewProps, HolderExamAssignment } from './types';
import { passphraseStrength } from './key-holder';
import './holder.css';

function PageState({
  state,
  error,
  retry,
}: {
  state: HolderConsoleViewProps['pageState'];
  error?: Error | null;
  retry: () => void;
}) {
  if (state === 'loading') {
    return (
      <section className="holder-state holder-state--console-loading" aria-label="Loading holder console">
        <div className="holder-skeleton" />
        <div className="holder-skeleton holder-skeleton--body" />
      </section>
    );
  }
  if (state === 'permission') {
    return (
      <section className="holder-state" role="alert">
        <h1>Key Holder role required</h1>
        <p>This wallet is not assigned to this examination as a key holder.</p>
      </section>
    );
  }
  if (state === 'empty') {
    return (
      <EmptyState
        title="Examination not found"
        description="Open an assigned examination from Key holder assignments."
      />
    );
  }
  if (state === 'error') {
    return (
      <section className="holder-state" role="alert">
        <h1>Unable to load holder console</h1>
        <p>{error?.message ?? 'Exam and on-chain holder data could not be loaded.'}</p>
        <Button type="button" onClick={retry}>Retry connection</Button>
      </section>
    );
  }
  return null;
}

export function HolderConsoleView({
  pageState,
  snapshot,
  error,
  actions,
}: HolderConsoleViewProps) {
  if (pageState !== 'ready') {
    return <PageState state={pageState} error={error} retry={actions.onRetry} />;
  }
  const exam = snapshot.exam;
  if (!exam) return null;

  const strength = passphraseStrength(actions.setupPassphrase);
  const randomnessDisabledReason = !snapshot.shareUnlocked
    ? 'Unlock the keystore and decrypt the encrypted share first.'
    : snapshot.randomnessCommitted
      ? 'Randomness has already been committed for this holder.'
      : exam.state !== 'Collecting'
        ? 'Randomness can be committed only while collection is open.'
        : undefined;
  const remainingUntilOpen = snapshot.chainTime === null
    ? 0
    : Math.max(0, exam.releaseOpensAt - snapshot.chainTime);
  const countdownTarget = Math.floor(Date.now() / 1000) + remainingUntilOpen;
  const submitDisabledReason = actions.isTransactionPending
    ? 'A transaction is in progress.'
    : snapshot.shareSubmitted
      ? 'This holder has already submitted a share.'
      : !snapshot.keyRegistered
        ? 'Register this holder wallet’s encryption key first.'
        : !actions.hasKeystoreFile
          ? 'Choose the downloaded .sigilkey file before unlocking.'
          : !snapshot.shareVerified
            ? 'Unlock the keystore and verify the encrypted share first.'
            : !snapshot.randomnessCommitted
              ? 'Commit randomness before submitting the share.'
              : exam.state !== 'Sealed' && exam.state !== 'Released'
                ? 'Share submission is available only after the exam is sealed.'
              : snapshot.chainTime === null
                ? 'Current chain time is unavailable.'
                : snapshot.chainTime < exam.releaseOpensAt
                  ? 'The release window has not opened at chain time.'
                  : snapshot.chainTime > exam.examEndsAt
                    ? 'The release window has closed at chain time.'
                    : null;

  return (
    <section className="holder-page holder-console" aria-labelledby="holder-console-title">
      <header className="holder-console__header">
        <div className="holder-console__rosette">
          <Rosette hash={exam.rosetteHash} size={52} title="Exam custody checksum" />
        </div>
        <div className="holder-console__heading">
          <Serial id={exam.examId} padLength={4} />
          <h1 id="holder-console-title">{exam.title}</h1>
        </div>
        <StateStamp state={exam.state} />
      </header>

      <section className="holder-console__key-setup" aria-labelledby="holder-key-setup-title">
        <div className="holder-console__section-heading">
          <div>
            <p className="sigil-mono">01 / HOLDER KEY</p>
            <h2 id="holder-key-setup-title">Keystore setup</h2>
          </div>
          {snapshot.keyRegistered && <span className="holder-status is-complete">Key registered</span>}
        </div>
        <p className="holder-console__warning">
          A lost keystore means a lost share. Keep the downloaded .sigilkey file safe.
        </p>
        {!snapshot.keyRegistered && (
          <div className="holder-console__setup-form">
            <label htmlFor="holder-setup-passphrase">New keystore passphrase</label>
            <input
              id="holder-setup-passphrase"
              type="password"
              autoComplete="new-password"
              value={actions.setupPassphrase}
              onChange={(event) => actions.onSetupPassphraseChange(event.currentTarget.value)}
              aria-describedby="holder-passphrase-strength holder-passphrase-requirement"
            />
            <div className="holder-strength" data-level={strength.level}>
              <span className="holder-strength__bar" aria-hidden="true" />
              <span id="holder-passphrase-strength">Strength: {strength.label}</span>
            </div>
            <p id="holder-passphrase-requirement">Use at least 12 characters. Strength guidance does not reject longer passphrases.</p>
            <Button
              type="button"
              disabled={
                actions.setupPassphrase.length < 12 ||
                actions.isGeneratingKeystore ||
                actions.hasGeneratedKeystore
              }
              onClick={actions.onGenerateKeystore}
            >
              {actions.isGeneratingKeystore ? 'Generating keystore' : 'Generate keystore'}
            </Button>
            {actions.hasGeneratedKeystore && !actions.hasDownloadedKeystore && (
              <Button type="button" variant="secondary" onClick={actions.onDownloadKeystore}>
                Download .sigilkey keystore
              </Button>
            )}
            {actions.hasDownloadedKeystore && (
              <p role="status">Keystore downloaded once. Register its public key on-chain next.</p>
            )}
            {actions.hasDownloadedKeystore && (
              <Button
                type="button"
                disabled={actions.isRegisteringKey || actions.isTransactionPending}
                onClick={actions.onRegisterKey}
              >
                {actions.isRegisteringKey ? 'Registering public key' : 'Register public key'}
              </Button>
            )}
          </div>
        )}
      </section>

      <section className="holder-console__vault" aria-labelledby="holder-share-vault-title">
        <div className="holder-console__section-heading">
          <div>
            <p className="sigil-mono">02 / ENCRYPTED SHARE</p>
            <h2 id="holder-share-vault-title">Share vault</h2>
          </div>
          {snapshot.shareVerified && <span className="holder-status is-complete">Share verified</span>}
          {snapshot.shareUnlocked && !snapshot.shareVerified && (
            <span className="holder-status">Commitment pending</span>
          )}
        </div>
        <p>The encrypted share is fetched for this holder and checked against its on-chain commitment. The share itself is never displayed.</p>
        <label className="holder-file">
          <span>Choose your .sigilkey file</span>
          <input
            type="file"
            accept=".sigilkey,application/json"
            aria-label="Choose keystore file"
            onChange={(event) => actions.onKeystoreFile(event.currentTarget.files?.[0] ?? null)}
          />
        </label>
        {actions.hasKeystoreFile && <p className="holder-file__selected">Encrypted keystore selected for this session.</p>}
        {snapshot.shareVerified && (
          <p className="holder-console__verified" role="status">The decrypted share matches the current on-chain commitment.</p>
        )}
        {snapshot.shareUnlocked && !snapshot.shareVerified && (
          <p className="holder-console__pending" role="status">
            Share decrypted in memory. It will be shown as verified only after the on-chain commitment matches.
          </p>
        )}
      </section>

      <section className="holder-console__randomness" aria-labelledby="holder-randomness-title">
        <div className="holder-console__section-heading">
          <div>
            <p className="sigil-mono">03 / COMMIT-REVEAL</p>
            <h2 id="holder-randomness-title">Randomness commitment</h2>
          </div>
          {snapshot.randomnessCommitted && <span className="holder-status is-complete">Committed</span>}
        </div>
        <p>The reveal is derived in memory by @sigil/core and is not shown or saved. Only its commitment is submitted.</p>
        <Button
          type="button"
          variant="secondary"
          disabled={
            !snapshot.shareUnlocked ||
            snapshot.randomnessCommitted ||
            exam.state !== 'Collecting' ||
            actions.isCommittingRandomness ||
            actions.isTransactionPending
          }
          onClick={actions.onCommitRandomness}
        >
          {actions.isCommittingRandomness
            ? 'Committing randomness'
            : snapshot.randomnessCommitted
              ? 'Randomness committed'
              : 'Commit randomness'}
        </Button>
        {randomnessDisabledReason && <p className="holder-console__reason">{randomnessDisabledReason}</p>}
      </section>

      <section className="holder-release" aria-labelledby="holder-release-title">
        <div className="holder-release__status">
          <p className="sigil-mono">04 / RELEASE</p>
          <h2 id="holder-release-title">Release console</h2>
          <CountdownLock targetTimestamp={countdownTarget} label="Release window opens in" />
          <p className="holder-release__chain-time">
            Opens at chain time: <time dateTime={new Date(exam.releaseOpensAt * 1000).toISOString()}>
              {new Date(exam.releaseOpensAt * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC')}
            </time>
          </p>
          <div className="holder-release__threshold">
            <h3>Shares submitted</h3>
            <ThresholdMeter
              current={snapshot.submissionCount}
              threshold={exam.threshold}
              total={Math.max(1, exam.holderCount)}
            />
            <p>{snapshot.submissionCount} submitted · {exam.threshold} needed</p>
          </div>
        </div>

        <aside className="holder-release__action">
          <Coupon
            title="Submit share and reveal (permanent)"
            consequence="The verified share and its reveal become public on-chain. Once enough holders submit, the exam seed is released."
            actionLabel={actions.isSubmittingShare
              ? 'Submitting share'
              : snapshot.shareSubmitted
                ? 'Share submitted'
                : 'Submit share and reveal'}
            onAction={actions.onSubmitShare}
            isReady={!submitDisabledReason && !actions.isSubmittingShare}
            disabledReason={submitDisabledReason ?? undefined}
            variant="alert"
          >
            <label htmlFor="holder-release-passphrase">Keystore passphrase</label>
            <input
              id="holder-release-passphrase"
              type="password"
              autoComplete="current-password"
              value={actions.releasePassphrase}
              onChange={(event) => actions.onReleasePassphraseChange(event.currentTarget.value)}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={
                !actions.hasKeystoreFile ||
                actions.releasePassphrase.length < 12 ||
                actions.isUnlocking ||
                snapshot.shareVerified
              }
              onClick={actions.onUnlockShare}
            >
              {actions.isUnlocking
                ? 'Unlocking and verifying'
                : snapshot.shareVerified
                  ? 'Share verified'
                  : 'Unlock and verify share'}
            </Button>
            {snapshot.shareVerified && (
              <Button type="button" variant="secondary" onClick={actions.onClearSecrets}>
                Lock and clear in-memory secrets
              </Button>
            )}
          </Coupon>
        </aside>
      </section>

      {(actions.actionMessage || actions.actionError) && (
        <div className={actions.actionError ? 'holder-console__feedback is-error' : 'holder-console__feedback'} role={actions.actionError ? 'alert' : 'status'}>
          {actions.actionError ?? actions.actionMessage}
        </div>
      )}
      <footer className="holder-console__footer">
        <p>Private-key and plaintext-share buffers are cleared best-effort after use and on unmount. Browser runtimes cannot guarantee physical memory erasure.</p>
      </footer>
    </section>
  );
}
