'use client';

import { Dropdown, Kbd, Label, Separator } from '@heroui/react';
import { Fragment, type MouseEvent as ReactMouseEvent, type ReactNode, useCallback, useRef, useState } from 'react';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Shortcut shown on the right, e.g. "⌘D". */
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  /** Draw a separator above this item. */
  separator?: boolean;
  onAction: () => void;
}

interface OpenMenu {
  x: number;
  y: number;
  label: string;
  items: ContextMenuItem[];
  /** Gets focus back when the menu closes. */
  origin: HTMLElement | null;
}

/**
 * A right-click menu for the API client, built on HeroUI's Dropdown and anchored
 * at the pointer. `bind(label, items)` returns the props for any element: it opens
 * on right-click and on the keyboard's context-menu key or Shift+F10.
 */
export function useContextMenu() {
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const restore = useRef<HTMLElement | null>(null);
  /** The last menu's element, kept after close so a dialog opened from the menu can hand focus back. */
  const last = useRef<{ el: HTMLElement; list: HTMLElement | null } | null>(null);

  /** Opens the menu for `el` (default: the element the handler is on). */
  const show = useCallback((e: ReactMouseEvent<HTMLElement>, label: string, items: ContextMenuItem[], el?: HTMLElement) => {
    if (!items.length) return;
    e.preventDefault();
    e.stopPropagation();
    const target = el ?? e.currentTarget;
    // Keyboard-opened menus have no pointer position: anchor under the element.
    const fromKeyboard = e.clientX === 0 && e.clientY === 0;
    const rect = target.getBoundingClientRect();
    const x = fromKeyboard ? rect.left + 12 : e.clientX;
    const y = fromKeyboard ? rect.bottom : e.clientY;
    restore.current = target;
    last.current = { el: target, list: target.parentElement?.closest<HTMLElement>('[role="listbox"],[role="tablist"],[role="grid"],[role="tree"]') ?? null };
    setMenu({ x, y, label, items, origin: target });
  }, []);

  const bind = useCallback(
    (label: string, items: ContextMenuItem[] | (() => ContextMenuItem[])) => ({
      onContextMenu: (e: ReactMouseEvent<HTMLElement>) => show(e, label, typeof items === 'function' ? items() : items),
    }),
    [show],
  );

  const close = useCallback(() => {
    setMenu(null);
    const el = restore.current;
    restore.current = null;
    if (el?.isConnected) requestAnimationFrame(() => el.focus({ preventScroll: true }));
  }, []);

  /** Focuses the last menu's element again, or its list when the element is gone (deleted). */
  const returnFocus = useCallback(() => {
    const at = last.current;
    if (!at) return;
    // After the dialog's own focus restore, which runs as it unmounts.
    setTimeout(() => {
      const el = at.el.isConnected ? at.el : at.list?.isConnected ? at.list : null;
      el?.focus({ preventScroll: true });
    }, 0);
  }, []);

  const element = menu ? (
    <Dropdown isOpen onOpenChange={(o) => (o ? undefined : close())}>
      {/* An invisible trigger at the pointer, so the menu opens where the reader clicked. */}
      <Dropdown.Trigger aria-label={menu.label} className="oc-ctx-anchor" style={{ left: menu.x, top: menu.y }} />
      <Dropdown.Popover placement="bottom start" offset={4} className="oc-ctx-menu">
        <Dropdown.Menu
          aria-label={menu.label}
          disabledKeys={menu.items.filter((i) => i.disabled).map((i) => i.id)}
          onAction={(key) => {
            const item = menu.items.find((i) => i.id === key);
            close();
            item?.onAction();
          }}
        >
          {menu.items.map((item) => (
            <Fragment key={item.id}>
              {item.separator ? <Separator /> : null}
              <Dropdown.Item id={item.id} textValue={item.label} variant={item.danger ? 'danger' : undefined}>
                {item.icon ? <span className="oc-ctx-icon">{item.icon}</span> : null}
                <Label>{item.label}</Label>
                {item.shortcut ? (
                  <Kbd className="ms-auto" slot="keyboard" variant="light">
                    <Kbd.Content>{item.shortcut}</Kbd.Content>
                  </Kbd>
                ) : null}
              </Dropdown.Item>
            </Fragment>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  ) : null;

  return { bind, open: show, element, close, returnFocus };
}

export type ContextMenuApi = ReturnType<typeof useContextMenu>;

/** For lists (ListBox): the right-clicked item's element and its `data-key`. */
export function itemFromEvent(e: ReactMouseEvent<HTMLElement>): { el: HTMLElement; key: string } | null {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-key]');
  const key = el?.getAttribute('data-key');
  return el && key && e.currentTarget.contains(el) ? { el, key } : null;
}
