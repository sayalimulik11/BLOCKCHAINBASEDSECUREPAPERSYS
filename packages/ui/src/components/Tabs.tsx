import React from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';

export interface TabItem {
  value: string;
  label: string;
  content: React.ReactNode;
}

export interface TabsProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  items: TabItem[];
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  value,
  defaultValue,
  onValueChange,
  items,
  className = '',
}) => {
  return (
    <RadixTabs.Root
      value={value}
      defaultValue={defaultValue ?? items[0]?.value}
      onValueChange={onValueChange}
      className={className}
    >
      <RadixTabs.List className="sigil-tabs-list">
        {items.map((item) => (
          <RadixTabs.Trigger key={item.value} value={item.value} className="sigil-tabs-trigger">
            {item.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map((item) => (
        <RadixTabs.Content key={item.value} value={item.value} tabIndex={-1}>
          {item.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
};
