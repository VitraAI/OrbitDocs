'use client';

import { Button, ColorSwatchPicker, Drawer, Kbd, Label, Separator, Slider, Switch, ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { LuColumns2 as Columns2, LuRows2 as Rows2 } from 'react-icons/lu';
import type { ReactNode } from 'react';

import type { ClientSettings } from '../settings';

const ACCENTS = ['', '#3B82F6', '#8B5CF6', '#EC4899', '#F43F5E', '#F59E0B', '#10B981', '#06B6D4'];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="oc-settings-section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

function Toggle({ label, value, onChange, description }: { label: string; value: boolean; onChange: (v: boolean) => void; description?: string }) {
  return (
    <div className="oc-setting-row">
      <Switch isSelected={value} onChange={onChange}>
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          {label}
        </Switch.Content>
      </Switch>
      {description ? <p className="oc-hint">{description}</p> : null}
    </div>
  );
}

const SHORTCUTS: Array<[string, string]> = [
  ['↵', 'Send request'],
  ['K', 'Command palette'],
  ['B', 'Toggle sidebar'],
  ['J', 'Toggle layout'],
  ['E', 'Environments'],
  ['/', 'Search requests'],
];

export function SettingsDrawer({
  open,
  onOpenChange,
  settings,
  onChange,
  onReset,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  settings: ClientSettings;
  onChange: (p: Partial<ClientSettings>) => void;
  onReset: () => void;
}) {
  return (
    <Drawer>
      <Drawer.Backdrop isOpen={open} onOpenChange={onOpenChange} variant="transparent">
        <Drawer.Content placement="right" className="oc-settings">
          <Drawer.Dialog>
            <Drawer.CloseTrigger />
            <Drawer.Header>
              <Drawer.Heading>Client settings</Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body className="oc-settings-body">
              <Section title="Layout">
                <ToggleButtonGroup
                  aria-label="Layout"
                  selectionMode="single"
                  disallowEmptySelection
                  selectedKeys={new Set([settings.layout])}
                  onSelectionChange={(k) => onChange({ layout: [...k][0] as ClientSettings['layout'] })}
                >
                  <ToggleButton id="side-by-side">
                    <Columns2 size={14} /> Side by side
                  </ToggleButton>
                  <ToggleButton id="stacked">
                    <ToggleButtonGroup.Separator />
                    <Rows2 size={14} /> Stacked
                  </ToggleButton>
                </ToggleButtonGroup>
                <ToggleButtonGroup
                  aria-label="Density"
                  selectionMode="single"
                  disallowEmptySelection
                  selectedKeys={new Set([settings.density])}
                  onSelectionChange={(k) => onChange({ density: [...k][0] as ClientSettings['density'] })}
                >
                  <ToggleButton id="comfortable">Comfortable</ToggleButton>
                  <ToggleButton id="compact">
                    <ToggleButtonGroup.Separator />
                    Compact
                  </ToggleButton>
                </ToggleButtonGroup>
                <Toggle label="Show sidebar" value={settings.showSidebar} onChange={(showSidebar) => onChange({ showSidebar })} />
              </Section>
              <Separator />
              <Section title="Appearance">
                <Slider value={settings.fontSize} minValue={11} maxValue={18} step={1} onChange={(v) => onChange({ fontSize: Array.isArray(v) ? v[0]! : v })}>
                  <Label>Editor font size</Label>
                  <Slider.Output>{({ state }: { state: { values: number[] } }) => `${state.values[0]} px`}</Slider.Output>
                  <Slider.Track>
                    <Slider.Fill />
                    <Slider.Thumb />
                  </Slider.Track>
                </Slider>
                <div className="oc-field">
                  <Label>Accent</Label>
                  <ColorSwatchPicker aria-label="Accent colour" value={settings.accent || '#3B82F6'} onChange={(c) => onChange({ accent: c.toString('hex') })}>
                    {ACCENTS.filter(Boolean).map((c) => (
                      <ColorSwatchPicker.Item key={c} color={c}>
                        <ColorSwatchPicker.Swatch />
                        <ColorSwatchPicker.Indicator />
                      </ColorSwatchPicker.Item>
                    ))}
                  </ColorSwatchPicker>
                  {settings.accent ? (
                    <Button size="sm" variant="ghost" onPress={() => onChange({ accent: '' })}>
                      Use the site accent
                    </Button>
                  ) : null}
                </div>
                <Toggle label="Wrap long lines" value={settings.wrapLines} onChange={(wrapLines) => onChange({ wrapLines })} />
              </Section>
              <Separator />
              <Section title="Safety">
                <Toggle
                  label="Confirm before sending to production"
                  value={settings.confirmProduction}
                  onChange={(confirmProduction) => onChange({ confirmProduction })}
                  description="Environments marked Production ask before every send."
                />
              </Section>
              <Separator />
              <Section title="Keyboard shortcuts">
                <div className="oc-shortcuts">
                  {SHORTCUTS.map(([key, label]) => (
                    <div key={label} className="oc-shortcut">
                      <span>{label}</span>
                      <Kbd>
                        <Kbd.Abbr keyValue="command" />
                        <Kbd.Content>{key}</Kbd.Content>
                      </Kbd>
                    </div>
                  ))}
                </div>
              </Section>
            </Drawer.Body>
            <Drawer.Footer>
              <Button variant="ghost" onPress={onReset}>
                Reset to defaults
              </Button>
              <Button slot="close">Done</Button>
            </Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}
