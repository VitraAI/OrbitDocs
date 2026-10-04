'use client';

import { Button, Checkbox, Input, Label, ListBox, Select, Tooltip } from '@heroui/react';
import { LuTrash2 as Trash2 } from 'react-icons/lu';

import type { KV } from '../types';

/**
 * Editable key/value rows (params, headers, form fields). The last row is
 * always empty: typing into it adds a row.
 */
export function KVEditor({
  rows,
  onChange,
  keyLabel = 'Key',
  valueLabel = 'Value',
  allowFiles,
  onFile,
  emptyHint,
}: {
  rows: KV[];
  onChange: (rows: KV[]) => void;
  keyLabel?: string;
  valueLabel?: string;
  allowFiles?: boolean;
  onFile?: (index: number, file: File | undefined) => void;
  emptyHint?: string;
}) {
  const all = [...rows, { key: '', value: '', enabled: true }];
  const set = (i: number, patch: Partial<KV>) =>
    onChange(all.map((r, j) => (j === i ? { ...r, ...patch } : r)).filter((r, j) => j < rows.length || r.key || r.value));
  return (
    <div className="oc-kv" data-files={allowFiles || undefined}>
      <div className="oc-kv-head">
        <span />
        <Label>{keyLabel}</Label>
        <Label>{valueLabel}</Label>
        {allowFiles ? <Label>Type</Label> : null}
        <span />
      </div>
      {all.map((r, i) => {
        const isNew = i === rows.length;
        return (
          <div className="oc-kv-row" key={i} data-disabled={!r.enabled || undefined}>
            {isNew ? (
              <span />
            ) : (
              <Checkbox aria-label={`Enable ${r.key || 'row'}`} isSelected={r.enabled} onChange={(v) => set(i, { enabled: v })}>
                <Checkbox.Content>
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                </Checkbox.Content>
              </Checkbox>
            )}
            <Input aria-label={keyLabel} placeholder={isNew ? `Add ${keyLabel.toLowerCase()}` : keyLabel} value={r.key} onChange={(e) => set(i, { key: e.target.value })} className="oc-mono-input" />
            {r.file ? (
              <Input aria-label={`File for ${r.key}`} type="file" onChange={(e) => onFile?.(i, e.target.files?.[0])} />
            ) : (
              <Input
                aria-label={`${valueLabel} for ${r.key || 'new row'}`}
                placeholder={r.description ?? valueLabel}
                value={r.value}
                onChange={(e) => set(i, { value: e.target.value })}
                className="oc-mono-input"
              />
            )}
            {allowFiles ? (
              isNew ? (
                <span />
              ) : (
                <Select aria-label="Field type" value={r.file ? 'file' : 'text'} onChange={(v) => set(i, { file: v === 'file' })}>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="text" textValue="Text">
                        Text
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="file" textValue="File">
                        File
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    </ListBox>
                  </Select.Popover>
                </Select>
              )
            ) : null}
            {isNew ? (
              <span />
            ) : (
              <Tooltip delay={300}>
                <Button isIconOnly size="sm" variant="ghost" aria-label={`Remove ${r.key || 'row'}`} onPress={() => onChange(rows.filter((_, j) => j !== i))}>
                  <Trash2 size={14} />
                </Button>
                <Tooltip.Content>Remove</Tooltip.Content>
              </Tooltip>
            )}
          </div>
        );
      })}
      {!rows.length && emptyHint ? <p className="oc-hint">{emptyHint}</p> : null}
    </div>
  );
}
