'use client';

import { Button, CloseButton, Tooltip } from '@heroui/react';
import { LuPlus as Plus } from 'react-icons/lu';

import type { RequestDraft } from '../types';
import { MethodTag } from './rail';

/** Open requests, like browser tabs. Middle-click or × closes one. */
export function TabStrip({
  tabs,
  activeId,
  dirty,
  onActivate,
  onClose,
  onNew,
  onContextMenu,
}: {
  tabs: RequestDraft[];
  activeId?: string;
  dirty: Set<string>;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onContextMenu?: (e: React.MouseEvent<HTMLElement>, id: string) => void;
}) {
  return (
    <div className="oc-tabstrip">
      <div className="oc-tabstrip-scroll">
        <div className="oc-tabstrip-inner" aria-label="Open requests">
          {tabs.map((t) => (
            <div
              key={t.id}
              className="oc-reqtab"
              data-active={t.id === activeId || undefined}
              onAuxClick={(e) => {
                if (e.button === 1) onClose(t.id);
              }}
              onContextMenu={onContextMenu ? (e) => onContextMenu(e, t.id) : undefined}
            >
              <Button variant="ghost" size="sm" aria-current={t.id === activeId || undefined} className="oc-reqtab-button" onPress={() => onActivate(t.id)}>
                <MethodTag method={t.method} />
                <span className="oc-ellipsis">{t.name}</span>
                {dirty.has(t.id) ? <span className="oc-dot" aria-label="Sent" /> : null}
              </Button>
              <CloseButton aria-label={`Close ${t.name}`} className="oc-reqtab-close" onPress={() => onClose(t.id)} />
            </div>
          ))}
        </div>
      </div>
      <Tooltip delay={300}>
        <Button isIconOnly size="sm" variant="ghost" aria-label="New request" onPress={onNew}>
          <Plus size={14} />
        </Button>
        <Tooltip.Content>New request</Tooltip.Content>
      </Tooltip>
    </div>
  );
}
