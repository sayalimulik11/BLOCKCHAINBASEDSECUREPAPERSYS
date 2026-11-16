export interface PassphraseStrength {
  level: 0 | 1 | 2 | 3;
  label: 'Enter a passphrase' | 'Weak' | 'Fair' | 'Strong';
}

export function passphraseStrength(value: string): PassphraseStrength {
  if (!value) return { level: 0, label: 'Enter a passphrase' };
  const classes = [
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /\d/.test(value),
    /[^a-zA-Z0-9]/.test(value),
  ].filter(Boolean).length;
  const score = Math.min(3, Number(value.length >= 12) + Number(value.length >= 16) + Number(classes >= 3));
  if (score <= 1) return { level: score as 0 | 1, label: 'Weak' };
  if (score === 2) return { level: 2, label: 'Fair' };
  return { level: 3, label: 'Strong' };
}

export function holderContractMessage(errorName: string): string | null {
  const messages: Record<string, string> = {
    TooEarly: 'The release window has not opened at chain time (TooEarly).',
    TooLate: 'The release window has closed at chain time (TooLate).',
    NotAssigned: 'This wallet is not assigned as a holder for this exam (NotAssigned).',
    InvalidShare: 'The submitted share was rejected by the contract (InvalidShare).',
    InvalidReveal: 'The randomness reveal was rejected by the contract (InvalidReveal).',
    AlreadySubmitted: 'This holder has already submitted a share for this exam (AlreadySubmitted).',
    MissingCommitment: 'Commit your randomness before submitting the share (MissingCommitment).',
  };
  return messages[errorName] ?? null;
}

export function passphraseErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === 'Invalid keystore JSON') {
    return 'The keystore file is corrupted or is not a SIGIL keystore.';
  }
  if (
    error instanceof DOMException && error.name === 'OperationError'
  ) {
    return 'The passphrase is incorrect, or the keystore file is corrupted.';
  }
  if (error instanceof Error && /unsupported or insecure keystore/i.test(error.message)) {
    return 'The keystore file is unsupported or corrupted.';
  }
  return error instanceof Error ? error.message : 'The keystore could not be unlocked.';
}
