import React, { useEffect, useId, useRef, useState } from 'react';
import * as RadixPopover from '@radix-ui/react-popover';
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
  const generatedId = useId();
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : generatedId);
  const labelId = `${selectId}-label`;
  const listboxId = `${selectId}-listbox`;
  const errorId = error ? `${selectId}-error` : undefined;
  const descId = description ? `${selectId}-desc` : undefined;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const typeahead = useRef('');
  const typeaheadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const selectedValue = value === undefined ? uncontrolledValue : value;
  const selectedIndex = options.findIndex((option) => option.value === selectedValue);
  const [activeIndex, setActiveIndex] = useState(Math.max(0, selectedIndex));
  const [open, setOpen] = useState(false);
  const selectedOption = options[selectedIndex];

  useEffect(() => () => {
    if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current);
  }, []);

  useEffect(() => {
    if (!open) setActiveIndex(Math.max(0, selectedIndex));
  }, [open, selectedIndex]);

  const changeOpen = (nextOpen: boolean) => {
    if (nextOpen) setActiveIndex(Math.max(0, selectedIndex));
    setOpen(nextOpen);
  };

  const chooseOption = (index: number) => {
    const option = options[index];
    if (!option) return;
    if (value === undefined) setUncontrolledValue(option.value);
    onValueChange?.(option.value);
    changeOpen(false);
    triggerRef.current?.focus();
  };

  const moveActive = (direction: 1 | -1) => {
    if (options.length === 0) return;
    setActiveIndex((current) => (current + direction + options.length) % options.length);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (open) moveActive(event.key === 'ArrowDown' ? 1 : -1);
      else changeOpen(true);
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      if (!open) changeOpen(true);
      setActiveIndex(event.key === 'Home' ? 0 : Math.max(0, options.length - 1));
      return;
    }

    if (event.key === 'Escape' && open) {
      event.preventDefault();
      changeOpen(false);
      return;
    }

    if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault();
      chooseOption(activeIndex);
      return;
    }

    if (event.key.length === 1 && event.key.trim() !== '') {
      typeahead.current += event.key.toLocaleLowerCase();
      if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current);
      typeaheadTimer.current = setTimeout(() => {
        typeahead.current = '';
      }, 500);
      const start = open ? activeIndex + 1 : selectedIndex + 1;
      const offset = Math.max(0, start);
      const nextIndex = [...options, ...options].findIndex((option, index) =>
        index >= offset && option.label.toLocaleLowerCase().startsWith(typeahead.current),
      );
      if (nextIndex >= 0 && options.length > 0) {
        const index = nextIndex % options.length;
        setActiveIndex(index);
        if (!open) setOpen(true);
      }
    }
  };

  return (
    <div className="sigil-field">
      {label && (
        <label id={labelId} htmlFor={selectId} className="sigil-field__label">
          {label}
        </label>
      )}
      {description && (
        <p id={descId} className="sigil-field__description">
          {description}
        </p>
      )}
      <RadixPopover.Root open={open} onOpenChange={changeOpen} modal={false}>
        <RadixPopover.Trigger asChild>
          <button
            ref={triggerRef}
            id={selectId}
            type="button"
            className="sigil-select-trigger"
            role="combobox"
            aria-haspopup="listbox"
            aria-label={label ? undefined : placeholder}
            aria-labelledby={label ? labelId : undefined}
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            aria-activedescendant={open && options[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
            aria-invalid={Boolean(error)}
            aria-describedby={[descId, errorId].filter(Boolean).join(' ') || undefined}
            disabled={disabled}
            onKeyDown={handleKeyDown}
          >
            <span>{selectedOption?.label ?? placeholder}</span>
            <span className="sigil-mono" style={{ fontSize: '10px' }} aria-hidden="true">
              ▼
            </span>
          </button>
        </RadixPopover.Trigger>
        <RadixPopover.Content
          id={listboxId}
          className="sigil-select-content"
          role="listbox"
          aria-labelledby={label ? labelId : selectId}
          sideOffset={4}
          align="start"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onKeyDown={handleKeyDown}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${listboxId}-${index}`}
              className="sigil-select-item"
              role="option"
              aria-selected={option.value === selectedValue}
              data-highlighted={index === activeIndex ? '' : undefined}
              onPointerMove={() => setActiveIndex(index)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => chooseOption(index)}
            >
              {option.label}
            </div>
          ))}
        </RadixPopover.Content>
      </RadixPopover.Root>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
};
