'use client';

import { Alert, AlertDialog, Button, Input, Label, TextField } from '@heroui/react';
import { type ReactNode, useCallback, useState } from 'react';

export interface ConfirmOptions {
  /** A question: "Delete preview pr-3?" */
  title: ReactNode;
  /** One line on what happens. */
  body: ReactNode;
  /** The confirm button's label: "Delete Preview". */
  confirmLabel: string;
  /** Danger (default) for destructive actions; warning for disruptive but reversible ones. */
  tone?: 'danger' | 'warning';
  /** The person types this (a project name) before the confirm button turns on. */
  typeToConfirm?: string;
  /** Runs on confirm. A thrown error is shown in the dialog, which stays open. */
  action: () => Promise<unknown>;
}

/** The dashboard's one confirmation dialog for destructive or irreversible actions. */
export function ConfirmDialog({ options: requested, onClose }: { options: ConfirmOptions | null; onClose: () => void }) {
  // Keep the last options so the text stays while the dialog animates out.
  const [options, setOptions] = useState(requested);
  if (requested && requested !== options) setOptions(requested);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const tone = options?.tone ?? 'danger';
  const ready = !options?.typeToConfirm || typed === options.typeToConfirm;
  const close = () => {
    if (busy) return;
    setError(null);
    setTyped('');
    onClose();
  };
  const confirm = async () => {
    if (!options || !ready) return;
    setBusy(true);
    setError(null);
    try {
      await options.action();
      setBusy(false);
      setTyped('');
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <AlertDialog.Backdrop isOpen={Boolean(requested)} onOpenChange={(o) => !o && close()} isKeyboardDismissDisabled={busy}>
      <AlertDialog.Container>
        <AlertDialog.Dialog className="sm:max-w-[440px]">
          <AlertDialog.Header>
            <AlertDialog.Icon status={tone} />
            <AlertDialog.Heading>{options?.title}</AlertDialog.Heading>
          </AlertDialog.Header>
          <form
            className="mt-2"
            onSubmit={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            <AlertDialog.Body className="flex flex-col gap-4">
              <p className="text-sm text-[var(--muted)]">{options?.body}</p>
              {options?.typeToConfirm ? (
                <TextField value={typed} onChange={setTyped} isDisabled={busy} autoFocus>
                  <Label className="text-[13px] font-normal text-[var(--muted)]">
                    To confirm, type <span className="mono font-medium text-[var(--foreground)]">{options.typeToConfirm}</span>
                  </Label>
                  <Input autoComplete="off" spellCheck={false} className="mono text-[13px]" />
                </TextField>
              ) : null}
              {error ? (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{error}</Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="tertiary" onPress={close} isDisabled={busy} autoFocus={!options?.typeToConfirm}>
                Cancel
              </Button>
              <Button type="submit" variant={tone === 'danger' ? 'danger' : 'primary'} isPending={busy} isDisabled={!ready}>
                {options?.confirmLabel}
              </Button>
            </AlertDialog.Footer>
          </form>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}

/**
 * `const [confirm, dialog] = useConfirm()`: render `dialog` once, then call `confirm({...})` from
 * any button. The action runs only after the person confirms.
 */
export function useConfirm(): [(options: ConfirmOptions) => void, ReactNode] {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const ask = useCallback((o: ConfirmOptions) => setOptions(o), []);
  return [ask, <ConfirmDialog key="confirm" options={options} onClose={() => setOptions(null)} />];
}
