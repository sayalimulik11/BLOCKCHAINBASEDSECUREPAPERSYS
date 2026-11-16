import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HolderAssignmentsView } from '../src/pages/holder/HolderAssignmentsView';
import { HolderConsoleView } from '../src/pages/holder/HolderConsoleView';
import { holderContractMessage, passphraseErrorMessage, passphraseStrength } from '../src/pages/holder/key-holder';
import type {
  HolderAssignmentsViewProps,
  HolderConsoleActions,
  HolderConsoleSnapshot,
  HolderConsoleViewProps,
  HolderExamAssignment,
} from '../src/pages/holder/types';

const assignment: HolderExamAssignment = {
  examId: '7',
  title: 'Regional Physics Examination',
  state: 'Collecting',
  rosetteHash: `0x${'a'.repeat(64)}`,
  releaseOpensAt: 1_800_000_000,
  examStartsAt: 1_800_001_800,
  examEndsAt: 1_800_003_600,
  threshold: 3,
  holderCount: 5,
  sections: [{ name: 'Physics', quota: 45 }],
};

const snapshot: HolderConsoleSnapshot = {
  exam: assignment,
  keyRegistered: false,
  shareUnlocked: false,
  shareVerified: false,
  randomnessCommitted: false,
  shareSubmitted: false,
  submissionCount: 1,
  chainTime: 1_799_999_000,
};

function createActions(overrides: Partial<HolderConsoleActions> = {}): HolderConsoleActions {
  return {
    setupPassphrase: '',
    releasePassphrase: '',
    isGeneratingKeystore: false,
    hasGeneratedKeystore: false,
    hasDownloadedKeystore: false,
    hasKeystoreFile: false,
    isRegisteringKey: false,
    isUnlocking: false,
    isCommittingRandomness: false,
    isSubmittingShare: false,
    isTransactionPending: false,
    actionMessage: null,
    actionError: null,
    onSetupPassphraseChange: vi.fn(),
    onGenerateKeystore: vi.fn(),
    onDownloadKeystore: vi.fn(),
    onRegisterKey: vi.fn(),
    onKeystoreFile: vi.fn(),
    onReleasePassphraseChange: vi.fn(),
    onUnlockShare: vi.fn(),
    onCommitRandomness: vi.fn(),
    onSubmitShare: vi.fn(),
    onClearSecrets: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
}

function renderConsole(
  overrides: Partial<HolderConsoleViewProps> = {},
) {
  const props: HolderConsoleViewProps = {
    pageState: 'ready',
    snapshot,
    actions: createActions(),
    ...overrides,
  };
  return { ...render(<HolderConsoleView {...props} />), props };
}

describe('FA-10 holder page states and controls', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading, empty, error, permission and ready assignments states', () => {
    const assignmentsProps: HolderAssignmentsViewProps = {
      pageState: 'loading',
      assignments: [],
      onOpenExam: vi.fn(),
    };
    const { rerender } = render(<HolderAssignmentsView {...assignmentsProps} />);
    expect(screen.getByLabelText('Loading holder assignments')).toBeInTheDocument();

    rerender(<HolderAssignmentsView {...assignmentsProps} pageState="empty" />);
    expect(screen.getByText('No exams assigned')).toBeInTheDocument();

    rerender(<HolderAssignmentsView {...assignmentsProps} pageState="permission" />);
    expect(screen.getByText('Key Holder role required')).toBeInTheDocument();

    rerender(
      <HolderAssignmentsView {...assignmentsProps} pageState="error" error={new Error('API unavailable')} />,
    );
    expect(screen.getByText('API unavailable')).toBeInTheDocument();

    const onOpenExam = vi.fn();
    rerender(
      <HolderAssignmentsView
        {...assignmentsProps}
        pageState="ready"
        assignments={[assignment]}
        onOpenExam={onOpenExam}
      />,
    );
    expect(screen.getByText('Physics: 45')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open holder console' }));
    expect(onOpenExam).toHaveBeenCalledWith('7');
  });

  it('renders loading, empty, error, permission and ready console states', () => {
    const { rerender } = renderConsole({ pageState: 'loading', snapshot: { ...snapshot, exam: null } });
    expect(screen.getByLabelText('Loading holder console')).toBeInTheDocument();

    rerender(
      <HolderConsoleView pageState="empty" snapshot={{ ...snapshot, exam: null }} actions={createActions()} />,
    );
    expect(screen.getByText('Examination not found')).toBeInTheDocument();

    rerender(
      <HolderConsoleView pageState="permission" snapshot={{ ...snapshot, exam: null }} actions={createActions()} />,
    );
    expect(screen.getByText('Key Holder role required')).toBeInTheDocument();

    rerender(
      <HolderConsoleView
        pageState="error"
        snapshot={{ ...snapshot, exam: null }}
        error={new Error('Chain unavailable')}
        actions={createActions()}
      />,
    );
    expect(screen.getByText('Chain unavailable')).toBeInTheDocument();

    rerender(<HolderConsoleView pageState="ready" snapshot={snapshot} actions={createActions()} />);
    expect(screen.getByRole('heading', { name: assignment.title })).toBeInTheDocument();
    expect(screen.getByText(/The share itself is never displayed/)).toBeInTheDocument();
  });

  it('enforces only the core 12-character minimum and reports a strength meter', () => {
    expect(passphraseStrength('').label).toBe('Enter a passphrase');
    expect(passphraseStrength('short').label).toBe('Weak');
    expect(passphraseStrength('abcdefghijkl').level).toBeGreaterThan(0);
    expect(passphraseStrength('LongPassphrase-123').label).toBe('Strong');

    const onGenerateKeystore = vi.fn();
    const actions = createActions({ onGenerateKeystore });
    const { rerender } = renderConsole({ actions });
    expect(screen.getByRole('button', { name: 'Generate keystore' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('New keystore passphrase'), { target: { value: 'short' } });
    rerender(
      <HolderConsoleView
        pageState="ready"
        snapshot={snapshot}
        actions={{ ...actions, setupPassphrase: 'short' }}
      />,
    );
    expect(document.getElementById('holder-passphrase-strength')?.textContent).toBe('Strength: Weak');
    expect(screen.getByRole('button', { name: 'Generate keystore' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('New keystore passphrase'), {
      target: { value: 'LongPassphrase-123' },
    });
    rerender(
      <HolderConsoleView
        pageState="ready"
        snapshot={snapshot}
        actions={{ ...actions, setupPassphrase: 'LongPassphrase-123' }}
      />,
    );
    const generate = screen.getByRole('button', { name: 'Generate keystore' });
    expect(generate).toBeEnabled();
    fireEvent.click(generate);
    expect(onGenerateKeystore).toHaveBeenCalledOnce();
  });

  it('shows specific blocked release reasons and only enables after all gates pass', () => {
    const baseActions = createActions({ hasKeystoreFile: true });
    const { rerender } = renderConsole({ actions: baseActions });
    expect(screen.getByText('Register this holder wallet’s encryption key first.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit share and reveal' })).toBeDisabled();

    rerender(
      <HolderConsoleView
        pageState="ready"
        snapshot={{ ...snapshot, keyRegistered: true }}
        actions={baseActions}
      />,
    );
    expect(screen.getByText('Unlock the keystore and verify the encrypted share first.')).toBeInTheDocument();

    rerender(
      <HolderConsoleView
        pageState="ready"
        snapshot={{ ...snapshot, keyRegistered: true, shareVerified: true }}
        actions={baseActions}
      />,
    );
    expect(screen.getByText('Commit randomness before submitting the share.')).toBeInTheDocument();

    rerender(
      <HolderConsoleView
        pageState="ready"
        snapshot={{ ...snapshot, keyRegistered: true, shareVerified: true, randomnessCommitted: true }}
        actions={baseActions}
      />,
    );
    expect(screen.getByText('Share submission is available only after the exam is sealed.')).toBeInTheDocument();

    const sealed = { ...assignment, state: 'Sealed' as const };
    rerender(
      <HolderConsoleView
        pageState="ready"
        snapshot={{ ...snapshot, exam: sealed, keyRegistered: true, shareVerified: true, randomnessCommitted: true }}
        actions={baseActions}
      />,
    );
    expect(screen.getByText('The release window has not opened at chain time.')).toBeInTheDocument();

    rerender(
      <HolderConsoleView
        pageState="ready"
        snapshot={{
          ...snapshot,
          exam: sealed,
          keyRegistered: true,
          shareVerified: true,
          randomnessCommitted: true,
          shareSubmitted: true,
          chainTime: sealed.releaseOpensAt,
        }}
        actions={baseActions}
      />,
    );
    expect(screen.getByText('This holder has already submitted a share.')).toBeInTheDocument();

    rerender(
      <HolderConsoleView
        pageState="ready"
        snapshot={{
          ...snapshot,
          exam: sealed,
          keyRegistered: true,
          shareVerified: true,
          randomnessCommitted: true,
          chainTime: sealed.examEndsAt + 1,
        }}
        actions={baseActions}
      />,
    );
    expect(screen.getByText('The release window has closed at chain time.')).toBeInTheDocument();

    rerender(
      <HolderConsoleView
        pageState="ready"
        snapshot={{
          ...snapshot,
          exam: sealed,
          keyRegistered: true,
          shareVerified: true,
          randomnessCommitted: true,
          chainTime: sealed.releaseOpensAt,
        }}
        actions={baseActions}
      />,
    );
    expect(screen.getByRole('button', { name: 'Submit share and reveal' })).toBeEnabled();
  });

  it('keeps secrets out of rendered content after controlled passphrase state is cleared', () => {
    const setupSecret = 'test-only-keystore-passphrase';
    const releaseSecret = 'test-only-release-passphrase';
    const { rerender } = renderConsole({
      actions: createActions({
        setupPassphrase: setupSecret,
        releasePassphrase: releaseSecret,
      }),
    });
    expect((screen.getByLabelText('New keystore passphrase') as HTMLInputElement).value).toBe(setupSecret);
    expect((screen.getByLabelText('Keystore passphrase') as HTMLInputElement).value).toBe(releaseSecret);
    rerender(
      <HolderConsoleView
        pageState="ready"
        snapshot={snapshot}
        actions={createActions()}
      />,
    );
    expect(document.body.innerHTML).not.toContain(setupSecret);
    expect(document.body.innerHTML).not.toContain(releaseSecret);
    expect(document.body.innerHTML).not.toContain('TEST_PRIVATE_KEY');
    expect(document.body.innerHTML).not.toContain('TEST_PLAINTEXT_SHARE');
  });
});

describe('FA-10 holder error messages', () => {
  it.each([
    ['TooEarly', 'TooEarly'],
    ['InvalidShare', 'InvalidShare'],
    ['AlreadySubmitted', 'AlreadySubmitted'],
    ['TooLate', 'TooLate'],
    ['NotAssigned', 'NotAssigned'],
  ])('provides a plain message for %s', (errorName, includedText) => {
    expect(holderContractMessage(errorName)).toContain(includedText);
  });

  it('distinguishes wrong passphrases from corrupted keystores', () => {
    expect(passphraseErrorMessage(new DOMException('decrypt failed', 'OperationError'))).toContain('passphrase is incorrect');
    expect(passphraseErrorMessage(new Error('Invalid keystore JSON'))).toContain('corrupted');
    expect(passphraseErrorMessage(new Error('Unsupported or insecure keystore'))).toContain('unsupported or corrupted');
  });
});
