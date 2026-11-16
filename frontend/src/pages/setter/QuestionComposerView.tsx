import React, { useMemo, useState } from 'react';
import type { QuestionPlain } from '@sigil/core/types';
import { Button, EmptyState, Field, HashChip } from '@sigil/ui';
import { validateQuestionDraft } from './question-import';
import type { QuestionDraft } from './question-import';
import type { QuestionComposerViewProps, SubmissionStep } from './types';
import './setter.css';

const EMPTY_DRAFT: QuestionDraft = {
  text: '',
  options: ['', '', '', ''],
  correctIndex: '',
  explanation: '',
};

function PageState({
  state,
  error,
  retry,
}: {
  state: QuestionComposerViewProps['pageState'];
  error?: Error | null;
  retry?: () => void;
}) {
  if (state === 'loading') {
    return (
      <section className="setter-state setter-state--composer-loading" aria-label="Loading question composer">
        <div className="setter-skeleton" />
        <div className="setter-skeleton setter-skeleton--table" />
      </section>
    );
  }
  if (state === 'permission') {
    return (
      <section className="setter-state" role="alert">
        <h1>Paper Setter role required</h1>
        <p>This wallet is not assigned to this exam as a setter.</p>
      </section>
    );
  }
  if (state === 'empty') {
    return (
      <EmptyState
        title="Exam not found"
        description="Open an assigned exam from Setter assignments to compose a question batch."
      />
    );
  }
  if (state === 'error') {
    return (
      <section className="setter-state" role="alert">
        <h1>Unable to load question composer</h1>
        <p>{error?.message ?? 'Exam metadata and question-bank data are unavailable.'}</p>
        <Button type="button" onClick={retry}>Retry connection</Button>
      </section>
    );
  }
  return null;
}

function stepText(step: SubmissionStep) {
  if (step === 'complete') return 'Complete';
  if (step === 'active') return 'In progress';
  if (step === 'error') return 'Failed';
  return 'Pending';
}

export function QuestionComposerView(props: QuestionComposerViewProps) {
  const {
    pageState,
    exam,
    submissions,
    importErrors,
    progress,
    statusMessage,
    actionError,
    hasPreparedBatch = false,
    error,
    onRetry,
    onImport,
    onSubmit,
  } = props;
  const [draft, setDraft] = useState<QuestionDraft>(EMPTY_DRAFT);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);
  const [questions, setQuestions] = useState<QuestionPlain[]>([]);
  const [selectedSection, setSelectedSection] = useState('0');
  const [localImportErrors, setLocalImportErrors] = useState<QuestionImportViewError[]>([]);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const validation = useMemo(() => validateQuestionDraft(draft), [draft]);

  if (pageState !== 'ready') {
    return <PageState state={pageState} error={error} retry={onRetry} />;
  }
  if (!exam) return null;

  const sectionId = Number(selectedSection);
  const currentSection = exam.sections.find((section) => section.sectionId === sectionId);
  const stagedForSection = questions.length;
  const sectionCount = (currentSection?.submitted ?? 0) + stagedForSection;
  const quota = currentSection?.quota ?? 0;
  const quotaPercent = quota > 0 ? Math.min(100, Math.round((sectionCount / quota) * 100)) : 0;
  const displayedImportErrors = localImportErrors.length > 0 ? localImportErrors : importErrors;
  const hasSubmissionActivity = Object.values(progress).some((step) => step !== 'pending');

  const updateDraft = <K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const fieldError = (key: string) => (attempted || touched[key] ? validation.errors[key] : undefined);

  const addQuestion = () => {
    setAttempted(true);
    setLocalMessage(null);
    const question = validation.question;
    if (!question) return;
    if (questions.length >= 500) {
      setLocalMessage('A batch can contain at most 500 questions.');
      return;
    }
    setQuestions((current) => [...current, question]);
    setDraft(EMPTY_DRAFT);
    setTouched({});
    setAttempted(false);
  };

  const importFile = async (file: File) => {
    setLocalMessage(null);
    setLocalImportErrors([]);
    try {
      const result = await onImport(file);
      if (result.errors.length > 0) {
        setLocalImportErrors(result.errors);
        return;
      }
      if (questions.length + result.questions.length > 500) {
        setLocalImportErrors([{
          row: 0,
          column: 'Batch',
          problem: 'A batch can contain at most 500 questions.',
        }]);
        return;
      }
      setQuestions((current) => [...current, ...result.questions]);
      setLocalMessage(`${result.questions.length} questions passed validation and were added to the batch preview.`);
    } catch (thrownError) {
      setLocalImportErrors([{
        row: 0,
        column: 'File',
        problem: thrownError instanceof Error ? thrownError.message : 'The import file could not be read.',
      }]);
    }
  };

  const submitBatch = async () => {
    if (!currentSection || questions.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    setLocalMessage(null);
    try {
      await onSubmit(sectionId, questions);
      setQuestions([]);
      setLocalMessage('The encrypted batch was submitted.');
    } catch {
      return;
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="setter-page question-composer" aria-labelledby="question-composer-title">
      <header className="setter-page__header">
        <div>
          <p className="sigil-mono">No. {exam.examId.padStart(4, '0')}</p>
          <h1 id="question-composer-title">Question composer</h1>
          <p>{exam.title}</p>
        </div>
        <label className="setter-section-select">
          <span>Section</span>
          <select
            value={selectedSection}
            onChange={(event) => setSelectedSection(event.currentTarget.value)}
            disabled={questions.length > 0 || hasPreparedBatch || isSubmitting}
            aria-label="Question section"
          >
            {exam.sections.map((section) => (
              <option key={section.sectionId} value={section.sectionId}>{section.name}</option>
            ))}
          </select>
        </label>
      </header>

      <div className="question-composer__grid">
        <section className="question-composer__form" aria-labelledby="single-question-title">
          <h2 id="single-question-title">Add a question</h2>
          <label className="setter-textarea-field" htmlFor="question-text">
            Question text
            <textarea
              id="question-text"
              value={draft.text}
              disabled={hasPreparedBatch || isSubmitting}
              minLength={10}
              maxLength={2000}
              onChange={(event) => updateDraft('text', event.currentTarget.value)}
              onBlur={() => setTouched((current) => ({ ...current, text: true }))}
              aria-invalid={Boolean(fieldError('text'))}
              aria-describedby={fieldError('text') ? 'question-text-error' : undefined}
            />
            {fieldError('text') && <span id="question-text-error" className="setter-field-error">{fieldError('text')}</span>}
          </label>
          <fieldset className="question-composer__options">
            <legend>Answer options</legend>
            {draft.options.map((option, index) => {
              const errorKey = `option${index + 1}`;
              return (
                <div className="question-composer__option" key={index}>
                  <Field
                    label={`Option ${index + 1}`}
                    value={option}
                    disabled={hasPreparedBatch || isSubmitting}
                    maxLength={500}
                    onChange={(event) => {
                      const options = draft.options.slice() as QuestionDraft['options'];
                      options[index] = event.currentTarget.value;
                      updateDraft('options', options);
                    }}
                    onBlur={() => setTouched((current) => ({ ...current, [errorKey]: true }))}
                    error={fieldError(errorKey)}
                  />
                  <label>
                    <input
                      type="radio"
                      name="correct-option"
                      value={index}
                      checked={draft.correctIndex === String(index)}
                      disabled={hasPreparedBatch || isSubmitting}
                      onChange={() => updateDraft('correctIndex', String(index))}
                    />
                    Correct
                  </label>
                </div>
              );
            })}
          </fieldset>
          {fieldError('correctIndex') && <p className="setter-field-error" role="alert">{fieldError('correctIndex')}</p>}
          <Field
            label="Explanation (optional)"
            value={draft.explanation}
            disabled={hasPreparedBatch || isSubmitting}
            maxLength={2000}
            onChange={(event) => updateDraft('explanation', event.currentTarget.value)}
            onBlur={() => setTouched((current) => ({ ...current, explanation: true }))}
            error={fieldError('explanation')}
          />
          <Button type="button" variant="secondary" disabled={hasPreparedBatch || isSubmitting} onClick={addQuestion}>Add question to preview</Button>
        </section>

        <aside className="question-composer__checks" aria-label="Import checks and quota">
          <h2>Import JSON or CSV</h2>
          <p>Files are limited to 5 MB and 500 questions. Every row must pass before any is added.</p>
          <label className="question-composer__file">
            <span>Choose question file</span>
            <input
              type="file"
              accept=".json,.csv,application/json,text/csv"
              aria-label="Choose question file"
              disabled={hasPreparedBatch || isSubmitting}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void importFile(file);
                event.currentTarget.value = '';
              }}
            />
          </label>
          {displayedImportErrors.length > 0 && (
            <div
              className="question-composer__import-errors"
              role="alert"
              aria-label="Import row errors"
              tabIndex={0}
            >
              <table className="setter-table">
                <thead><tr><th>Row</th><th>Column</th><th>Problem</th></tr></thead>
                <tbody>
                  {displayedImportErrors.map((item, index) => (
                    <tr key={`${item.row}:${item.column}:${index}`}>
                      <td>{item.row || '—'}</td>
                      <td>{item.column}</td>
                      <td>{item.problem}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <section className="question-composer__quota" aria-label={`${currentSection?.name ?? 'Section'} quota progress`}>
            <h2>{currentSection?.name ?? 'Section'} quota</h2>
            <p>{sectionCount} of {quota} questions</p>
            <div
              className="setter-quota-bar"
              role="progressbar"
              aria-label={`${currentSection?.name ?? 'Section'} quota`}
              aria-valuenow={sectionCount}
              aria-valuemin={0}
              aria-valuemax={quota}
            >
              <span style={{ width: `${quotaPercent}%` }} />
            </div>
          </section>
        </aside>
      </div>

      <section className="question-composer__preview" aria-labelledby="batch-preview-title">
        <div className="question-composer__preview-header">
          <div>
            <h2 id="batch-preview-title">Batch preview</h2>
            <p>Review the plain-text questions before encryption and submission.</p>
          </div>
          <span>{questions.length} questions</span>
        </div>
        {questions.length === 0 ? (
          <EmptyState
            title="No questions in this batch"
            description="Add a question or import a fully valid JSON or CSV file to begin the preview."
          />
        ) : (
          <ol className="question-composer__preview-list">
            {questions.map((question, index) => (
              <li key={`${index}:${question.text.slice(0, 24)}`}>
                <strong>Question {index + 1}</strong>
                <p>{question.text}</p>
                <ol type="A">
                  {question.options.map((option, optionIndex) => (
                    <li key={optionIndex}>{option}{question.correctIndex === optionIndex ? ' (correct)' : ''}</li>
                  ))}
                </ol>
                {question.explanation && <p>{question.explanation}</p>}
              </li>
            ))}
          </ol>
        )}

        {hasSubmissionActivity && (
          <ol className="question-composer__progress" aria-label="Batch submission progress" aria-live="polite">
            {([
              ['encrypt', 'Encrypt with exam public key'],
              ['upload', 'Upload encrypted batch'],
              ['sign', 'Sign and send submitBatch'],
              ['confirm', 'Confirm on-chain'],
            ] as const).map(([key, label]) => (
              <li className={`is-${progress[key]}`} key={key}>
                <span className="question-composer__progress-bubble" aria-hidden="true" />
                <span>{label}</span>
                <span>{stepText(progress[key])}</span>
              </li>
            ))}
          </ol>
        )}

        {(localMessage || statusMessage) && <p className="setter-success" role="status">{localMessage ?? statusMessage}</p>}
        {(actionError || localMessage?.includes('at most 500')) && (
          <p className="setter-error" role="alert">{actionError ?? localMessage}</p>
        )}
        {hasPreparedBatch && <p role="status">Retry this exact encrypted batch before changing its questions.</p>}
        <div className="question-composer__submit">
          <Button
            type="button"
            disabled={questions.length === 0 || isSubmitting || !currentSection || exam.state !== 'Collecting'}
            onClick={() => void submitBatch()}
          >
            {isSubmitting ? 'Submitting encrypted batch' : 'Submit encrypted batch'}
          </Button>
          {exam.state !== 'Collecting' && <p role="status">Question batches can only be submitted while the exam is Collecting.</p>}
        </div>
      </section>

      <section className="question-composer__history" aria-labelledby="submission-history-title">
        <h2 id="submission-history-title">Submission history</h2>
        {submissions.length === 0 ? (
          <p>No question batches have been submitted by this setter.</p>
        ) : (
          <div className="setter-table-scroll">
            <table className="setter-table">
              <thead>
                <tr><th>Section</th><th>Questions</th><th>Ciphertext hash</th><th>Transaction</th><th>Status</th></tr>
              </thead>
              <tbody>
                {submissions.map((submission) => (
                  <tr id={`submission-${submission.transactionHash}`} key={submission.id}>
                    <td>{exam.sections.find((section) => section.sectionId === submission.sectionId)?.name ?? `Section ${submission.sectionId + 1}`}</td>
                    <td>{submission.questionCount}</td>
                    <td><HashChip hash={submission.hash} /></td>
                    <td><HashChip hash={submission.transactionHash} txUrl={`#submission-${submission.transactionHash}`} /></td>
                    <td>{submission.status === 'confirmed' ? 'Confirmed' : submission.status === 'failed' ? 'Failed' : 'Pending'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

interface QuestionImportViewError {
  row: number;
  column: string;
  problem: string;
}
