import React from 'react';

export type ExamState = 'Draft' | 'Collecting' | 'Sealed' | 'Released' | 'Concluded' | 'Cancelled';

export const EXAM_LIFECYCLE_STAGES: ExamState[] = [
  'Draft',
  'Collecting',
  'Sealed',
  'Released',
  'Concluded',
];

export interface CustodyBubblesProps {
  currentState: ExamState;
  variant?: 'strip' | 'inline';
  className?: string;
}

export const CustodyBubbles: React.FC<CustodyBubblesProps> = ({
  currentState,
  variant = 'strip',
  className = '',
}) => {
  const currentIndex = EXAM_LIFECYCLE_STAGES.indexOf(currentState);
  const isCancelled = currentState === 'Cancelled';

  if (variant === 'inline') {
    return (
      <div
        className={`sigil-custody-inline ${className}`.trim()}
        role="status"
        aria-label={`Lifecycle state: ${currentState}`}
      >
        {isCancelled ? (
          <span
            className="sigil-custody-inline__bubble"
            style={{ backgroundColor: 'var(--sigil-color-alert)' }}
            title="Cancelled"
          />
        ) : (
          EXAM_LIFECYCLE_STAGES.map((stage, idx) => {
            let status = 'pending';
            if (idx < currentIndex) status = 'done';
            else if (idx === currentIndex) status = 'current';

            return (
              <span
                key={stage}
                className={`sigil-custody-inline__bubble sigil-custody-inline__bubble--${status}`}
                title={stage}
              />
            );
          })
        )}
      </div>
    );
  }

  // Default 'strip' (horizontal custody strip)
  return (
    <div
      className={`sigil-custody-strip ${className}`.trim()}
      role="progressbar"
      aria-label={`Exam custody state: ${currentState}`}
      aria-valuenow={isCancelled ? 0 : currentIndex + 1}
      aria-valuemin={1}
      aria-valuemax={EXAM_LIFECYCLE_STAGES.length}
      tabIndex={0}
    >
      {isCancelled ? (
        <div className="sigil-custody-step">
          <div className="sigil-custody-bubble sigil-custody-bubble--cancelled" />
          <span className="sigil-custody-label sigil-custody-label--active" style={{ color: 'var(--sigil-color-alert)' }}>
            Cancelled
          </span>
        </div>
      ) : (
        EXAM_LIFECYCLE_STAGES.map((stage, idx) => {
          const isDone = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          const bubbleClass = isDone
            ? 'sigil-custody-bubble--done'
            : isCurrent
            ? 'sigil-custody-bubble--current'
            : 'sigil-custody-bubble--pending';

          const labelClass = isDone || isCurrent
            ? 'sigil-custody-label sigil-custody-label--active'
            : 'sigil-custody-label';

          return (
            <React.Fragment key={stage}>
              <div className="sigil-custody-step">
                <div className={`sigil-custody-bubble ${bubbleClass}`} aria-hidden="true" />
                <span className={labelClass}>{stage}</span>
              </div>
              {idx < EXAM_LIFECYCLE_STAGES.length - 1 && (
                <div
                  className={`sigil-custody-connector ${
                    idx < currentIndex ? 'sigil-custody-connector--done' : ''
                  }`}
                  aria-hidden="true"
                />
              )}
            </React.Fragment>
          );
        })
      )}
    </div>
  );
};
