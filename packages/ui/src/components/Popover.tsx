import React from 'react';
import * as RadixPopover from '@radix-ui/react-popover';

export interface PopoverProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
}

export const Popover: React.FC<PopoverProps> = ({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  children,
}) => {
  return (
    <RadixPopover.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          className="sigil-popover-content"
          sideOffset={5}
          aria-label="More information"
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
};
