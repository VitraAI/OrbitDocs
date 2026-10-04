'use client';

import { Button, Checkbox, Chip, ColorSwatchPicker, Input, Label, ListBox, Switch, Tooltip } from '@heroui/react';
import { LuEye as Eye, LuEyeOff as EyeOff, LuPlus as Plus, LuTrash2 as Trash2 } from 'react-icons/lu';
import { useState } from 'react';

import type { Environment, Variable } from '../types';
import { itemFromEvent } from './context-menu';

export const ENV_COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4', '#EF4444'];

function VariableRows({ variables, onChange }: { variables: Variable[]; onChange: (v: Variable[]) => void }) {
  const [reveal, setReveal] = useState(false);
  const rows = [...variables, { key: '', value: '', enabled: true }];
  const set = (i: number, patch: Partial<Variable>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)).filter((r, j) => j < variables.length || r.key || r.value));
  return (
    <div className="oc-kv oc-vars">
      <div className="oc-kv-head">
        <span />
        <Label>Variable</Label>
        <Label className="oc-row">
          Value
          <Button isIconOnly size="sm" variant="ghost" aria-label={reveal ? 'Hide secrets' : 'Show secrets'} onPress={() => setReveal((r) => !r)}>
            {reveal ? <EyeOff size={13} /> : <Eye size={13} />}
          </Button>
        </Label>
        <Label>Secret</Label>
        <span />
      </div>
      {rows.map((v, i) => {
        const isNew = i === variables.length;
        return (
          <div className="oc-kv-row" key={i} data-disabled={!v.enabled || undefined}>
            {isNew ? (
              <span />
            ) : (
              <Checkbox aria-label={`Enable ${v.key}`} isSelected={v.enabled} onChange={(on) => set(i, { enabled: on })}>
                <Checkbox.Content>
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                </Checkbox.Content>
              </Checkbox>
            )}
            <Input aria-label="Variable name" className="oc-mono-input" placeholder={isNew ? 'Add variable' : 'name'} value={v.key} onChange={(e) => set(i, { key: e.target.value })} />
            <Input
              aria-label={`Value of ${v.key || 'new variable'}`}
              className="oc-mono-input"
              type={v.secret && !reveal ? 'password' : 'text'}
              placeholder="value"
              value={v.value}
              onChange={(e) => set(i, { value: e.target.value })}
            />
            {isNew ? (
              <span />
            ) : (
              <Tooltip delay={300}>
                <Switch aria-label={`Secret ${v.key}`} isSelected={Boolean(v.secret)} onChange={(on) => set(i, { secret: on })} size="sm">
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
                <Tooltip.Content>Secret: masked, kept in this browser, never exported</Tooltip.Content>
              </Tooltip>
            )}
            {isNew ? (
              <span />
            ) : (
              <Button isIconOnly size="sm" variant="ghost" aria-label={`Remove ${v.key}`} onPress={() => onChange(variables.filter((_, j) => j !== i))}>
                <Trash2 size={14} />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function EnvironmentsView({
  globals,
  environments,
  activeId,
  collectionId,
  onGlobals,
  onEnvironment,
  onRemove,
  onActivate,
  onContextMenu,
}: {
  globals: Variable[];
  environments: Environment[];
  activeId?: string;
  collectionId?: string;
  onGlobals: (v: Variable[]) => void;
  onEnvironment: (e: Environment) => void;
  onRemove: (id: string) => void;
  onActivate: (id: string) => void;
  /** Right-click on an environment in the list (its id, or `globals`). */
  onContextMenu?: (e: React.MouseEvent<HTMLElement>, id: string, el: HTMLElement) => void;
}) {
  const [selected, setSelected] = useState<string>(activeId ?? 'globals');
  const env = environments.find((e) => e.id === selected);
  return (
    <div className="oc-envs">
      <div
        className="oc-env-list"
        onContextMenu={(e) => {
          const item = onContextMenu ? itemFromEvent(e) : null;
          if (item) onContextMenu!(e, item.key, item.el);
        }}
      >
        <ListBox aria-label="Environments" onAction={(k) => setSelected(String(k))}>
          {[
            <ListBox.Item key="globals" id="globals" textValue="Globals" className={selected === 'globals' ? 'oc-active-item' : undefined}>
              <span className="oc-env-dot" style={{ background: 'var(--muted)' }} />
              Globals
            </ListBox.Item>,
            ...environments.map((e) => (
              <ListBox.Item key={e.id} id={e.id} textValue={e.name} className={selected === e.id ? 'oc-active-item' : undefined}>
                <span className="oc-env-dot" style={{ background: e.color ?? 'var(--muted)' }} />
                <span className="oc-ellipsis">{e.name}</span>
                {e.id === activeId ? (
                  <Chip size="sm" variant="soft" color="accent">
                    <Chip.Label>active</Chip.Label>
                  </Chip>
                ) : null}
              </ListBox.Item>
            )),
          ]}
        </ListBox>
        <Button
          size="sm"
          variant="ghost"
          onPress={() => {
            const id = `env:${crypto.randomUUID()}`;
            onEnvironment({ id, name: 'New environment', collectionId, color: ENV_COLORS[environments.length % ENV_COLORS.length], variables: [{ key: 'baseUrl', value: '', enabled: true }] });
            setSelected(id);
          }}
        >
          <Plus size={14} /> New environment
        </Button>
      </div>
      <div className="oc-env-editor">
        {selected === 'globals' || !env ? (
          <>
            <h3 className="oc-h3">Global variables</h3>
            <p className="oc-hint">Available everywhere. Values in the active environment win.</p>
            <VariableRows variables={globals} onChange={onGlobals} />
          </>
        ) : (
          <>
            <div className="oc-env-head">
              <Input aria-label="Environment name" className="oc-name-input oc-env-name" value={env.name} onChange={(e) => onEnvironment({ ...env, name: e.target.value })} />
              {env.id !== activeId ? (
                <Button size="sm" variant="secondary" onPress={() => onActivate(env.id)}>
                  Use this environment
                </Button>
              ) : (
                <Chip size="sm" color="accent" variant="soft">
                  <Chip.Label>Active</Chip.Label>
                </Chip>
              )}
              <div className="oc-grow" />
              <Button size="sm" variant="ghost" className="oc-danger-text" onPress={() => { onRemove(env.id); setSelected('globals'); }}>
                <Trash2 size={14} /> Delete
              </Button>
            </div>
            <div className="oc-env-meta">
              <div className="oc-field">
                <Label>Colour</Label>
                <ColorSwatchPicker aria-label="Environment colour" value={env.color ?? ENV_COLORS[0]} onChange={(c) => onEnvironment({ ...env, color: c.toString('hex') })} size="sm">
                  {ENV_COLORS.map((c) => (
                    <ColorSwatchPicker.Item key={c} color={c}>
                      <ColorSwatchPicker.Swatch />
                      <ColorSwatchPicker.Indicator />
                    </ColorSwatchPicker.Item>
                  ))}
                </ColorSwatchPicker>
              </div>
              <Switch isSelected={Boolean(env.production)} onChange={(on) => onEnvironment({ ...env, production: on })}>
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  Production — ask before sending
                </Switch.Content>
              </Switch>
            </div>
            <VariableRows variables={env.variables} onChange={(variables) => onEnvironment({ ...env, variables })} />
          </>
        )}
      </div>
    </div>
  );
}
