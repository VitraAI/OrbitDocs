'use client';

import { Button, Chip, Form, Input, Label, Spinner, Switch, TextField } from '@heroui/react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { LuShieldCheck, LuUserPlus } from 'react-icons/lu';

import { useConfirm } from '@/components/confirm';
import { globalTabs, Page, Shell, TitleBand } from '@/components/shell';
import { CodeLine, DataTable, Panel } from '@/components/ui';
import { ago, api, type Me, useApi } from '@/lib/api';

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  active: boolean;
  externalId: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

interface AuditEntry {
  id: number;
  at: string;
  actor: string;
  action: string;
  target: string | null;
  data: Record<string, unknown>;
  ip: string | null;
}

function Users({ me }: { me: NonNullable<Me['user']> }) {
  const { data, reload } = useApi<{ users: AdminUser[]; invitations: Array<{ id: string; email: string; expiresAt: string }> }>('/api/admin/users');
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const update = async (id: string, json: Record<string, unknown>) => {
    await api(`/api/admin/users/${id}`, { method: 'PATCH', json });
    await reload();
  };
  const [confirm, dialog] = useConfirm();
  const who = (u: AdminUser) => u.name ?? u.email;
  // Turning access on needs no confirmation; taking it away does.
  const setActive = (u: AdminUser, active: boolean) =>
    active
      ? void update(u.id, { active })
      : confirm({
          title: `Deactivate ${who(u)}?`,
          body: `${u.email} is signed out everywhere and cannot sign in until reactivated.${u.externalId ? ' Your identity provider (SCIM) may reactivate them on its next sync.' : ''}`,
          confirmLabel: 'Deactivate',
          action: () => update(u.id, { active }),
        });
  const setAdmin = (u: AdminUser, isAdmin: boolean) =>
    isAdmin
      ? void update(u.id, { isAdmin })
      : confirm({
          title: `Remove ${who(u)} as platform admin?`,
          body: 'They lose the Users and Activity pages and keep only the project roles they were given.',
          confirmLabel: 'Remove Admin',
          action: () => update(u.id, { isAdmin }),
        });
  if (!data) return <Spinner />;
  return (
    <div className="flex flex-col gap-6">
      {dialog}
      <Panel title="Invite someone" description="They choose a password, or sign in with SSO using the invited email. Add them to projects from each project's Members tab.">
        <Form
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await api<{ url: string }>('/api/admin/invitations', { method: 'POST', json: { email } });
            setLink(r.url);
            setEmail('');
            await reload();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <TextField value={email} onChange={setEmail} type="email" isRequired className="min-w-64 flex-1">
            <Label>Email</Label>
            <Input placeholder="teammate@company.com" variant="secondary" />
          </TextField>
          <Button type="submit">
            <LuUserPlus size={15} /> Invite
          </Button>
        </Form>
        {link ? (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-sm">Send this link (valid 7 days):</p>
            <CodeLine>{link}</CodeLine>
          </div>
        ) : null}
      </Panel>
      <Panel title="Users" description="Users provisioned by your identity provider (SCIM) show their external id; deactivating them there deactivates them here.">
        <DataTable
          label="Users"
          rows={data.users}
          rowKey={(u) => u.id}
          columns={[
            {
              title: 'User',
              cell: (u) => (
                <div>
                  <div className="flex items-center gap-1.5 font-medium">
                    {u.name ?? u.email.split('@')[0]} {u.isAdmin ? <LuShieldCheck size={13} className="text-[var(--accent)]" /> : null}
                  </div>
                  <div className="text-xs text-[var(--muted)]">{u.email}</div>
                </div>
              ),
            },
            { title: 'Source', cell: (u) => (u.externalId ? <Chip size="sm" variant="soft">SCIM</Chip> : <span className="text-[var(--muted)]">invite</span>) },
            { title: 'Last sign-in', cell: (u) => ago(u.lastLoginAt) },
            {
              title: 'Admin',
              cell: (u) => (
                <Switch size="sm" aria-label={`Admin: ${u.email}`} isSelected={u.isAdmin} isDisabled={u.id === me.id} onChange={(v) => setAdmin(u, v)}>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch>
              ),
            },
            {
              title: 'Active',
              cell: (u) => (
                <Switch size="sm" aria-label={`Active: ${u.email}`} isSelected={u.active} isDisabled={u.id === me.id} onChange={(v) => setActive(u, v)}>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch>
              ),
            },
          ]}
        />
        {data.invitations.length ? (
          <div className="mt-4 text-sm text-[var(--muted)]">
            Pending invitations: {data.invitations.map((i) => i.email).join(', ')}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

const ACTION_COLOR: Record<string, 'success' | 'danger' | 'warning' | 'accent' | 'default'> = { published: 'success', login_failed: 'danger', deactivated: 'danger', deprovisioned: 'danger', removed: 'warning', revoked: 'warning', rolled_back: 'warning' };

function AuditTable({ path }: { path: string }) {
  const [before, setBefore] = useState<number | null>(null);
  const { data } = useApi<AuditEntry[]>(`${path}${before ? `${path.includes('?') ? '&' : '?'}before=${before}` : ''}`);
  if (!data) return <Spinner />;
  return (
    <>
      <DataTable
        label="Audit log"
        rows={data}
        rowKey={(e) => String(e.id)}
        empty="Nothing recorded yet."
        columns={[
          { title: 'When', cell: (e) => <span title={new Date(e.at).toLocaleString()}>{ago(e.at)}</span> },
          { title: 'Who', cell: (e) => <span className="text-sm">{e.actor}</span> },
          { title: 'Action', cell: (e) => <Chip size="sm" variant="soft" color={ACTION_COLOR[e.action.split('.')[1] ?? ''] ?? 'default'}>{e.action}</Chip> },
          { title: 'Target', cell: (e) => <span className="mono text-xs">{e.target ?? '—'}</span> },
          { title: 'Details', cell: (e) => <span className="mono line-clamp-1 max-w-80 text-xs text-[var(--muted)]">{Object.keys(e.data).length ? JSON.stringify(e.data) : ''}</span> },
          { title: 'IP', cell: (e) => <span className="text-xs text-[var(--muted)]">{e.ip ?? ''}</span> },
        ]}
      />
      {data.length === 50 ? (
        <div className="mt-3 flex justify-center">
          <Button size="sm" variant="secondary" onPress={() => setBefore(data.at(-1)!.id)}>
            Older
          </Button>
        </div>
      ) : null}
    </>
  );
}

function AdminView({ me, tab }: { me: NonNullable<Me['user']>; tab: string }) {
  if (!me.isAdmin) return <Page>Platform admins only.</Page>;
  return (
    <>
      <TitleBand title={tab === 'audit' ? 'Activity' : 'Users'} description={tab === 'audit' ? 'Sign-ins, publishes, role changes, tokens, domains and user provisioning, newest first.' : 'Everyone who can sign in to the platform.'} />
      <Page>
        {tab === 'users' ? (
          <Users me={me} />
        ) : (
          <div className="card px-2 py-2">
            <AuditTable path="/api/admin/audit" />
          </div>
        )}
      </Page>
    </>
  );
}

function AdminRoute() {
  const tab = useSearchParams().get('tab') ?? 'users';
  return (
    <Shell tabs={(me) => globalTabs(me.isAdmin)} active={tab === 'audit' ? 'activity' : 'users'}>
      {(me) => <AdminView me={me} tab={tab} />}
    </Shell>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminRoute />
    </Suspense>
  );
}
