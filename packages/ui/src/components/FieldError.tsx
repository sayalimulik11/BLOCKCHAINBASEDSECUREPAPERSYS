import React from 'react';

export interface FieldErrorProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

export const FieldError = React.forwardRef<HTMLDivElement, FieldErrorProps>(
  ({ className = '', children, ...props }, ref) => {
    if (!children) return null;
    return (
      <div
        ref={ref}
        className={`sigil-field-error ${className}`.trim()}
        role="alert"
        aria-live="polite"
        {...props}
      >
        {children}
      </div>
    );
  }
);

FieldError.displayName = 'FieldError';
