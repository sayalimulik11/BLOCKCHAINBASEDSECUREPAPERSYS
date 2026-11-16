import React from 'react';
import { FieldError } from './FieldError';

export interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
  error?: string;
  mono?: boolean;
}

export const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  ({ id, label, description, error, mono, className = '', ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const errorId = inputId && error ? `${inputId}-error` : undefined;
    const descId = inputId && description ? `${inputId}-desc` : undefined;

    const inputClasses = [
      'sigil-input',
      mono ? 'sigil-input--mono' : '',
      className,
    ].filter(Boolean).join(' ');

    return (
      <div className="sigil-field">
        {label && (
          <label htmlFor={inputId} className="sigil-field__label">
            {label}
          </label>
        )}
        {description && (
          <p id={descId} className="sigil-field__description">
            {description}
          </p>
        )}
        <input
          ref={ref}
          id={inputId}
          className={inputClasses}
          aria-invalid={Boolean(error)}
          aria-describedby={[descId, errorId].filter(Boolean).join(' ') || undefined}
          {...props}
        />
        {error && <FieldError id={errorId}>{error}</FieldError>}
      </div>
    );
  }
);

Field.displayName = 'Field';
