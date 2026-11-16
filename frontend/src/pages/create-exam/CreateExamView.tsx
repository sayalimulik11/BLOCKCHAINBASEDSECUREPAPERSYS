import React, { useMemo, useState } from 'react';
import { keccakJson } from '@sigil/core/canonical';
import { Button, Field, ThresholdMeter } from '@sigil/ui';
import { validateExamWizard } from './validation';
import type {
  ExamMetadata,
  ExamMetadataConfig,
  ExamWizardContext,
  ExamWizardDraft,
} from './types';
import './create-exam.css';

const STEPS = [
  'Details',
  'Sections and quotas',
  'Schedule',
  'Panel and threshold',
  'Setters and centres',
  'Review and sign',
] as const;

export type CreateExamPageState = 'loading' | 'error' | 'permission' | 'empty' | 'ready';

export interface CreateExamViewProps {
  pageState: CreateExamPageState;
  error?: Error | null;
  retry?: () => void;
  context: ExamWizardContext;
  initialDraft?: ExamWizardDraft;
  isSubmitting?: boolean;
  createdExamId?: string | null;
  metadataStored?: boolean;
  metadataError?: string | null;
  onCreate: (metadata: ExamMetadata, config: ExamMetadataConfig) => void;
  onRetryMetadata?: () => void;
  onStartCeremony?: (examId: string) => void;
}

function createInitialDraft(): ExamWizardDraft {
  return {
    title: '',
    sections: [{ name: '', quota: '' }],
    releaseOpensAt: '',
    examStartsAt: '',
    examEndsAt: '',
    threshold: '',
    holders: ['', '', ''],
    setters: [''],
    centres: [''],
  };
}

function FieldMessage({ children }: { children: string }) {
  return (
    <p className="create-exam__error" role="alert">
      {children}
    </p>
  );
}

export function CreateExamView({
  pageState,
  error,
  retry,
  context,
  initialDraft,
  isSubmitting = false,
  createdExamId = null,
  metadataStored = false,
  metadataError = null,
  onCreate,
  onRetryMetadata,
  onStartCeremony,
}: CreateExamViewProps) {
  const [draft, setDraft] = useState(() => initialDraft ?? createInitialDraft());
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const validation = useMemo(() => validateExamWizard(draft, context), [context, draft]);
  const metadataHash = useMemo(
    () => (validation.metadata ? keccakJson(validation.metadata) : null),
    [validation.metadata],
  );

  const visibleError = (key: string) =>
    (submitted || touched[key]) && validation.errors[key] ? validation.errors[key] : undefined;

  const update = <K extends keyof ExamWizardDraft>(key: K, value: ExamWizardDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const markTouched = (key: string) => {
    setTouched((current) => ({ ...current, [key]: true }));
  };

  const submit = () => {
    setSubmitted(true);
    if (!validation.metadata || !validation.config) {
      const firstInvalidStep = validation.errors.title
        ? 0
        : validation.errors.sections
          ? 1
          : validation.errors.releaseOpensAt || validation.errors.examStartsAt || validation.errors.examEndsAt
            ? 2
            : validation.errors.holders || validation.errors.threshold
              ? 3
              : 4;
      setStep(firstInvalidStep);
      return;
    }
    onCreate(validation.metadata, validation.config);
  };

  if (pageState === 'loading') {
    return (
      <section className="create-exam__state create-exam__state--loading" aria-label="Loading exam setup">
        <div className="create-exam__skeleton create-exam__skeleton--heading" />
        <div className="create-exam__skeleton create-exam__skeleton--form" />
      </section>
    );
  }
  if (pageState === 'permission') {
    return (
      <section className="create-exam__state" role="alert">
        <h1>Exam Authority role required</h1>
        <p>This account cannot create an examination.</p>
      </section>
    );
  }
  if (pageState === 'error') {
    return (
      <section className="create-exam__state" role="alert">
        <h1>Unable to load exam setup</h1>
        <p>{error?.message ?? 'Participant and chain data are unavailable.'}</p>
        <Button onClick={retry}>Retry connection</Button>
      </section>
    );
  }
  if (pageState === 'empty') {
    return (
      <section className="create-exam__state" role="status">
        <h1>No registered participants</h1>
        <p>Register key holders, setters, and examination centres before creating an exam.</p>
      </section>
    );
  }
  if (createdExamId && metadataStored) {
    return (
      <section className="create-exam__state" role="status">
        <h1>Exam created</h1>
        <p>
          Exam No. {createdExamId.padStart(4, '0')} is on-chain and its metadata is stored.
        </p>
        <Button onClick={() => onStartCeremony?.(createdExamId)}>Start key ceremony</Button>
      </section>
    );
  }

  return (
    <section className="create-exam" aria-labelledby="create-exam-title">
      <header className="create-exam__header">
        <h1 id="create-exam-title">Create examination</h1>
        <p>Set the schedule, paper structure, and custody panel before signing.</p>
      </header>

      <div className="create-exam__layout">
        <nav className="create-exam__steps" aria-label="Exam setup steps">
          {STEPS.map((label, index) => (
            <button
              type="button"
              key={label}
              className={`create-exam__step${step === index ? ' is-current' : ''}${step > index ? ' is-done' : ''}`}
              aria-current={step === index ? 'step' : undefined}
              onClick={() => setStep(index)}
            >
              <span className="create-exam__step-bubble" aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="create-exam__form">
          {step === 0 && (
            <section aria-labelledby="exam-details-heading">
              <h2 id="exam-details-heading">Details</h2>
              <Field
                label="Exam title"
                value={draft.title}
                minLength={5}
                maxLength={120}
                onChange={(event) => update('title', event.currentTarget.value)}
                onBlur={() => markTouched('title')}
                error={visibleError('title')}
              />
            </section>
          )}

          {step === 1 && (
            <section aria-labelledby="exam-sections-heading">
              <h2 id="exam-sections-heading">Sections and quotas</h2>
              <p>Choose between one and eight unique sections. Each quota is 1 to 500.</p>
              {draft.sections.map((section, index) => (
                <div className="create-exam__row" key={index}>
                  <Field
                    label={`Section ${index + 1} name`}
                    value={section.name}
                    minLength={2}
                    maxLength={40}
                    onChange={(event) => {
                      const sections = draft.sections.slice();
                      sections[index] = { ...section, name: event.currentTarget.value };
                      update('sections', sections);
                    }}
                    onBlur={() => markTouched('sections')}
                    error={visibleError('sections')}
                  />
                  <Field
                    label={`Section ${index + 1} question quota`}
                    type="number"
                    min={1}
                    max={500}
                    step={1}
                    value={section.quota}
                    onChange={(event) => {
                      const sections = draft.sections.slice();
                      sections[index] = { ...section, quota: event.currentTarget.value };
                      update('sections', sections);
                    }}
                    onBlur={() => markTouched('sections')}
                    error={visibleError('sections')}
                  />
                  {draft.sections.length > 1 && (
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label={`Remove section ${index + 1}`}
                      onClick={() => update('sections', draft.sections.filter((_, row) => row !== index))}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
              {visibleError('sections') && <FieldMessage>{visibleError('sections')!}</FieldMessage>}
              <Button
                type="button"
                variant="secondary"
                disabled={draft.sections.length >= 8}
                onClick={() => update('sections', [...draft.sections, { name: '', quota: '' }])}
              >
                Add section
              </Button>
            </section>
          )}

          {step === 2 && (
            <section aria-labelledby="exam-schedule-heading">
              <h2 id="exam-schedule-heading">Schedule</h2>
              <p>
                Times use your local timezone for entry and are stored as Unix seconds. Release opens
                no more than six hours before the exam starts.
              </p>
              {([
                ['releaseOpensAt', 'Release window opens'],
                ['examStartsAt', 'Exam starts'],
                ['examEndsAt', 'Exam ends'],
              ] as const).map(([key, label]) => (
                <Field
                  key={key}
                  label={label}
                  type="datetime-local"
                  step={1}
                  value={draft[key]}
                  onChange={(event) => update(key, event.currentTarget.value)}
                  onBlur={() => markTouched(key)}
                  error={visibleError(key)}
                />
              ))}
              {context.minLeadSeconds !== null && (
                <p className="create-exam__hint">
                  Release must be at least {context.minLeadSeconds} seconds after current chain time.
                </p>
              )}
            </section>
          )}

          {step === 3 && (
            <section aria-labelledby="exam-panel-heading">
              <h2 id="exam-panel-heading">Panel and threshold</h2>
              <p>Assign three to twenty holders. Every holder must have a registered encryption key.</p>
              {draft.holders.map((address, index) => {
                const normalized = address.trim().toLowerCase();
                const keyRegistered = context.encryptionKeys[normalized];
                return (
                  <div className="create-exam__participant-row" key={`holder-${index}`}>
                    <Field
                      label={`Key holder ${index + 1} address`}
                      value={address}
                      mono
                      onChange={(event) => {
                        const holders = draft.holders.slice();
                        holders[index] = event.currentTarget.value;
                        update('holders', holders);
                      }}
                      onBlur={() => markTouched(`holders.${index}`)}
                      error={visibleError(`holders.${index}`)}
                    />
                    <span
                      className={keyRegistered ? 'create-exam__key-ok' : 'create-exam__key-missing'}
                      role={keyRegistered === false ? 'alert' : 'status'}
                    >
                      {keyRegistered === true
                        ? 'Key registered'
                        : keyRegistered === false
                          ? 'No key registered'
                          : 'Key status not checked'}
                    </span>
                  </div>
                );
              })}
              {visibleError('holders') && <FieldMessage>{visibleError('holders')!}</FieldMessage>}
              <div className="create-exam__actions">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={draft.holders.length >= 20}
                  onClick={() => update('holders', [...draft.holders, ''])}
                >
                  Add holder
                </Button>
                {draft.holders.length > 3 && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => update('holders', draft.holders.slice(0, -1))}
                  >
                    Remove last holder
                  </Button>
                )}
              </div>
              <Field
                label="Share threshold"
                type="number"
                min={2}
                max={draft.holders.length}
                step={1}
                value={draft.threshold}
                onChange={(event) => update('threshold', event.currentTarget.value)}
                onBlur={() => markTouched('threshold')}
                error={visibleError('threshold')}
              />
              <ThresholdMeter
                current={Number(draft.threshold) || 0}
                threshold={Number(draft.threshold) || 0}
                total={draft.holders.length}
                label="Key-holder threshold"
              />
            </section>
          )}

          {step === 4 && (
            <section aria-labelledby="exam-setters-heading">
              <h2 id="exam-setters-heading">Setters and centres</h2>
              <p>Each account must be registered with the matching role and appear only once.</p>
              {([
                ['setters', 'Paper setter', 'SETTER'],
                ['centres', 'Examination centre', 'CENTRE'],
              ] as const).map(([key, label, role]) => (
                <div className="create-exam__address-list" key={key}>
                  <h3>{role === 'SETTER' ? 'Setters' : 'Centres'}</h3>
                  {draft[key].map((address, index) => (
                    <div className="create-exam__participant-row" key={`${key}-${index}`}>
                      <Field
                        label={`${label} ${index + 1} address`}
                        value={address}
                        mono
                        onChange={(event) => {
                          const rows = draft[key].slice();
                          rows[index] = event.currentTarget.value;
                          update(key, rows);
                        }}
                        onBlur={() => markTouched(`${key}.${index}`)}
                        error={visibleError(`${key}.${index}`) ?? visibleError(key)}
                      />
                      {draft[key].length > 1 && (
                        <Button
                          type="button"
                          variant="secondary"
                          aria-label={`Remove ${role.toLowerCase()} ${index + 1}`}
                          onClick={() => update(key, draft[key].filter((_, row) => row !== index))}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                  {visibleError(key) && <FieldMessage>{visibleError(key)!}</FieldMessage>}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => update(key, [...draft[key], ''])}
                  >
                    Add {role === 'SETTER' ? 'setter' : 'centre'}
                  </Button>
                </div>
              ))}
            </section>
          )}

          {step === 5 && (
            <section aria-labelledby="exam-review-heading">
              <h2 id="exam-review-heading">Review and sign</h2>
              <dl className="create-exam__review">
                <dt>Title</dt>
                <dd>{validation.metadata?.title || draft.title || 'Not entered'}</dd>
                <dt>Sections and quotas</dt>
                <dd>
                  {draft.sections.map((section) => `${section.name || 'Unnamed'}: ${section.quota || '—'}`).join(', ')}
                </dd>
                <dt>Panel</dt>
                <dd>{draft.holders.filter(Boolean).length} holders, {draft.setters.filter(Boolean).length} setters, {draft.centres.filter(Boolean).length} centres</dd>
                <dt>Threshold</dt>
                <dd>{draft.threshold || '—'} of {draft.holders.length}</dd>
                <dt>Canonical metadata hash</dt>
                <dd className="sigil-mono">{metadataHash ?? 'Complete valid metadata to calculate the hash.'}</dd>
              </dl>
              {submitted && Object.keys(validation.errors).length > 0 && (
                <div className="create-exam__error-summary" role="alert">
                  <h3>Correct these fields before signing</h3>
                  <ul>
                    {Object.entries(validation.errors).map(([field, message]) => (
                      <li key={field}>{field}: {message}</li>
                    ))}
                  </ul>
                </div>
              )}
              {metadataError && (
                <div className="create-exam__error-summary" role="alert">
                  <p>{metadataError}</p>
                  <Button type="button" onClick={onRetryMetadata}>Retry metadata storage</Button>
                </div>
              )}
            </section>
          )}

          <div className="create-exam__footer">
            <Button
              type="button"
              variant="secondary"
              disabled={step === 0}
              onClick={() => setStep((current) => Math.max(0, current - 1))}
            >
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={() => setStep((current) => Math.min(STEPS.length - 1, current + 1))}>
                Continue
              </Button>
            ) : (
              <Button
                type="button"
                disabled={isSubmitting || Boolean(createdExamId)}
                onClick={submit}
              >
                {isSubmitting ? 'Awaiting confirmation' : 'Create exam'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
