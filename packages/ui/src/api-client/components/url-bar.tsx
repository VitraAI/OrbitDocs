'use client';

import { Button, ButtonGroup, Chip, Dropdown, Input, Kbd, Label, ListBox, Select, Tooltip } from '@heroui/react';
import { LuBraces as Braces, LuChevronDown as ChevronDown, LuSend as Send } from 'react-icons/lu';
import { useRef } from 'react';

import { missingVariables } from '../variables';

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export function MethodSelect({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  return (
    <Select aria-label="HTTP method" value={value} onChange={(v) => v && onChange(String(v))} className={`oc-method-select oc-m-${value.toLowerCase()}`}>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {METHODS.map((m) => (
            <ListBox.Item key={m} id={m} textValue={m}>
              <span className={`oc-m oc-m-${m.toLowerCase()}`}>{m}</span>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

/** Every `{{name}}` in the request, with its resolved value on hover. */
export function VariableChips({ text, vars }: { text: string; vars: Record<string, string> }) {
  const names = [...new Set([...text.matchAll(/\{\{\s*([$\w.-]+)\s*\}\}/g)].map((m) => m[1]!))];
  if (!names.length) return null;
  const missing = new Set(missingVariables(text, vars));
  return (
    <div className="oc-var-chips" aria-label="Variables used">
      {names.map((n) => (
        <Tooltip key={n} delay={150}>
          <Chip size="sm" variant="soft" color={missing.has(n) ? 'danger' : n.startsWith('$') ? 'accent' : 'success'}>
            <Chip.Label>{`{{${n}}}`}</Chip.Label>
          </Chip>
          <Tooltip.Content>
            {missing.has(n)
              ? 'Not defined in the active environment or globals'
              : n.startsWith('$')
                ? 'Dynamic: a new value on every send'
                : /key|token|secret|password/i.test(n)
                  ? '•••••• (secret)'
                  : vars[n] || '(empty)'}
          </Tooltip.Content>
        </Tooltip>
      ))}
    </div>
  );
}

export function UrlBar({
  method,
  url,
  vars,
  sending,
  onMethod,
  onUrl,
  onSend,
  onCopyCurl,
  onDuplicate,
}: {
  method: string;
  url: string;
  vars: Record<string, string>;
  sending: boolean;
  onMethod: (m: string) => void;
  onUrl: (u: string) => void;
  onSend: () => void;
  /** Secrets are placeholders unless `includeSecrets`. */
  onCopyCurl: (includeSecrets?: boolean) => void;
  onDuplicate: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const insert = (name: string) => {
    const el = input.current;
    const token = `{{${name}}}`;
    if (!el) return onUrl(url + token);
    const start = el.selectionStart ?? url.length;
    const end = el.selectionEnd ?? url.length;
    onUrl(url.slice(0, start) + token + url.slice(end));
    requestAnimationFrame(() => el.setSelectionRange(start + token.length, start + token.length));
  };
  const names = Object.keys(vars).sort();
  return (
    <form
      className="oc-urlbar"
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <MethodSelect value={method} onChange={onMethod} />
      <Input ref={input} aria-label="Request URL" className="oc-url-input" value={url} onChange={(e) => onUrl(e.target.value)} spellCheck={false} placeholder="https://api.example.com/v1/…" />
      <Dropdown>
        <Button isIconOnly variant="tertiary" aria-label="Insert variable">
          <Braces size={16} />
        </Button>
        <Dropdown.Popover placement="bottom end">
          <Dropdown.Menu aria-label="Variables" onAction={(k) => insert(String(k))}>
            {[...names, '$guid', '$timestamp', '$isoTimestamp', '$randomInt', '$randomEmail'].map((n) => (
              <Dropdown.Item key={n} id={n} textValue={n}>
                <Label>{`{{${n}}}`}</Label>
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      <ButtonGroup>
        <Button type="submit" isPending={sending} className="oc-send-button">
          {sending ? null : <Send size={14} />}
          Send
          <Kbd className="oc-send-kbd">
            <Kbd.Abbr keyValue="command" />
            <Kbd.Content>↵</Kbd.Content>
          </Kbd>
        </Button>
        <Dropdown>
          <Button isIconOnly aria-label="More send options">
            <ButtonGroup.Separator />
            <ChevronDown size={14} />
          </Button>
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu aria-label="Send options" onAction={(k) => (k === 'curl' ? onCopyCurl() : k === 'curl-secrets' ? onCopyCurl(true) : k === 'duplicate' ? onDuplicate() : onSend())}>
              <Dropdown.Item id="send" textValue="Send">
                <Label>Send</Label>
              </Dropdown.Item>
              <Dropdown.Item id="curl" textValue="Copy as cURL">
                <Label>Copy as cURL</Label>
              </Dropdown.Item>
              <Dropdown.Item id="curl-secrets" textValue="Copy as cURL with secret values">
                <Label>Copy as cURL with secret values</Label>
              </Dropdown.Item>
              <Dropdown.Item id="duplicate" textValue="Duplicate request">
                <Label>Duplicate request</Label>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </ButtonGroup>
    </form>
  );
}
