import React from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';

export interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}

export const Dialog: React.FC<DialogProps> = ({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  description,
  children,
}) => {
  return (
    <RadixDialog.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger && <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="sigil-dialog-overlay" />
        <RadixDialog.Content className="sigil-dialog-content">
          <RadixDialog.Title className="sigil-dialog-title">{title}</RadixDialog.Title>
          {description && (
            <RadixDialog.Description className="sigil-dialog-description">
              {description}
            </RadixDialog.Description>
          )}
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
};
