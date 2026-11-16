import { describe, it, expect } from 'vitest';
import { decodeContractError, ERROR_MAP, STATE_NAMES } from '../src/utils/errors';
import ExamVaultArtifact from '../../packages/contracts-types/dist/ExamVault.json';
import { Interface } from 'ethers';

describe('FA-08: Contract Error Decoder Table-Driven Test Suite', () => {
  const iface = new Interface((ExamVaultArtifact as any).abi);

  // Table of all 22 custom errors from ExamVault.sol (lines 73-96),
  // plus OpenZeppelin AccessControl errors and MetaMask user rejection.
  interface ErrorTestCase {
    name: string;
    description: string;
    input: unknown;
    expectedName: string;
    actionKeyword: string;
  }

  const allTableCases: ErrorTestCase[] = [
    // Spec Section 7.4 errors
    {
      name: 'NotAssigned',
      description: 'account not assigned to exam panel',
      input: 'execution reverted: NotAssigned()',
      expectedName: 'NotAssigned',
      actionKeyword: 'Verify your connected wallet',
    },
    {
      name: 'WrongState',
      description: 'lifecycle state precondition failed',
      input: 'execution reverted: WrongState(2, 1)',
      expectedName: 'WrongState',
      actionKeyword: 'Wait for the required state transition',
    },
    {
      name: 'TooEarly',
      description: 'time window not yet open',
      input: 'execution reverted: TooEarly(1000, 1500)',
      expectedName: 'TooEarly',
      actionKeyword: 'Check the countdown clock',
    },
    {
      name: 'TooLate',
      description: 'deadline passed',
      input: 'execution reverted: TooLate(2000, 1800)',
      expectedName: 'TooLate',
      actionKeyword: 'Check the exam schedule',
    },
    {
      name: 'InvalidTimes',
      description: 'schedule timestamps invalid',
      input: 'execution reverted: InvalidTimes()',
      expectedName: 'InvalidTimes',
      actionKeyword: 'Ensure release opens',
    },
    {
      name: 'InvalidThreshold',
      description: 'threshold not strict majority',
      input: 'execution reverted: InvalidThreshold()',
      expectedName: 'InvalidThreshold',
      actionKeyword: 'Adjust the threshold count',
    },
    {
      name: 'InvalidPanel',
      description: 'panel participant configuration invalid',
      input: 'execution reverted: InvalidPanel()',
      expectedName: 'InvalidPanel',
      actionKeyword: 'Verify that all holders',
    },
    {
      name: 'DuplicateEntry',
      description: 'duplicate address or quota entry',
      input: 'execution reverted: DuplicateEntry()',
      expectedName: 'DuplicateEntry',
      actionKeyword: 'Remove duplicate entries',
    },
    {
      name: 'InvalidKeyFormat',
      description: 'P-256 public key malformed',
      input: 'execution reverted: InvalidKeyFormat()',
      expectedName: 'InvalidKeyFormat',
      actionKeyword: 'Ensure the key is an uncompressed P-256',
    },
    {
      name: 'InvalidShare',
      description: 'decryption share mismatch',
      input: 'execution reverted: InvalidShare()',
      expectedName: 'InvalidShare',
      actionKeyword: 'Check that you unlocked the correct keystore',
    },
    {
      name: 'InvalidReveal',
      description: 'randomness reveal mismatch',
      input: 'execution reverted: InvalidReveal()',
      expectedName: 'InvalidReveal',
      actionKeyword: 'Unlock the correct keystore',
    },
    {
      name: 'AlreadySubmitted',
      description: 'duplicate share or commitment',
      input: 'execution reverted: AlreadySubmitted()',
      expectedName: 'AlreadySubmitted',
      actionKeyword: 'No further action needed',
    },
    {
      name: 'QuotaNotMet',
      description: 'question quota requirement not met',
      input: 'execution reverted: QuotaNotMet(0, 38, 45)',
      expectedName: 'QuotaNotMet',
      actionKeyword: 'Collect and submit all required question batches',
    },
    {
      name: 'MissingCommitment',
      description: 'holder commitment absent at seal',
      input: 'execution reverted: MissingCommitment(0x0000000000000000000000000000000000001234)',
      expectedName: 'MissingCommitment',
      actionKeyword: 'Wait for all assigned key holders',
    },
    {
      name: 'ZeroValue',
      description: 'required parameter is zero or empty',
      input: 'execution reverted: ZeroValue()',
      expectedName: 'ZeroValue',
      actionKeyword: 'Provide valid non-zero values',
    },
    {
      name: 'HolderInLiveExam',
      description: 'key holder in active exam',
      input: 'execution reverted: HolderInLiveExam()',
      expectedName: 'HolderInLiveExam',
      actionKeyword: 'Conclude or cancel live exams',
    },
    // Additive Custom Errors
    {
      name: 'InvalidRole',
      description: 'role identifier invalid',
      input: 'execution reverted: InvalidRole(99)',
      expectedName: 'InvalidRole',
      actionKeyword: 'Select a valid role',
    },
    {
      name: 'CannotGrantAdmin',
      description: 'admin cannot be granted dynamically',
      input: 'execution reverted: CannotGrantAdmin()',
      expectedName: 'CannotGrantAdmin',
      actionKeyword: 'Admin accounts must be assigned during contract deployment',
    },
    {
      name: 'ExamNotFound',
      description: 'exam record missing',
      input: 'execution reverted: ExamNotFound()',
      expectedName: 'ExamNotFound',
      actionKeyword: 'Verify the exam serial number',
    },
    {
      name: 'InvalidQuotas',
      description: 'quota array invalid',
      input: 'execution reverted: InvalidQuotas()',
      expectedName: 'InvalidQuotas',
      actionKeyword: 'Specify between 1 and 8 sections',
    },
    {
      name: 'BatchNotFound',
      description: 'referenced batch not found',
      input: 'execution reverted: BatchNotFound()',
      expectedName: 'BatchNotFound',
      actionKeyword: 'Upload the batch ciphertext',
    },
    {
      name: 'CopyMismatch',
      description: 'centre variant copy hash mismatch',
      input: 'execution reverted: CopyMismatch()',
      expectedName: 'CopyMismatch',
      actionKeyword: 'Check question bank decryption',
    },
    // AccessControl errors
    {
      name: 'AccessControlUnauthorizedAccount',
      description: 'account lacks role authorization',
      input: 'execution reverted: AccessControlUnauthorizedAccount(0x0000000000000000000000000000000000001234, 0x00)',
      expectedName: 'AccessControlUnauthorizedAccount',
      actionKeyword: 'Switch to an account authorized with the appropriate role',
    },
    {
      name: 'AccessControlBadConfirmation',
      description: 'role confirmation does not match',
      input: 'execution reverted: AccessControlBadConfirmation()',
      expectedName: 'AccessControlBadConfirmation',
      actionKeyword: 'Verify the participant account and role confirmation',
    },
    // MetaMask user rejection
    {
      name: 'UserRejected',
      description: 'wallet user cancelled transaction signature',
      input: new Error('MetaMask Tx Signature: User denied transaction signature'),
      expectedName: 'UserRejected',
      actionKeyword: 'Retry the action and confirm the signature in MetaMask',
    },
  ];

  describe.each(allTableCases)(
    'Table-Driven Assertions: $name ($description)',
    ({ name, input, expectedName, actionKeyword }) => {
      it(`decodes ${name} into non-empty message with clear action, no raw error name, and no hex string`, () => {
        const decoded = decodeContractError(input);

        // 1. Correct error classification
        expect(decoded.name).toBe(expectedName);

        // 2. Non-empty message
        expect(decoded.message.trim().length).toBeGreaterThan(0);

        // 3. Contains NO raw error name in message
        expect(decoded.message).not.toContain(name);

        // 4. Contains NO raw hex strings (e.g. 0x...) in message
        expect(decoded.message).not.toMatch(/0x[0-9a-fA-F]+/i);

        // 5. Says what to do next (non-empty action with expected guidance)
        expect(decoded.action.trim().length).toBeGreaterThan(0);
        expect(decoded.action).toContain(actionKeyword);

        // 6. Contains NO raw hex strings in action
        expect(decoded.action).not.toMatch(/0x[0-9a-fA-F]+/i);

        // 7. Formatted combines both without apologies
        expect(decoded.formatted).toContain(decoded.message);
        expect(decoded.formatted).toContain(decoded.action);
        expect(decoded.formatted.toLowerCase()).not.toContain('sorry');
        expect(decoded.formatted.toLowerCase()).not.toContain('apologize');
      });
    }
  );

  describe('Errors with Arguments in Plain Words', () => {
    it('WrongState formats expected and actual lifecycle states in plain words', () => {
      // Test via ABI-encoded revert data: WrongState(Sealed=2, Collecting=1)
      const data = iface.encodeErrorResult('WrongState', [2, 1]);
      const decoded = decodeContractError({ data });

      expect(decoded.name).toBe('WrongState');
      expect(decoded.message).toBe(
        'The exam is in the wrong lifecycle state: expected Sealed, but actual is Collecting.'
      );
      expect(decoded.message).not.toContain('WrongState');
      expect(decoded.message).not.toMatch(/0x[0-9a-fA-F]+/i);
      expect(decoded.action).toContain('Wait for the required state transition before retrying.');
    });

    it('TooEarly formats current chain time and opening time in plain words with duration', () => {
      // Test via ABI-encoded revert data: nowTime = 1000, allowedFrom = 1500
      const data = iface.encodeErrorResult('TooEarly', [1000n, 1500n]);
      const decoded = decodeContractError({ data });

      expect(decoded.name).toBe('TooEarly');
      expect(decoded.message).toContain('Current chain time is 1000; window opens at 1500 (in 500 seconds).');
      expect(decoded.message).not.toContain('TooEarly');
      expect(decoded.message).not.toMatch(/0x[0-9a-fA-F]+/i);
      expect(decoded.action).toContain('Check the countdown clock and submit once the window opens.');
    });

    it('TooLate formats current chain time and expired deadline in plain words', () => {
      // Test via ABI-encoded revert data: nowTime = 2000, allowedUntil = 1800
      const data = iface.encodeErrorResult('TooLate', [2000n, 1800n]);
      const decoded = decodeContractError({ data });

      expect(decoded.name).toBe('TooLate');
      expect(decoded.message).toContain('Current chain time is 2000, but the deadline was 1800.');
      expect(decoded.message).not.toContain('TooLate');
      expect(decoded.message).not.toMatch(/0x[0-9a-fA-F]+/i);
      expect(decoded.action).toContain('Check the exam schedule; no further submissions can be accepted.');
    });

    it('QuotaNotMet formats section name, required quota, and current bank count in plain words', () => {
      // 1. With named section 'physics', have: 38, need: 45 (exact spec example)
      const namedDecoded = decodeContractError({
        name: 'QuotaNotMet',
        args: { sectionName: 'physics', have: 38, need: 45 },
      });
      expect(namedDecoded.name).toBe('QuotaNotMet');
      expect(namedDecoded.message).toBe('Seal needs 45 physics questions; the bank has 38.');
      expect(namedDecoded.action).toBe('Collect and submit all required question batches before sealing the exam.');
      expect(namedDecoded.message).not.toContain('QuotaNotMet');
      expect(namedDecoded.message).not.toMatch(/0x[0-9a-fA-F]+/i);

      // 2. With ABI-encoded data: sectionId 0, have 10, need 50
      const data = iface.encodeErrorResult('QuotaNotMet', [0, 10, 50]);
      const abiDecoded = decodeContractError({ data });
      expect(abiDecoded.name).toBe('QuotaNotMet');
      expect(abiDecoded.message).toBe('Seal needs 50 section 0 questions; the bank has 10.');
      expect(abiDecoded.message).not.toContain('QuotaNotMet');
      expect(abiDecoded.message).not.toMatch(/0x[0-9a-fA-F]+/i);

      // 3. String revert format: QuotaNotMet(1, 15, 30)
      const strDecoded = decodeContractError('execution reverted: QuotaNotMet(1, 15, 30)');
      expect(strDecoded.name).toBe('QuotaNotMet');
      expect(strDecoded.message).toBe('Seal needs 30 section 1 questions; the bank has 15.');
    });

    it('MissingCommitment formats key holder details in plain words without exposing raw hex', () => {
      // 1. With plain text holder name
      const nameDecoded = decodeContractError({
        name: 'MissingCommitment',
        args: { holder: 'Key Holder 1' },
      });
      expect(nameDecoded.name).toBe('MissingCommitment');
      expect(nameDecoded.message).toBe('A key holder commitment is missing for Key Holder 1.');
      expect(nameDecoded.message).not.toContain('MissingCommitment');
      expect(nameDecoded.message).not.toMatch(/0x[0-9a-fA-F]+/i);

      // 2. With Ethereum hex address via ABI-encoded data
      const data = iface.encodeErrorResult('MissingCommitment', [
        '0x0000000000000000000000000000000000001234',
      ]);
      const addrDecoded = decodeContractError({ data });
      expect(addrDecoded.name).toBe('MissingCommitment');
      expect(addrDecoded.message).toContain('ending in ...1234');
      // Must not leak raw 0x... hex address into user message
      expect(addrDecoded.message).not.toMatch(/0x[0-9a-fA-F]+/i);
      expect(addrDecoded.action).toContain('Wait for all assigned key holders to submit commitments');
    });
  });

  describe('ABI Completeness Guarantee', () => {
    it('fails if any custom error in packages/contracts-types ABI has no mapping in ERROR_MAP', () => {
      const abiErrors = ((ExamVaultArtifact as any).abi as any[]).filter((x) => x.type === 'error');
      expect(abiErrors.length).toBeGreaterThanOrEqual(22);

      for (const err of abiErrors) {
        const errorMapping = ERROR_MAP[err.name];
        expect(
          errorMapping,
          `Custom error "${err.name}" from ExamVault ABI has no mapping in ERROR_MAP`
        ).toBeDefined();

        // Ensure invoking with empty args produces valid plain-language message and action
        const result = errorMapping();
        expect(result.message.trim().length, `Error "${err.name}" produces empty message`).toBeGreaterThan(0);
        expect(result.action.trim().length, `Error "${err.name}" produces empty action`).toBeGreaterThan(0);
        expect(result.message, `Error "${err.name}" message contains raw error name`).not.toContain(err.name);
        expect(result.message, `Error "${err.name}" message contains raw hex`).not.toMatch(/0x[0-9a-fA-F]+/i);
        expect(result.action, `Error "${err.name}" action contains raw hex`).not.toMatch(/0x[0-9a-fA-F]+/i);
      }
    });
  });

  describe('Safe Fallback for Unknown Errors', () => {
    it('provides safe, plain-language fallback for null and undefined', () => {
      const nullErr = decodeContractError(null);
      expect(nullErr.name).toBe('UnknownError');
      expect(nullErr.message).toBe('An unexpected transaction error occurred.');
      expect(nullErr.action).toContain('Verify your wallet network connection');
      expect(nullErr.message).not.toMatch(/0x[0-9a-fA-F]+/i);

      const undefErr = decodeContractError(undefined);
      expect(undefErr.name).toBe('UnknownError');
    });

    it('provides safe fallback for empty object or unrecognized error string', () => {
      const emptyObj = decodeContractError({});
      expect(emptyObj.name).toBe('UnknownError');

      const rawPanic = decodeContractError('execution reverted with panic code 0x4e (assertion error)');
      expect(rawPanic.name).toBe('UnknownError');
      expect(rawPanic.formatted).toContain('unexpected transaction error occurred');
      expect(rawPanic.action).toContain('Verify your wallet network connection');
    });

    it('provides safe fallback for generic Error instance', () => {
      const generic = decodeContractError(new Error('Internal RPC timeout socket hang up'));
      expect(generic.name).toBe('UnknownError');
      expect(generic.message).toBe('An unexpected transaction error occurred.');
    });
  });
});
