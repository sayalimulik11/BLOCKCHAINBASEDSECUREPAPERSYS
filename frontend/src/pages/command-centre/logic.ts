import type { ExamState } from '@sigil/ui';
import type { SectionQuestionCount } from './types';

const EMPTY_BYTES32 = `0x${'0'.repeat(64)}`;

export function examStateFromChain(state: number): ExamState | null {
  const states: readonly ExamState[] = [
    'Draft',
    'Collecting',
    'Sealed',
    'Released',
    'Concluded',
    'Cancelled',
  ];
  return states[state] ?? null;
}

export function selectRosetteHash(
  state: ExamState,
  metaHash: string,
  bankHash: string,
): string {
  if (state === 'Draft' || state === 'Collecting') {
    return metaHash;
  }
  return bankHash.toLowerCase() === EMPTY_BYTES32 ? metaHash : bankHash;
}

export function sealDisabledReason(
  state: ExamState,
  sections: readonly SectionQuestionCount[],
  allHoldersCommittedRandomness: boolean,
): string | null {
  if (state !== 'Collecting') {
    return 'Seal exam is available only while collection is open.';
  }

  const incompleteSection = sections.find(
    (section) => section.questionCount !== section.quota,
  );
  if (incompleteSection) {
    if (incompleteSection.questionCount < incompleteSection.quota) {
      return `Seal needs ${incompleteSection.quota} ${incompleteSection.name} questions; the bank has ${incompleteSection.questionCount}.`;
    }
    return `Seal needs exactly ${incompleteSection.quota} ${incompleteSection.name} questions; the bank has ${incompleteSection.questionCount}.`;
  }

  if (!allHoldersCommittedRandomness) {
    return 'Seal needs randomness commitments from every key holder.';
  }

  return null;
}

export function concludeDisabledReason(
  state: ExamState,
  chainTime: number,
  examEndsAt: number,
): string | null {
  if (state === 'Concluded') {
    return 'This exam is already concluded.';
  }
  if (state === 'Cancelled') {
    return 'A cancelled exam cannot be concluded.';
  }
  if (state !== 'Released') {
    return 'Conclude exam is available only after the exam is released.';
  }
  if (chainTime < examEndsAt) {
    return `Conclude exam is available after the exam ends at ${new Date(examEndsAt * 1000).toISOString().replace('T', ' ').slice(0, 16)} UTC.`;
  }
  return null;
}
