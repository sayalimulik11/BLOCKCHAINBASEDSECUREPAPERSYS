import React from 'react';

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div className={`sigil-empty-state ${className}`.trim()}>
      <div className="sigil-empty-state__title">{title}</div>
      <p className="sigil-empty-state__description">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
};
