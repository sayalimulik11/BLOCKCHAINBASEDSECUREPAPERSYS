import { describe, expect, it } from 'vitest';
import { timestampInputValue, validateExamWizard } from '../src/pages/create-exam/validation';
import type { ExamWizardContext, ExamWizardDraft } from '../src/pages/create-exam/types';

const now = 1_800_000_000;
const holders = [
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
];
const setter = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';
const centre = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';

function validDraft(): ExamWizardDraft {
  return {
    title: 'Regional Physics Examination',
    sections: [{ name: 'Physics', quota: '45' }],
    releaseOpensAt: timestampInputValue(now + 3_600),
    examStartsAt: timestampInputValue(now + 7_200),
    examEndsAt: timestampInputValue(now + 14_400),
    threshold: '2',
    holders: holders.slice(),
    setters: [setter],
    centres: [centre],
  };
}

function validContext(overrides: Partial<ExamWizardContext> = {}): ExamWizardContext {
  return {
    participants: [
      ...holders.map((address) => ({ address, roles: ['HOLDER'] })),
      { address: setter, roles: ['SETTER'] },
      { address: centre, roles: ['CENTRE'] },
    ],
    encryptionKeys: Object.fromEntries(holders.map((address) => [address.toLowerCase(), true])),
    chainTime: now,
    minLeadSeconds: 60,
    ...overrides,
  };
}

function validate(draft = validDraft(), context = validContext()) {
  return validateExamWizard(draft, context);
}

describe('FA-06a exam wizard validation', () => {
  it('accepts a valid exam and returns typed metadata and contract configuration', () => {
    const result = validate();
    expect(result.errors).toEqual({});
    expect(result.metadata?.title).toBe('Regional Physics Examination');
    expect(result.config?.holders).toEqual(holders);
    expect(result.config?.threshold).toBe(2);
    expect(result.config?.quotas).toEqual([45]);
  });

  it('enforces the trimmed title length of 5 to 120 characters', () => {
    const short = validDraft();
    short.title = '  Exam  ';
    expect(validate(short).errors.title).toBeDefined();

    const long = validDraft();
    long.title = 'x'.repeat(121);
    expect(validate(long).errors.title).toBeDefined();
  });

  it('requires 1 to 8 sections with unique names from 2 to 40 characters', () => {
    const empty = validDraft();
    empty.sections = [];
    expect(validate(empty).errors.sections).toBeDefined();

    const tooMany = validDraft();
    tooMany.sections = Array.from({ length: 9 }, (_, index) => ({ name: `S${index}`, quota: '1' }));
    expect(validate(tooMany).errors.sections).toBeDefined();

    const shortName = validDraft();
    shortName.sections[0] = { name: 'P', quota: '1' };
    expect(validate(shortName).errors.sections).toBeDefined();

    const longName = validDraft();
    longName.sections[0] = { name: 'x'.repeat(41), quota: '1' };
    expect(validate(longName).errors.sections).toBeDefined();

    const duplicate = validDraft();
    duplicate.sections.push({ name: ' Physics ', quota: '2' });
    expect(validate(duplicate).errors.sections).toMatch(/unique/i);
  });

  it('enforces integer quotas from 1 to 500', () => {
    for (const quota of ['0', '501', '2.5', '']) {
      const draft = validDraft();
      draft.sections[0]!.quota = quota;
      expect(validate(draft).errors.sections).toBeDefined();
    }
  });

  it('requires valid whole-second schedule timestamps in strict order', () => {
    const invalid = validDraft();
    invalid.releaseOpensAt = 'not-a-time';
    expect(validate(invalid).errors.releaseOpensAt).toMatch(/whole-second/i);

    const outOfOrder = validDraft();
    outOfOrder.examStartsAt = timestampInputValue(now + 1_800);
    expect(validate(outOfOrder).errors.releaseOpensAt).toBeDefined();
  });

  it('enforces a maximum six-hour release window and the contract lead time', () => {
    const tooLong = validDraft();
    tooLong.examStartsAt = timestampInputValue(now + 7 * 60 * 60 + 1);
    tooLong.examEndsAt = timestampInputValue(now + 8 * 60 * 60 + 1);
    expect(validate(tooLong).errors.releaseOpensAt).toMatch(/six hours/i);

    const tooSoon = validDraft();
    tooSoon.releaseOpensAt = timestampInputValue(now + 59);
    expect(validate(tooSoon).errors.releaseOpensAt).toMatch(/at least 60 seconds/i);
  });

  it('requires between 3 and 20 holders', () => {
    const tooFew = validDraft();
    tooFew.holders = holders.slice(0, 2);
    expect(validate(tooFew).errors.holders).toBeDefined();

    const tooMany = validDraft();
    tooMany.holders = Array.from({ length: 21 }, (_, index) => {
      const hex = (index + 1).toString(16).padStart(40, '0');
      return `0x${hex}`;
    });
    expect(validate(tooMany).errors.holders).toBeDefined();
  });

  it('requires a whole-number strict majority threshold no greater than n', () => {
    const evenPanel = validDraft();
    evenPanel.holders.push('0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65');
    evenPanel.threshold = '2';
    expect(validate(evenPanel).errors.threshold).toBeDefined();

    const overPanel = validDraft();
    overPanel.threshold = '4';
    expect(validate(overPanel).errors.threshold).toBeDefined();

    const fraction = validDraft();
    fraction.threshold = '2.5';
    expect(validate(fraction).errors.threshold).toBeDefined();
  });

  it('requires at least one setter and one centre', () => {
    const noSetters = validDraft();
    noSetters.setters = [];
    expect(validate(noSetters).errors.setters).toBeDefined();

    const noCentres = validDraft();
    noCentres.centres = [];
    expect(validate(noCentres).errors.centres).toBeDefined();
  });

  it('requires checksummed, non-zero addresses and rejects duplicate panel accounts', () => {
    const lowercase = validDraft();
    lowercase.holders[0] = holders[0]!.toLowerCase();
    expect(validate(lowercase).errors['holders.0']).toBeDefined();

    const zero = validDraft();
    zero.centres[0] = '0x0000000000000000000000000000000000000000';
    expect(validate(zero).errors['centres.0']).toBeDefined();

    const duplicate = validDraft();
    duplicate.setters[0] = holders[0]!;
    expect(validate(duplicate).errors['setters.0']).toMatch(/only once/i);
  });

  it('requires the matching on-chain role for every panel address', () => {
    const context = validContext({
      participants: [
        ...holders.map((address) => ({ address, roles: ['SETTER'] })),
        { address: setter, roles: ['HOLDER'] },
        { address: centre, roles: ['AUTHORITY'] },
      ],
    });
    const result = validate(validDraft(), context);
    expect(result.errors['holders.0']).toMatch(/HOLDER/);
    expect(result.errors['setters.0']).toMatch(/SETTER/);
    expect(result.errors['centres.0']).toMatch(/CENTRE/);
  });

  it('requires every holder to have a checked registered encryption key', () => {
    const missing = validContext({
      encryptionKeys: { [holders[0]!.toLowerCase()]: true, [holders[1]!.toLowerCase()]: false, [holders[2]!.toLowerCase()]: true },
    });
    expect(validate(validDraft(), missing).errors['holders.1']).toMatch(/no registered encryption key/i);

    const unchecked = validContext({ encryptionKeys: {} });
    expect(validate(validDraft(), unchecked).errors['holders.0']).toMatch(/not been checked/i);
  });

  it('requires a live chain timestamp to enforce the lead-time rule', () => {
    const context = validContext({ chainTime: null, minLeadSeconds: null });
    expect(validate(validDraft(), context).errors.releaseOpensAt).toMatch(/chain time is unavailable/i);
  });
});
