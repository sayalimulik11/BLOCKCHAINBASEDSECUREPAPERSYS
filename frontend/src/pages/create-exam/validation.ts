import { AddressSchema, ExamMetaSchema } from '@sigil/core/schemas';
import type { ExamWizardContext, ExamWizardDraft, ExamWizardValidation } from './types';

function parseTimestamp(value: string): number | null {
  if (!value) {
    return null;
  }
  const milliseconds = new Date(value).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds % 1000 !== 0) {
    return null;
  }
  const seconds = milliseconds / 1000;
  return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : null;
}

function roleError(
  address: string,
  role: string,
  participants: ExamWizardContext['participants'],
): string | null {
  const participant = participants.find(
    (candidate) => candidate.address.toLowerCase() === address.toLowerCase(),
  );
  if (!participant?.roles.some((candidate) => candidate.toUpperCase() === role)) {
    return `${address} is not registered as ${role}.`;
  }
  return null;
}

export function validateExamWizard(
  draft: ExamWizardDraft,
  context: ExamWizardContext,
): ExamWizardValidation {
  const errors: Record<string, string> = {};
  const releaseOpensAt = parseTimestamp(draft.releaseOpensAt);
  const examStartsAt = parseTimestamp(draft.examStartsAt);
  const examEndsAt = parseTimestamp(draft.examEndsAt);
  const sections = draft.sections.map((section) => ({
    name: section.name.trim(),
    quota: Number(section.quota),
  }));
  const metadataCandidate = {
    title: draft.title.trim(),
    sections,
    releaseOpensAt: releaseOpensAt ?? -1,
    examStartsAt: examStartsAt ?? -1,
    examEndsAt: examEndsAt ?? -1,
  };
  const parsedMetadata = ExamMetaSchema.safeParse(metadataCandidate);

  if (!parsedMetadata.success) {
    for (const issue of parsedMetadata.error.issues) {
      const field = issue.path[0] === 'sections' ? 'sections' : String(issue.path[0]);
      errors[field] ??= issue.message;
    }
  }
  if (releaseOpensAt === null) {
    errors.releaseOpensAt = 'Enter a valid whole-second release time.';
  }
  if (examStartsAt === null) {
    errors.examStartsAt = 'Enter a valid whole-second exam start time.';
  }
  if (examEndsAt === null) {
    errors.examEndsAt = 'Enter a valid whole-second exam end time.';
  }
  if (
    releaseOpensAt !== null &&
    (context.chainTime === null || context.minLeadSeconds === null)
  ) {
    errors.releaseOpensAt = 'Chain time is unavailable. Retry the chain read before scheduling.';
  } else if (
    releaseOpensAt !== null &&
    context.chainTime !== null &&
    context.minLeadSeconds !== null &&
    releaseOpensAt < context.chainTime + context.minLeadSeconds
  ) {
    errors.releaseOpensAt = `Release must be at least ${context.minLeadSeconds} seconds after chain time.`;
  }

  const holders = draft.holders.map((address) => address.trim());
  const setters = draft.setters.map((address) => address.trim());
  const centres = draft.centres.map((address) => address.trim());
  const threshold = Number(draft.threshold);

  if (holders.length < 3 || holders.length > 20 || holders.some((address) => !address)) {
    errors.holders = 'Enter between 3 and 20 key holders.';
  }
  if (!Number.isInteger(threshold) || threshold <= holders.length / 2 || threshold > holders.length) {
    errors.threshold = 'Threshold must be strictly more than half of the holders and no greater than their count.';
  }
  if (setters.length < 1 || setters.some((address) => !address)) {
    errors.setters = 'Enter at least one paper setter.';
  }
  if (centres.length < 1 || centres.some((address) => !address)) {
    errors.centres = 'Enter at least one examination centre.';
  }

  const panel = [
    ...holders.map((address, index) => ({ address, role: 'HOLDER', key: `holders.${index}` })),
    ...setters.map((address, index) => ({ address, role: 'SETTER', key: `setters.${index}` })),
    ...centres.map((address, index) => ({ address, role: 'CENTRE', key: `centres.${index}` })),
  ];
  const normalizedAddresses = new Set<string>();
  for (const entry of panel) {
    if (!entry.address) {
      continue;
    }
    const parsedAddress = AddressSchema.safeParse(entry.address);
    if (!parsedAddress.success) {
      errors[entry.key] = parsedAddress.error.issues[0]?.message ?? 'Enter a valid checksummed address.';
      continue;
    }
    const normalized = parsedAddress.data.toLowerCase();
    if (normalizedAddresses.has(normalized)) {
      errors[entry.key] ??= 'An account can appear only once in the panel.';
    }
    normalizedAddresses.add(normalized);

    const participantError = roleError(entry.address, entry.role, context.participants);
    if (participantError) {
      errors[entry.key] ??= participantError;
    }
    if (entry.role === 'HOLDER') {
      const keyRegistered = context.encryptionKeys[normalized];
      if (keyRegistered === false) {
        errors[entry.key] ??= 'This holder has no registered encryption key.';
      } else if (keyRegistered === undefined) {
        errors[entry.key] ??= 'The holder encryption key has not been checked yet.';
      }
    }
  }

  if (!parsedMetadata.success || releaseOpensAt === null || examStartsAt === null || examEndsAt === null) {
    return { metadata: null, config: null, errors };
  }

  if (Object.keys(errors).length > 0) {
    return { metadata: null, config: null, errors };
  }

  return {
    metadata: parsedMetadata.data,
    config: {
      releaseOpensAt: BigInt(releaseOpensAt),
      examStartsAt: BigInt(examStartsAt),
      examEndsAt: BigInt(examEndsAt),
      threshold,
      holders,
      setters,
      centres,
      quotas: sections.map((section) => section.quota),
    },
    errors,
  };
}

export function timestampInputValue(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 19);
}
