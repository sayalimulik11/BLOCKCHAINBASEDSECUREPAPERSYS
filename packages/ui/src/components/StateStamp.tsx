import React from 'react';
import { ExamState } from './CustodyBubbles';

export interface StateStampProps {
  state: ExamState;
  className?: string;
}

export const StateStamp: React.FC<StateStampProps> = ({
  state,
  className = '',
}) => {
  const stateClass = `sigil-state-stamp--${state.toLowerCase()}`;
  return (
    <div
      className={`sigil-state-stamp ${stateClass} ${className}`.trim()}
      role="status"
      aria-label={`Exam status: ${state}`}
    >
      {state}
    </div>
  );
};
