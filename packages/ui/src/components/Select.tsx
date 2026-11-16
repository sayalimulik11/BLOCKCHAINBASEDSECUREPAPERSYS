import React from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { FieldError } from './FieldError';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  id?: string;
  label?: string;
  description?: string;
  error?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  options: SelectOption[];
  disabled?: boolean;
}

export const Select: React.FC<SelectProps> = ({
  id,
  label,
  description,
  error,
  value,
  defaultValue,
  onValueChange,
  placeholder = 'Select an option',
  options,
  disabled,
}) => {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  const errorId = selectId && error ? `${selectId}-error` : undefined;
  const descId = selectId && description ? `${selectId}-desc` : undefined;

  return (
    <div className="sigil-field">
      {label && (
        <label htmlFor={selectId} className="sigil-field__label">
          {label}
        </label>
      )}
      {description && (
        <p id={descId} className="sigil-field__description">
          {description}
        </p>
      )}
      <RadixSelect.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        disabled={disabled}
      >
        <RadixSelect.Trigger
          id={selectId}
          className="sigil-select-trigger"
          aria-invalid={Boolean(error)}
          aria-describedby={[descId, errorId].filter(Boolean).join(' ') || undefined}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <RadixSelect.Icon className="sigil-mono" style={{ fontSize: '10px' }}>
            ▼
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content className="sigil-select-content" position="popper" sideOffset={4}>
            <RadixSelect.Viewport>
              {options.map((opt) => (
                <RadixSelect.Item key={opt.value} value={opt.value} className="sigil-select-item">
                  <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
};
