import { QuestionSchema } from '@sigil/core/schemas';
import type { QuestionPlain } from '@sigil/core/types';

export interface QuestionImportError {
  row: number;
  column: string;
  problem: string;
}

export interface QuestionImportResult {
  questions: QuestionPlain[];
  errors: QuestionImportError[];
}

export interface QuestionDraft {
  text: string;
  options: [string, string, string, string];
  correctIndex: string;
  explanation: string;
}

export interface QuestionValidationResult {
  question: QuestionPlain | null;
  errors: Readonly<Record<string, string>>;
}

const REQUIRED_CSV_COLUMNS = [
  'text',
  'option1',
  'option2',
  'option3',
  'option4',
  'correctIndex',
] as const;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 500;

export function validateQuestionDraft(draft: QuestionDraft): QuestionValidationResult {
  const errors: Record<string, string> = {};
  const correctIndex = /^\d+$/.test(draft.correctIndex) ? Number(draft.correctIndex) : Number.NaN;
  const candidate = {
    text: draft.text,
    options: draft.options,
    correctIndex,
    ...(draft.explanation.length > 0 ? { explanation: draft.explanation } : {}),
  };
  const result = QuestionSchema.safeParse(candidate);

  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0] === 'options'
        ? typeof issue.path[1] === 'number'
          ? `option${issue.path[1] + 1}`
          : 'options'
        : String(issue.path[0] ?? 'question');
      errors[field] ??= issue.message;
    }
  }

  const trimmedOptions = draft.options.map((option) => option.trim());
  for (let index = 0; index < trimmedOptions.length; index += 1) {
    if (!trimmedOptions[index]) {
      errors[`option${index + 1}`] = 'Option must not be empty.';
    }
  }
  for (let first = 0; first < trimmedOptions.length; first += 1) {
    if (!trimmedOptions[first]) continue;
    for (let second = first + 1; second < trimmedOptions.length; second += 1) {
      if (trimmedOptions[first] === trimmedOptions[second]) {
        errors[`option${first + 1}`] = 'Options must be unique after trimming.';
        errors[`option${second + 1}`] = 'Options must be unique after trimming.';
      }
    }
  }

  if (Object.keys(errors).length > 0 || !result.success) {
    return { question: null, errors };
  }
  return { question: result.data as QuestionPlain, errors };
}

function parseCsv(text: string): { rows: string[][]; malformed: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let malformed = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? '';
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else if (character === '"') {
      malformed = true;
    } else {
      field += character;
    }
  }

  if (quoted) malformed = true;
  row.push(field);
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return { rows, malformed };
}

function questionRowErrors(value: unknown, row: number, csv = false): QuestionImportError[] {
  const parsed = QuestionSchema.safeParse(value);
  const errors: QuestionImportError[] = [];
  if (parsed.success && typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const options = Array.isArray(record.options) ? record.options : [];
    if (options.some((option) => typeof option !== 'string' || option.trim().length === 0)) {
      options.forEach((option, index) => {
        if (typeof option !== 'string' || option.trim().length === 0) {
          errors.push({
            row,
            column: csv ? `option${index + 1}` : `options[${index}]`,
            problem: 'Option must not be empty.',
          });
        }
      });
    }
    const trimmed = options.map((option) => typeof option === 'string' ? option.trim() : '');
    trimmed.forEach((option, index) => {
      if (!option) return;
      for (let other = index + 1; other < trimmed.length; other += 1) {
        if (option === trimmed[other]) {
          errors.push({
            row,
            column: csv ? `option${other + 1}` : `options[${other}]`,
            problem: 'Options must be unique after trimming.',
          });
        }
      }
    });
    return errors;
  }

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      if (issue.path[0] === 'options' && issue.message === 'Options must be unique') {
        const record = typeof value === 'object' && value !== null
          ? value as Record<string, unknown>
          : {};
        const options = Array.isArray(record.options) ? record.options : [];
        const seen = new Set<string>();
        options.forEach((option, index) => {
          if (typeof option !== 'string') return;
          const normalized = option.trim();
          if (!normalized || !seen.has(normalized)) {
            seen.add(normalized);
            return;
          }
          errors.push({
            row,
            column: csv ? `option${index + 1}` : `options[${index}]`,
            problem: issue.message,
          });
        });
        continue;
      }
      const path = issue.path[0] === 'options' && typeof issue.path[1] === 'number'
        ? csv
          ? `option${issue.path[1] + 1}`
          : `options[${issue.path[1]}]`
        : String(issue.path[0] ?? 'question');
      errors.push({ row, column: path, problem: issue.message });
    }
  }
  return errors;
}

function normalizeJsonQuestion(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.options)) return value;
  return {
    ...record,
    options: record.options,
  };
}

export function parseQuestionImport(
  filename: string,
  text: string,
  sizeBytes = new TextEncoder().encode(text).byteLength,
): QuestionImportResult {
  if (sizeBytes > MAX_FILE_BYTES) {
    return { questions: [], errors: [{ row: 0, column: 'File', problem: 'Import file must be 5 MB or smaller.' }] };
  }

  const extension = filename.split('.').pop()?.toLowerCase();
  if (extension !== 'json' && extension !== 'csv') {
    return { questions: [], errors: [{ row: 0, column: 'File', problem: 'Choose a JSON or CSV file.' }] };
  }

  if (extension === 'json') {
    let rows: unknown[];
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) {
        rows = parsed;
      } else if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'questions' in parsed &&
        Array.isArray(parsed.questions)
      ) {
        rows = parsed.questions;
      } else {
        return { questions: [], errors: [{ row: 1, column: 'JSON', problem: 'Expected an array of questions.' }] };
      }
    } catch {
      return { questions: [], errors: [{ row: 1, column: 'JSON', problem: 'The JSON file is not valid.' }] };
    }
    if (rows.length > MAX_ROWS) {
      return { questions: [], errors: [{ row: MAX_ROWS + 1, column: 'JSON', problem: 'A batch can contain at most 500 questions.' }] };
    }
    const questions: QuestionPlain[] = [];
    const errors: QuestionImportError[] = [];
    rows.forEach((value, index) => {
      const normalized = normalizeJsonQuestion(value);
      const rowErrors = questionRowErrors(normalized, index + 1);
      errors.push(...rowErrors);
      if (rowErrors.length === 0) {
        const result = QuestionSchema.safeParse(normalized);
        if (result.success) questions.push(result.data as QuestionPlain);
      }
    });
    return { questions: errors.length === 0 ? questions : [], errors };
  }

  const { rows, malformed } = parseCsv(text);
  if (malformed) {
    return { questions: [], errors: [{ row: 1, column: 'CSV', problem: 'The CSV file contains an unterminated or misplaced quote.' }] };
  }
  const header = (rows[0] ?? []).map((value) => value.trim());
  const headerIndexes = new Map(header.map((value, index) => [value.toLowerCase(), index]));
  const missingColumns = REQUIRED_CSV_COLUMNS.filter((column) => !headerIndexes.has(column.toLowerCase()));
  if (missingColumns.length > 0) {
    return {
      questions: [],
      errors: missingColumns.map((column) => ({ row: 1, column, problem: 'Required CSV column is missing.' })),
    };
  }
  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_ROWS) {
    return { questions: [], errors: [{ row: MAX_ROWS + 2, column: 'CSV', problem: 'A batch can contain at most 500 questions.' }] };
  }
  const questions: QuestionPlain[] = [];
  const errors: QuestionImportError[] = [];
  dataRows.forEach((cells, index) => {
    const read = (column: string) => cells[headerIndexes.get(column.toLowerCase()) ?? -1] ?? '';
    const correctIndexText = read('correctIndex');
    const candidate = {
      text: read('text'),
      options: [read('option1'), read('option2'), read('option3'), read('option4')],
      correctIndex: /^\d+$/.test(correctIndexText) ? Number(correctIndexText) : Number.NaN,
      ...(headerIndexes.has('explanation') && read('explanation')
        ? { explanation: read('explanation') }
        : {}),
    };
    const rowNumber = index + 2;
    const rowErrors = questionRowErrors(candidate, rowNumber, true);
    for (let optionIndex = 0; optionIndex < 4; optionIndex += 1) {
      if (!candidate.options[optionIndex]?.trim()) {
        rowErrors.push({
          row: rowNumber,
          column: `option${optionIndex + 1}`,
          problem: 'Option must not be empty.',
        });
      }
    }
    errors.push(...rowErrors);
    if (rowErrors.length === 0) {
      const result = QuestionSchema.safeParse(candidate);
      if (result.success) questions.push(result.data as QuestionPlain);
    }
  });
  return { questions: errors.length === 0 ? questions : [], errors };
}
