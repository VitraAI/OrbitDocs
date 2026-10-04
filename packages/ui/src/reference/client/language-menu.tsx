'use client';

import { Dropdown, Label } from '@heroui/react';
import { LuChevronDown as ChevronDown } from 'react-icons/lu';

/** A compact HeroUI dropdown picker (code language, server, auth scheme). */
export function LanguageMenu({
  options,
  value,
  onChange,
  label = 'Code sample language',
  placeholder,
  className,
}: {
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
  label?: string;
  /** Trigger text when `value` matches no option (otherwise the first option shows). */
  placeholder?: string;
  className?: string;
}) {
  const current = options.find((o) => o.id === value) ?? (placeholder ? undefined : options[0]);
  return (
    <Dropdown>
      <Dropdown.Trigger className={`od-lang-trigger ${className ?? ''}`} aria-label={label}>
        <span>{current?.label ?? placeholder}</span>
        <ChevronDown size={14} />
      </Dropdown.Trigger>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu aria-label={label} selectionMode="single" selectedKeys={new Set(current ? [current.id] : [])} onAction={(key) => onChange(String(key))}>
          {options.map((o) => (
            <Dropdown.Item key={o.id} id={o.id} textValue={o.label}>
              <Label>{o.label}</Label>
              <Dropdown.ItemIndicator />
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
