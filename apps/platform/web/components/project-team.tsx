'use client';

import { Button, Chip, Description, Input, Label, ListBox, Select, Spinner, Switch, TextField, ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { LuGlobe, LuKeyRound, LuLock, LuMessageCircleQuestion, LuPlus, LuTrash2, LuUserPlus } from 'react-icons/lu';
import { SiGithub, SiGitlab } from 'react-icons/si';

import { ago, api, can, type Role, useApi } from '@/lib/api';

import { useConfirm } from './confirm';
import type { Project } from './project-site';
import { CodeLine, DataTable, Panel, Setting, Stat, Status } from './ui';

const ROLES: Role[] = ['owner', 'admin', 'editor', 'viewer'];

function RoleSelect({ value, onChange, isDisabled, label = 'Role' }: { value: Role; onChange: (r: Role) => void; isDisabled?: boolean; label?: string }) {
  return (
    <Select aria-label={label} value={value} onChange={(k) => onChange(k as Role)} isDisabled={isDisabled} className="w-32">
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {ROLES.map((r) => (
            <ListBox.Item key={r} id={r} textValue={r}>
              {r}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

interface Analytics {
  provider: string;
  days: number;
  totals: { views: number; visitors: number; questions: number; unanswered: number };
  series: Array<{ day: string; views: number; visitors: number }>;
  pages: Array<{ path: string; views: number }>;
  referrers: Array<{ referrer: string; views: number }>;
  questions: Array<{ query: string; results: number; at: string }>;
}

export function AnalyticsTab({ project }: { project: Project }) {
  const [days, setDays] = useState(30);
  const { data, loading } = useApi<Analytics>(`/api/projects/${project.slug}/analytics?days=${days}`);
  if (loading && !data) return <Spinner />;
  if (!data) return null;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          {data.provider === 'builtin' ? 'Built-in analytics: no cookies, visitors counted by a daily hash.' : `Page views go to ${data.provider}; Ask AI questions are counted here.`}
        </p>
        <ToggleButtonGroup aria-label="Period" selectionMode="single" disallowEmptySelection selectedKeys={new Set([String(days)])} onSelectionChange={(k) => setDays(Number([...k][0]))} size="sm">
          {[7, 30, 90].map((d, i) => (
            <ToggleButton key={d} id={String(d)}>
              {i ? <ToggleButtonGroup.Separator /> : null}
              {d} days
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Page views" value={data.totals.views.toLocaleString()} />
        <Stat label="Visitors" value={data.totals.visitors.toLocaleString()} />
        <Stat label="Ask AI questions" value={data.totals.questions.toLocaleString()} />
        <Stat label="Not covered by docs" value={data.totals.unanswered.toLocaleString()} hint="Questions with no matching page" />
      </div>
      <Panel title="Traffic">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.series} margin={{ left: -20, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="views" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
              <ChartTooltip contentStyle={{ background: 'var(--overlay)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }} />
              <Area type="monotone" dataKey="views" name="Views" stroke="var(--accent)" strokeWidth={2} fill="url(#views)" />
              <Area type="monotone" dataKey="visitors" name="Visitors" stroke="var(--success)" strokeWidth={2} fillOpacity={0} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Top pages">
          <DataTable minWidth={0} label="Top pages" rows={data.pages} rowKey={(p) => p.path} empty="No views yet." columns={[{ title: 'Page', cell: (p) => <span className="mono text-xs">{p.path}</span> }, { title: 'Views', className: 'text-right', cell: (p) => p.views }]} />
        </Panel>
        <Panel title="Referrers">
          <DataTable minWidth={0} label="Referrers" rows={data.referrers} rowKey={(r) => r.referrer} empty="No referrers yet." columns={[{ title: 'Site', cell: (r) => r.referrer }, { title: 'Views', className: 'text-right', cell: (r) => r.views }]} />
        </Panel>
      </div>
      <Panel title="What readers ask" description="Latest Ask AI questions. Those the docs don't cover are worth a new guide.">
        <DataTable
          minWidth={480}
          label="Questions"
          rows={data.questions}
          rowKey={(q) => q.at + q.query}
          empty="No questions yet."
          columns={[
            { title: 'Question', cell: (q) => <span className="flex items-center gap-2"><LuMessageCircleQuestion size={14} className="shrink-0 text-[var(--muted)]" /> {q.query}</span> },
            { title: 'Coverage', cell: (q) => <Chip size="sm" variant="soft" color={q.results ? 'success' : 'warning'}>{q.results ? `${q.results} pages` : 'not covered'}</Chip> },
            { title: 'Asked', className: 'text-right', cell: (q) => ago(q.at) },
          ]}
        />
      </Panel>
    </div>
  );
}

interface Member {
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  active: boolean;
  since: string;
}

function Members({ project, me }: { project: Project; me: { id: string } }) {
  const { data, reload } = useApi<Member[]>(`/api/projects/${project.slug}/members`);
  const admin = can(project.role, 'admin');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('editor');
  const [result, setResult] = useState<{ url?: string; added?: boolean; error?: string } | null>(null);
  const [confirm, dialog] = useConfirm();
  const remove = (m: Member) =>
    confirm({
      title: `Remove ${m.name ?? m.email} from ${project.name}?`,
      body: 'They lose access to this project at once. Invite them again to bring them back.',
      confirmLabel: 'Remove Member',
      action: async () => {
        await api(`/api/projects/${project.slug}/members/${m.userId}`, { method: 'DELETE' });
        await reload();
      },
    });
  const invite = async () => {
    try {
      const r = await api<{ url?: string; added?: boolean }>(`/api/projects/${project.slug}/members`, { method: 'POST', json: { email, role } });
      setResult(r);
      setEmail('');
      await reload();
    } catch (err) {
      setResult({ error: (err as Error).message });
    }
  };
  return (
    <div className="flex flex-col gap-6">
      {dialog}
      {admin ? (
        <Setting
          title="Invite Members"
          description="People with an account join at once. Others get an invitation link to send them."
          note={result?.error ? <span className="text-[var(--danger)]">{result.error}</span> : result?.added ? 'Added.' : 'Owners manage everything; admins manage members, tokens, domains and Git; editors publish and roll back; viewers read.'}
          actions={
            <Button size="sm" onPress={invite} isDisabled={!/^\S+@\S+\.\S+$/.test(email)}>
              <LuUserPlus size={14} /> Invite
            </Button>
          }
        >
          <div className="flex flex-wrap items-end gap-3">
            <TextField className="min-w-64 flex-1" value={email} onChange={setEmail} type="email" aria-label="Email">
              <Input placeholder="teammate@company.com" />
            </TextField>
            <RoleSelect value={role} onChange={setRole} />
          </div>
          {result?.url ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm">Invitation link (valid 7 days):</span>
              <CodeLine>{result.url}</CodeLine>
            </div>
          ) : null}
        </Setting>
      ) : null}
      <div className="list">
        {(data ?? []).map((m) => (
          <div key={m.userId} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
            <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-[#0070f3] to-[#50e3c2] text-xs font-semibold text-white">{(m.name ?? m.email).slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{m.name ?? m.email.split('@')[0]}</div>
              <div className="text-[13px] text-[var(--muted)]">{m.email}</div>
            </div>
            {!m.active ? <Status status="removed" label="Deactivated" /> : null}
            {admin && m.userId !== me.id ? (
              <>
                <RoleSelect label={`Role of ${m.email}`} value={m.role} onChange={async (r) => { await api(`/api/projects/${project.slug}/members/${m.userId}`, { method: 'PATCH', json: { role: r } }); await reload(); }} />
                <Button isIconOnly size="sm" variant="ghost" aria-label={`Remove ${m.email}`} onPress={() => remove(m)}>
                  <LuTrash2 size={14} />
                </Button>
              </>
            ) : (
              <span className="text-sm text-[var(--muted)] capitalize">{m.role}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function General({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [blockOnLint, setBlockOnLint] = useState(project.blockOnLint);
  const [provider, setProvider] = useState(project.analytics.provider);
  const [siteId, setSiteId] = useState(project.analytics.siteId ?? '');
  const [host, setHost] = useState(project.analytics.host ?? '');
  const [saved, setSaved] = useState<string | null>(null);
  const save = async (what: string, json: Record<string, unknown>) => {
    await api(`/api/projects/${project.slug}`, { method: 'PATCH', json });
    setSaved(what);
    setTimeout(() => setSaved(null), 2000);
    onSaved();
  };
  const router = useRouter();
  const [confirm, dialog] = useConfirm();
  const deleteProject = () =>
    confirm({
      title: `Delete ${project.name}?`,
      body: 'The site, its previews, domains, tokens, registry history and analytics are deleted for everyone. This cannot be undone.',
      confirmLabel: 'Delete Project',
      typeToConfirm: project.name,
      action: async () => {
        await api(`/api/projects/${project.slug}`, { method: 'DELETE' });
        router.replace('/');
      },
    });
  return (
    <div className="flex flex-col gap-6">
      {dialog}
      <Setting title="Project Name" description="Used to identify the project on the dashboard." note={saved === 'name' ? 'Saved.' : 'Please use 48 characters at maximum.'} actions={<Button size="sm" onPress={() => save('name', { name, description })}>Save</Button>}>
        <TextField value={name} onChange={setName} aria-label="Project name" className="max-w-md">
          <Input />
        </TextField>
        <TextField value={description} onChange={setDescription} aria-label="Description" className="max-w-md">
          <Input placeholder="Description (optional)" />
        </TextField>
      </Setting>
      <Setting title="Lint Gate" description="Spectral checks every spec on publish. Turn this on to refuse a production publish while a spec has lint errors." note={saved === 'lint' ? 'Saved.' : 'Previews are never blocked: their lint counts appear on the deployment, the build and the pull or merge request comment.'} actions={<Button size="sm" onPress={() => save('lint', { blockOnLint })}>Save</Button>}>
        <Switch isSelected={blockOnLint} onChange={setBlockOnLint}>
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            Block production publishes with lint errors
          </Switch.Content>
        </Switch>
      </Setting>
      <Setting
        title="Analytics"
        description="Built-in analytics count page views without cookies. Or send them to Plausible, Umami or PostHog; Ask AI questions are always counted here."
        note={saved === 'analytics' ? 'Saved.' : 'The script is added to every page when the site is served.'}
        actions={<Button size="sm" onPress={() => save('analytics', { analytics: { provider, siteId: siteId || undefined, host: host || undefined } })}>Save</Button>}
      >
        <div className="flex flex-wrap gap-3">
          <Select aria-label="Analytics provider" value={provider} onChange={(k) => setProvider(String(k))} className="w-44">
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {[
                  ['builtin', 'Built-in'],
                  ['plausible', 'Plausible'],
                  ['umami', 'Umami'],
                  ['posthog', 'PostHog'],
                ].map(([id, label]) => (
                  <ListBox.Item key={id} id={id} textValue={label}>
                    {label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          {provider !== 'builtin' ? (
            <>
              <TextField value={siteId} onChange={setSiteId} aria-label="Site id" className="w-56">
                <Input placeholder={provider === 'plausible' ? 'docs.acme.com' : provider === 'umami' ? 'Website ID' : 'Project API key'} />
              </TextField>
              <TextField value={host} onChange={setHost} aria-label="Host" className="w-56">
                <Input placeholder="Self-hosted URL (optional)" />
              </TextField>
            </>
          ) : null}
        </div>
      </Setting>
      {can(project.role, 'owner') ? (
        <Setting
          danger
          title="Delete Project"
          description="Permanently delete this project: its live site and previews, custom domains, publish tokens, API registry, build history and analytics."
          note="This cannot be undone."
          actions={
            <Button size="sm" variant="danger" onPress={deleteProject}>
              <LuTrash2 size={14} /> Delete
            </Button>
          }
        />
      ) : null}
    </div>
  );
}

interface Token {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

function Tokens({ project }: { project: Project }) {
  const { data, reload } = useApi<Token[]>(`/api/projects/${project.slug}/tokens`);
  const [name, setName] = useState('CI');
  const [created, setCreated] = useState<string | null>(null);
  const origin = typeof window === 'undefined' ? '' : location.origin;
  const [confirm, dialog] = useConfirm();
  const revoke = (t: Token) =>
    confirm({
      title: `Revoke token ${t.name}?`,
      body: <>Publishes with <span className="mono font-medium text-[var(--foreground)]">{t.prefix}…</span> are refused from now on. A revoked token cannot be restored.</>,
      confirmLabel: 'Revoke Token',
      action: async () => {
        await api(`/api/projects/${project.slug}/tokens/${t.id}`, { method: 'DELETE' });
        await reload();
      },
    });
  return (
    <div className="flex flex-col gap-6">
      {dialog}
      <Setting
        title="Publish Tokens"
        description="For `orbitdocs publish` in your CI. A token is shown once; store it as a secret."
        note="Tokens publish to this project only."
        actions={
          <Button size="sm" onPress={async () => { const r = await api<{ token: string }>(`/api/projects/${project.slug}/tokens`, { method: 'POST', json: { name } }); setCreated(r.token); await reload(); }}>
            <LuKeyRound size={14} /> Create
          </Button>
        }
      >
        <TextField value={name} onChange={setName} aria-label="Token name" className="max-w-xs">
          <Input placeholder="Token name" />
        </TextField>
        {created ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm">Copy it now, it won&apos;t be shown again:</span>
            <CodeLine>{created}</CodeLine>
            <CodeLine>{`ORBITDOCS_TOKEN=${created} npx orbitdocs publish --platform ${origin}`}</CodeLine>
          </div>
        ) : null}
      </Setting>
      {data?.length ? (
        <div className="list">
          {data.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
              <LuKeyRound size={15} className="text-[var(--muted)]" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{t.name}</div>
                <div className="mono text-[13px] text-[var(--muted)]">{t.prefix}…</div>
              </div>
              <span className="text-[13px] text-[var(--muted)]">{t.lastUsedAt ? `Used ${ago(t.lastUsedAt)}` : 'Never used'}</span>
              {t.revokedAt ? (
                <Status status="removed" label="Revoked" />
              ) : (
                <Button size="sm" variant="secondary" onPress={() => revoke(t)}>
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface DomainRow {
  id: string;
  hostname: string;
  verified: boolean;
  verifyToken: string;
}

function Domains({ project, domain }: { project: Project; domain: string }) {
  const { data, reload } = useApi<DomainRow[]>(`/api/projects/${project.slug}/domains`);
  const [host, setHost] = useState('');
  const [error, setError] = useState<string | null>(null);
  const platformHost = domain.replace(/:\d+$/, '');
  const [confirm, dialog] = useConfirm();
  const remove = (d: DomainRow) =>
    confirm({
      title: `Remove ${d.hostname}?`,
      body: `The site stops answering on ${d.hostname}. Adding it back needs DNS verification again.`,
      confirmLabel: 'Remove Domain',
      action: async () => {
        await api(`/api/projects/${project.slug}/domains/${d.id}`, { method: 'DELETE' });
        await reload();
      },
    });
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <div className="flex flex-col gap-6">
      {dialog}
      <Setting
        title="Domains"
        description={<>The project is always at <span className="mono">{project.slug}.{domain}</span>. Add your own domain; HTTPS certificates are issued automatically.</>}
        note={error ? <span className="text-[var(--danger)]">{error}</span> : 'Point a CNAME at the platform, or prove ownership with a TXT record.'}
        actions={<Button size="sm" onPress={() => void run(async () => { await api(`/api/projects/${project.slug}/domains`, { method: 'POST', json: { hostname: host } }); setHost(''); })}><LuPlus size={14} /> Add</Button>}
      >
        <TextField value={host} onChange={setHost} aria-label="Domain" className="max-w-md">
          <Input placeholder="docs.acme.com" />
        </TextField>
      </Setting>
      {data?.length ? (
        <div className="list">
          {data.map((d) => (
            <div key={d.id} className="flex flex-col gap-3 px-5 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <LuGlobe size={16} className="text-[var(--muted)]" />
                <span className="font-medium">{d.hostname}</span>
                <Status status={d.verified ? 'ready' : 'building'} label={d.verified ? 'Valid Configuration' : 'Invalid Configuration'} />
                <span className="ml-auto flex gap-2">
                  {!d.verified ? (
                    <Button size="sm" variant="secondary" onPress={() => void run(() => api(`/api/projects/${project.slug}/domains/${d.id}/verify`, { method: 'POST' }))}>
                      Refresh
                    </Button>
                  ) : null}
                  <Button size="sm" variant="secondary" onPress={() => remove(d)}>
                    Remove
                  </Button>
                </span>
              </div>
              {!d.verified ? (
                <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                  <table className="w-full text-[13px]">
                    <thead className="bg-[var(--surface-secondary)] text-left text-[var(--muted)]">
                      <tr>
                        <th className="px-4 py-2 font-medium">Type</th>
                        <th className="px-4 py-2 font-medium">Name</th>
                        <th className="px-4 py-2 font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody className="mono">
                      <tr className="border-t border-[var(--border)]">
                        <td className="px-4 py-2">CNAME</td>
                        <td className="px-4 py-2">{d.hostname.replace(/:\d+$/, '')}</td>
                        <td className="px-4 py-2">{platformHost}</td>
                      </tr>
                      <tr className="border-t border-[var(--border)]">
                        <td className="px-4 py-2">TXT</td>
                        <td className="px-4 py-2">_orbitdocs.{d.hostname.replace(/:\d+$/, '')}</td>
                        <td className="px-4 py-2">{d.verifyToken}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GitSettings({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const g = project.git;
  const [provider, setProvider] = useState<'github' | 'gitlab'>((g?.provider as 'github' | 'gitlab') ?? 'gitlab');
  const [form, setForm] = useState({
    repo: g?.repo ?? '',
    branch: g?.branch ?? 'main',
    apiUrl: g?.apiUrl ?? '',
    cloneUrl: g?.cloneUrl ?? '',
    docsDir: g?.docsDir ?? 'docs',
    installCommand: g?.installCommand ?? '',
    buildCommand: g?.buildCommand ?? 'npx orbitdocs build',
    outputDir: g?.outputDir ?? 'out',
    token: '',
  });
  const { data: secrets, reload } = useApi<{ webhookUrl: string; webhookSecret: string } | null>(g ? `/api/projects/${project.slug}/git` : null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const [confirm, dialog] = useConfirm();
  const disconnect = () =>
    confirm({
      title: `Disconnect ${g?.repo}?`,
      body: 'Pushes and pull or merge requests stop publishing. The saved access token, webhook secret and build environment variables are deleted.',
      confirmLabel: 'Disconnect',
      action: async () => {
        await api(`/api/projects/${project.slug}/git`, { method: 'PATCH', json: { enabled: false } });
        onSaved();
      },
    });
  const save = async () => {
    setError(null);
    try {
      // An empty clone URL clears it; an empty install command means automatic.
      await api(`/api/projects/${project.slug}/git`, { method: 'PATCH', json: { provider, ...form, apiUrl: form.apiUrl || undefined, token: form.token || undefined } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const field = (k: keyof typeof form, label: string, placeholder?: string, type = 'text', description?: string) => (
    <TextField value={form[k]} onChange={set(k)} type={type}>
      <Label className="text-[13px] font-normal text-[var(--muted)]">{label}</Label>
      <Input placeholder={placeholder} className="mono text-[13px]" />
      {description ? <Description className="text-xs">{description}</Description> : null}
    </TextField>
  );
  return (
    <div className="flex flex-col gap-6">
      {dialog}
      <Setting
        title="Connected Git Repository"
        description="Pushes to the production branch publish the site. Every pull or merge request gets a preview, linked from a comment and removed when it closes."
        note={error ? <span className="text-[var(--danger)]">{error}</span> : saved ? 'Saved.' : g ? `Connected to ${g.repo}` : 'Not connected.'}
        actions={
          <>
            {g ? (
              <Button size="sm" variant="secondary" onPress={disconnect}>
                Disconnect
              </Button>
            ) : null}
            <Button size="sm" onPress={save}>
              {g ? 'Save' : 'Connect'}
            </Button>
          </>
        }
      >
        <ToggleButtonGroup aria-label="Provider" selectionMode="single" disallowEmptySelection selectedKeys={new Set([provider])} onSelectionChange={(k) => setProvider([...k][0] as 'github' | 'gitlab')} className="w-fit">
          <ToggleButton id="gitlab">
            <SiGitlab size={14} /> GitLab
          </ToggleButton>
          <ToggleButton id="github">
            <ToggleButtonGroup.Separator />
            <SiGithub size={14} /> GitHub
          </ToggleButton>
        </ToggleButtonGroup>
        <div className="grid gap-4 md:grid-cols-2">
          {field('repo', provider === 'gitlab' ? 'Project' : 'Repository', 'acme/payments-api')}
          {field('branch', 'Production Branch', 'main')}
          {field('token', g?.hasToken ? 'Access Token (saved; enter to replace)' : 'Access Token', provider === 'gitlab' ? 'Project token, api scope' : 'Fine-grained: contents read, statuses + PRs write', 'password')}
          {field('apiUrl', 'API URL', provider === 'gitlab' ? 'https://gitlab.com/api/v4' : 'https://api.github.com', 'text', provider === 'gitlab' ? 'Self-managed: https://gitlab.acme.com/api/v4' : 'GitHub Enterprise: https://github.acme.com/api/v3')}
        </div>
      </Setting>
      <Setting title="Build & Output Settings" description="How the platform builds your docs app after cloning the commit." note="Runs in a fresh checkout for every build, with only the build environment below." actions={<Button size="sm" onPress={save}>Save</Button>}>
        <div className="grid gap-4 md:grid-cols-2">
          {field('docsDir', 'Root Directory', 'docs')}
          {field('outputDir', 'Output Directory', 'out')}
          {field('installCommand', 'Install Command', 'Automatic', 'text', 'Empty: installs the docs app and the Nest app above it from their lockfiles (npm, pnpm, Yarn or Bun).')}
          {field('buildCommand', 'Build Command', 'npx orbitdocs build')}
          {field('cloneUrl', 'Clone URL (optional)', 'Derived from the API URL and repository')}
        </div>
      </Setting>
      {g ? <BuildEnv project={project} onSaved={onSaved} /> : null}
      {secrets ? (
        <Setting title="Webhook" description={provider === 'gitlab' ? 'In GitLab: Settings → Webhooks, with push and merge request events.' : 'In GitHub: Settings → Webhooks, content type JSON, with pushes and pull requests.'}>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] text-[var(--muted)]">URL</span>
            <CodeLine>{secrets.webhookUrl}</CodeLine>
            <span className="text-[13px] text-[var(--muted)]">{provider === 'gitlab' ? 'Secret token' : 'Secret'}</span>
            <CodeLine>{secrets.webhookSecret}</CodeLine>
          </div>
        </Setting>
      ) : null}
    </div>
  );
}

/** Build environment variables: stored encrypted, listed by name only, never shown again. */
function BuildEnv({ project, onSaved }: { project: Project; onSaved: () => void }) {
  return (
    <EnvVariables
      title="Build Environment Variables"
      description="Install and build commands get only these variables, plus PATH, HOME, locale, proxy and package-manager settings, CI=true and ORBITDOCS_PLATFORM_BUILD=1. The platform's own secrets are never passed."
      keys={project.git?.envKeys ?? []}
      placeholder="API_BASE_URL"
      next="build"
      save={async (env) => {
        await api(`/api/projects/${project.slug}/git`, { method: 'PATCH', json: { env } });
        onSaved();
      }}
    />
  );
}

type SiteEnvStatus = { keys: string[]; used: Array<{ key: string; usedBy: string; set: boolean }> };

/** Secrets the hosted site's sign-in and Ask AI read: the site sees these and nothing else. */
function SiteEnv({ project }: { project: Project }) {
  const { data, reload } = useApi<SiteEnvStatus>(`/api/projects/${project.slug}/site-env`);
  const [prefill, setPrefill] = useState<{ key: string; n: number } | null>(null);
  const missing = data?.used.filter((u) => !u.set) ?? [];
  return (
    <div className="flex flex-col gap-6">
      <EnvVariables
        key={prefill?.n ?? 0}
        title="Site Environment Variables"
        description={
          <>
            The live site&apos;s single sign-on, app-session reuse, personalization hook and Ask AI read their secrets from these variables, by the names in your <code className="mono text-[13px]">orbitdocs.config.ts</code>. The site gets only these variables and its session key, never the platform&apos;s own environment.
          </>
        }
        keys={data?.keys ?? []}
        initialKey={prefill?.key}
        placeholder="OKTA_CLIENT_SECRET"
        next="site"
        save={async (env) => {
          await api(`/api/projects/${project.slug}/site-env`, { method: 'PATCH', json: { env } });
          await reload();
        }}
      />
      <Setting
        title="Used by the Live Site"
        description="The variables the production deployment reads, from its private docs and Ask AI settings."
        note={missing.length ? <span className="text-[var(--warning)]">{missing.length === 1 ? '1 variable is' : `${missing.length} variables are`} missing: those features fail until it is set.</span> : undefined}
      >
        {!data ? (
          <Spinner size="sm" />
        ) : data.used.length ? (
          <div className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
            {data.used.map((u) => (
              <div key={u.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="mono min-w-0 truncate text-[13px] font-medium">{u.key}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--muted)]">{u.usedBy}</span>
                {u.set ? (
                  <Status status="ready" label="Set" />
                ) : (
                  <>
                    <Status status="warning" label="Missing" />
                    <Button size="sm" variant="secondary" onPress={() => setPrefill({ key: u.key, n: Date.now() })}>
                      <LuPlus size={14} /> Set
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">The live site reads no secrets: it has no single sign-on, personalization hook or Ask AI, or nothing is published yet.</p>
        )}
      </Setting>
    </div>
  );
}

/** Encrypted variables: listed by name only, values never shown again. */
function EnvVariables({
  title,
  description,
  keys,
  placeholder,
  initialKey = '',
  next,
  save,
}: {
  title: string;
  description: ReactNode;
  keys: string[];
  placeholder: string;
  initialKey?: string;
  /** What uses a change: the next build, or the site's next request. */
  next: 'build' | 'site';
  save: (env: Record<string, string | null>) => Promise<void>;
}) {
  const [key, setKey] = useState(initialKey);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const validKey = /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
  const [confirm, dialog] = useConfirm();
  const whenUsed = next === 'build' ? 'The next build' : 'The site';
  const send = async (env: Record<string, string | null>) => {
    await save(env);
    setKey('');
    setValue('');
  };
  const remove = (k: string) =>
    confirm({
      title: `Remove ${k}?`,
      body: `Its encrypted value is deleted. ${next === 'build' ? 'The next build runs without it.' : 'Features that read it stop working on the live site right away.'}`,
      confirmLabel: 'Remove Variable',
      action: () => send({ [k]: null }),
    });
  const add = () =>
    keys.includes(key)
      ? confirm({
          title: `Replace ${key}?`,
          body: `The stored value is overwritten and cannot be shown or restored. ${whenUsed} uses the new value${next === 'site' ? ' from its next request' : ''}.`,
          confirmLabel: 'Replace Value',
          tone: 'warning',
          action: () => send({ [key]: value }),
        })
      : void change({ [key]: value });
  const change = async (env: Record<string, string | null>) => {
    setError(null);
    setBusy(true);
    try {
      await send(env);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Setting
      title={title}
      description={description}
      note={error ? <span className="text-[var(--danger)]">{error}</span> : 'Values are encrypted and never shown again. Add a name again to replace its value.'}
      actions={
        <Button size="sm" isPending={busy} isDisabled={!validKey} onPress={add}>
          <LuPlus size={14} /> {keys.includes(key) ? 'Replace' : 'Add'}
        </Button>
      }
    >
      {dialog}
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <TextField value={key} onChange={(v) => setKey(v.trim())} isInvalid={key.length > 0 && !validKey}>
          <Label className="text-[13px] font-normal text-[var(--muted)]">Name</Label>
          <Input placeholder={placeholder} className="mono text-[13px]" />
        </TextField>
        <TextField value={value} onChange={setValue} type="password" autoFocus={Boolean(initialKey)}>
          <Label className="text-[13px] font-normal text-[var(--muted)]">Value</Label>
          <Input placeholder="Stored encrypted" className="mono text-[13px]" autoComplete="off" />
        </TextField>
      </div>
      {keys.length ? (
        <div className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {keys.map((k) => (
            <div key={k} className="flex items-center gap-3 px-4 py-2.5">
              <LuLock size={14} className="shrink-0 text-[var(--muted)]" />
              <span className="mono min-w-0 flex-1 truncate text-[13px] font-medium">{k}</span>
              <span className="mono text-[13px] text-[var(--muted)] max-sm:hidden">••••••••</span>
              <Button isIconOnly size="sm" variant="ghost" aria-label={`Remove ${k}`} isDisabled={busy} onPress={() => remove(k)}>
                <LuTrash2 size={14} />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">No variables yet.</p>
      )}
    </Setting>
  );
}

const SECTIONS: Array<[string, string]> = [
  ['general', 'General'],
  ['git', 'Git'],
  ['domains', 'Domains'],
  ['environment', 'Environment'],
  ['tokens', 'Tokens'],
  ['members', 'Members'],
];

export function Settings({ project, me, domain, onSaved }: { project: Project; me: { id: string }; domain: string; onSaved: () => void }) {
  const [section, setSection] = useState('general');
  const admin = can(project.role, 'admin');
  if (!admin && section !== 'members') {
    return (
      <div className="card px-6 py-10 text-center text-sm text-[var(--muted)]">
        Only project admins and owners change settings. <button className="font-medium text-[var(--foreground)] underline" onClick={() => setSection('members')}>See members</button>
      </div>
    );
  }
  return (
    <div className="grid gap-8 md:grid-cols-[200px_minmax(0,1fr)]">
      <nav className="flex flex-row gap-1 overflow-x-auto md:sticky md:top-32 md:flex-col md:self-start" aria-label="Settings">
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            aria-current={section === id ? 'page' : undefined}
            className={`rounded-md px-3 py-2 text-left text-sm whitespace-nowrap transition-colors ${section === id ? 'bg-[var(--default)] font-medium text-[var(--foreground)]' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}
          >
            {label}
          </button>
        ))}
      </nav>
      <div>
        {section === 'general' ? <General project={project} onSaved={onSaved} /> : null}
        {section === 'git' ? <GitSettings project={project} onSaved={onSaved} /> : null}
        {section === 'domains' ? <Domains project={project} domain={domain} /> : null}
        {section === 'environment' ? <SiteEnv project={project} /> : null}
        {section === 'tokens' ? <Tokens project={project} /> : null}
        {section === 'members' ? <Members project={project} me={me} /> : null}
      </div>
    </div>
  );
}
