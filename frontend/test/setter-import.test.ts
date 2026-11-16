import { describe, expect, it } from 'vitest';
import {
  parseQuestionImport,
  validateQuestionDraft,
} from '../src/pages/setter/question-import';
import type { QuestionDraft } from '../src/pages/setter/question-import';

const validDraft: QuestionDraft = {
  text: 'Which value is the acceleration due to gravity?',
  options: ['9.8 m/s2', '3.2 m/s2', '1.6 m/s2', '0 m/s2'],
  correctIndex: '0',
  explanation: 'This is a sample explanation.',
};

function csvRow(values: string[]) {
  return values.map((value) => `"${value.replaceAll('"', '""')}"`).join(',');
}

const csvHeader = 'text,option1,option2,option3,option4,correctIndex,explanation';

describe('FA-09 question validation', () => {
  it('accepts a valid question and rejects invalid text length and control characters', () => {
    expect(validateQuestionDraft(validDraft).question).not.toBeNull();
    expect(validateQuestionDraft({ ...validDraft, text: 'Short' }).errors.text).toBeTruthy();
    expect(validateQuestionDraft({ ...validDraft, text: `${'x'.repeat(2001)}` }).errors.text).toBeTruthy();
    expect(validateQuestionDraft({ ...validDraft, text: 'Question has a tab\tinside it' }).errors.text).toMatch(/control/i);
  });

  it('requires four non-empty, unique options with the permitted length and rejects control characters', () => {
    expect(validateQuestionDraft({ ...validDraft, options: ['A', ' A ', 'C', 'D'] }).errors.option1).toMatch(/unique/i);
    expect(validateQuestionDraft({ ...validDraft, options: ['A', '', 'C', 'D'] }).errors.option2).toMatch(/empty/i);
    expect(validateQuestionDraft({ ...validDraft, options: ['x'.repeat(501), 'B', 'C', 'D'] }).errors.option1).toBeTruthy();
    expect(validateQuestionDraft({ ...validDraft, options: ['A\nB', 'B', 'C', 'D'] }).errors.option1).toMatch(/control/i);
  });

  it('accepts correctIndex 0 through 3 and rejects missing and out-of-range values', () => {
    for (const index of ['0', '1', '2', '3']) {
      expect(validateQuestionDraft({ ...validDraft, correctIndex: index }).question?.correctIndex).toBe(Number(index));
    }
    for (const index of ['', '-1', '4']) {
      expect(validateQuestionDraft({ ...validDraft, correctIndex: index }).errors.correctIndex).toBeTruthy();
    }
  });

  it('allows an optional explanation within limits and rejects overlong or unsafe content', () => {
    expect(validateQuestionDraft({ ...validDraft, explanation: '' }).question).not.toBeNull();
    expect(validateQuestionDraft({ ...validDraft, explanation: 'x'.repeat(2001) }).errors.explanation).toBeTruthy();
    expect(validateQuestionDraft({ ...validDraft, explanation: 'Unsafe\u007ftext' }).errors.explanation).toMatch(/control/i);
  });
});

describe('FA-09 JSON and CSV import', () => {
  it('accepts valid JSON arrays and the questions wrapper shape', () => {
    const result = parseQuestionImport('questions.json', JSON.stringify([{
      text: validDraft.text,
      options: validDraft.options,
      correctIndex: 0,
    }]));
    expect(result.errors).toEqual([]);
    expect(result.questions).toHaveLength(1);
    expect(parseQuestionImport('questions.json', JSON.stringify({ questions: [result.questions[0]] })).questions).toHaveLength(1);
  });

  it('reports each invalid JSON row and accepts no questions when any row is invalid', () => {
    const result = parseQuestionImport('questions.json', JSON.stringify([
      { text: validDraft.text, options: validDraft.options, correctIndex: 0 },
      { text: 'short', options: ['same', ' same ', 'C', 'D'], correctIndex: 4 },
    ]));
    expect(result.questions).toEqual([]);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 2, column: 'text' }),
      expect.objectContaining({ row: 2, column: 'correctIndex' }),
      expect.objectContaining({ row: 2, column: 'options[1]' }),
    ]));
  });

  it('accepts CSV with quoted commas and reports row-level errors for every invalid field', () => {
    const text = [
      csvHeader,
      csvRow(['A question, with a comma?', 'one', 'two', 'three', 'four', '0', '']),
      csvRow(['short', 'same', 'same', 'three', 'four', '8', '']),
    ].join('\n');
    const result = parseQuestionImport('questions.csv', text);
    expect(result.questions).toEqual([]);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 3, column: 'text' }),
      expect.objectContaining({ row: 3, column: 'correctIndex' }),
      expect.objectContaining({ row: 3, column: 'option2' }),
    ]));
  });

  it('rejects invalid files, missing columns, malformed quotes, control characters, empty options and overlong values', () => {
    expect(parseQuestionImport('questions.txt', '').errors[0]?.column).toBe('File');
    expect(parseQuestionImport('questions.json', '{').errors[0]?.column).toBe('JSON');
    expect(parseQuestionImport('questions.csv', 'text,option1\nQ,A').errors[0]?.row).toBe(1);
    expect(parseQuestionImport('questions.csv', `${csvHeader}\n"unfinished`).errors[0]?.column).toBe('CSV');

    const invalidCsv = [
      csvHeader,
      csvRow(['A question\u0001 with a control character?', 'A', 'B', 'C', 'D', '0', '']),
      csvRow([validDraft.text, '  ', 'B', 'C', 'D', '0', '']),
      csvRow([validDraft.text, 'x'.repeat(501), 'B', 'C', 'D', '0', '']),
      csvRow([validDraft.text, 'A', 'B', 'C', 'D', '0', 'x'.repeat(2001)]),
    ].join('\n');
    const result = parseQuestionImport('questions.csv', invalidCsv);
    expect(result.questions).toEqual([]);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 2, column: 'text' }),
      expect.objectContaining({ row: 3, column: 'option1' }),
      expect.objectContaining({ row: 4, column: 'option1' }),
      expect.objectContaining({ row: 5, column: 'explanation' }),
    ]));
  });

  it('enforces the 5 MB cap and 500-question limit', () => {
    expect(parseQuestionImport('questions.json', '[]', 5 * 1024 * 1024 + 1).errors[0]?.problem).toMatch(/5 MB/);
    const tooMany = Array.from({ length: 501 }, () => ({
      text: validDraft.text,
      options: validDraft.options,
      correctIndex: 0,
    }));
    expect(parseQuestionImport('questions.json', JSON.stringify(tooMany)).errors[0]?.row).toBe(501);
  });
});
