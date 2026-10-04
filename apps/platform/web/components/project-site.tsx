'use client';

import { Button, Chip, Dropdown, Label, Modal, Spinner } from '@heroui/react';
import { useEffect, useMemo, useState } from 'react';
import { LuDownload, LuEllipsis, LuExternalLink, LuEye, LuGitBranch, LuGitCommitHorizontal, LuGitPullRequest, LuGlobe, LuRotateCcw, LuTrash2, LuUpload } from 'react-icons/lu';
import { SiGithub, SiGitlab } from 'react-icons/si';

import { hostOf, type ProjectSummary } from '@/app/page';
import { ago, api, bytes, can, type Role, useApi } from '@/lib/api';

import { useConfirm } from './confirm';
import { CodeLine, Status } from './ui';

export type Project = ProjectSummary & {
  role: Role;
  blockOnLint: boolean;
  analytics: { provider: string; siteId?: string; host?: string };
  git: (NonNullable<ProjectSummary['git']> & { branch: string; hasToken: boolean; docsDir: string; installCommand: string; buildCommand: string; outputDir: string; apiUrl: string; cloneUrl?: string; envKeys: string[]; webUrl: string | null }) | null;
};

/** Spectral counts for one spec of a deployment or build. */
export interface SpecLint {
  apiId: string;
  title: string;
  version: string;
  revision: number | null;
  errors: number;
  warnings: number;
  problems?: Array<{ severity: string; code: string; message: string; path: string }>;
}

/** One line for a deployment's lint: errors, warnings or clean (nothing without specs). */
export function LintStatus({ lint }: { lint: SpecLint[] | null | undefined }) {
  if (!lint?.length) return null;
  const errors = lint.reduce((n, l) => n + l.errors, 0);
  const warnings = lint.reduce((n, l) => n + l.warnings, 0);
  const title = lint.map((l) => `${l.apiId} v${l.version}: ${l.errors} errors, ${l.warnings} warnings`).join('\n');
  return (
    <span title={title} className="inline-flex">
      <Status status={errors ? 'failed' : warnings ? 'warning' : 'ready'} label={errors ? `${errors} lint ${errors === 1 ? 'error' : 'errors'}` : warnings ? `${warnings} lint ${warnings === 1 ? 'warning' : 'warnings'}` : 'Lint clean'} />
    </span>
  );
}

interface Deployment {
  id: string;
  kind: 'production' | 'preview';
  label: string | null;
  meta: { branch?: string; commit?: string; message?: string };
  files: number;
  bytes: number;
  createdAt: string;
  removedAt: string | null;
  live: boolean;
  url: string | null;
  lint: SpecLint[];
}

interface Build {
  id: string;
  kind: 'production' | 'preview';
  label: string | null;
  branch: string;
  commit: string;
  message: string | null;
  status: string;
  trigger: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  deploymentId: string | null;
  lint: SpecLint[] | null;
}

interface Version {
  id: string;
  apiId: string;
  revision: number;
  version: string;
  title: string;
  operations: number;
  errors: number;
  warnings: number;
  createdAt: string;
  createdBy: string | null;
}

interface Domain {
  id: string;
  hostname: string;
  verified: boolean;
}

const short = (sha?: string) => (sha ? sha.slice(0, 7) : '');
const secs = (a: string | null, b: string | null) => (a && b ? `${Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000))}s` : '');

function Source({ branch, commit, message }: { branch?: string; commit?: string; message?: string | null }) {
  if (!branch) return <span className="text-sm text-[var(--muted)]">Uploaded with the CLI</span>;
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="flex items-center gap-1.5 font-medium">
        <LuGitBranch size={14} className="shrink-0" /> {branch}
      </span>
      {commit || message ? (
        <span className="flex min-w-0 items-center gap-1.5 text-[var(--muted)]">
          <LuGitCommitHorizontal size={14} className="shrink-0" />
          {commit ? <span className="mono text-[13px]">{short(commit)}</span> : null}
          <span className="truncate">{message}</span>
        </span>
      ) : null}
    </div>
  );
}

/** The live site, scaled down like Vercel's deployment preview. */
function SitePreview({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="group relative block aspect-[16/10] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)]">
      <iframe src={url} title="Site preview" tabIndex={-1} loading="lazy" className="pointer-events-none absolute top-0 left-0 origin-top-left border-0" style={{ width: '400%', height: '400%', transform: 'scale(0.25)' }} />
      <span className="absolute inset-0 transition-colors group-hover:bg-black/5" />
    </a>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="text-[13px] text-[var(--muted)]">{label}</div>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  );
}

export function Overview({ project, onTab }: { project: Project; onTab: (t: string) => void }) {
  const { data: deployments } = useApi<Deployment[]>(`/api/projects/${project.slug}/deployments`);
  const { data: domains } = useApi<Domain[]>(`/api/projects/${project.slug}/domains`);
  const { data: builds } = useApi<Build[]>(`/api/projects/${project.slug}/builds`);
  const live = deployments?.find((d) => d.live);
  const previews = deployments?.filter((d) => d.kind === 'preview' && !d.removedAt) ?? [];
  const build = builds?.find((b) => b.deploymentId === live?.id);
  const origin = typeof window === 'undefined' ? '' : location.origin;
  return (
    <div className="flex flex-col gap-8">
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-6 pt-5">
          <h2 className="text-base font-semibold">Production Deployment</h2>
          <div className="flex gap-2">
            {live ? (
              <>
                <Button size="sm" variant="secondary" onPress={() => onTab('builds')}>
                  Build Logs
                </Button>
                <Button size="sm" variant="secondary" onPress={() => onTab('deployments')}>
                  <LuRotateCcw size={14} /> Instant Rollback
                </Button>
              </>
            ) : null}
          </div>
        </div>
        {live?.url ? (
          <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <SitePreview url={live.url} />
            <div className="flex flex-col gap-5">
              <Field label="Deployment">
                <a className="font-medium hover:underline" href={live.url} target="_blank" rel="noreferrer">
                  {hostOf(live.url)}
                </a>
              </Field>
              <Field label="Domains">
                <div className="flex flex-col gap-1">
                  <a className="flex items-center gap-1 font-medium hover:underline" href={live.url} target="_blank" rel="noreferrer">
                    {hostOf(live.url)?.split('/')[0]} <LuExternalLink size={12} />
                  </a>
                  {(domains ?? [])
                    .filter((d) => d.verified)
                    .map((d) => (
                      <a key={d.id} className="flex items-center gap-1 font-medium hover:underline" href={`${location.protocol}//${d.hostname}`} target="_blank" rel="noreferrer">
                        {d.hostname} <LuExternalLink size={12} />
                      </a>
                    ))}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-5">
                <Field label="Status">
                  <Status status="ready" />
                </Field>
                <Field label="Created">
                  {ago(live.createdAt)} {build ? <span className="text-[var(--muted)]">· built in {secs(build.startedAt, build.finishedAt)}</span> : null}
                </Field>
              </div>
              <Field label="Source">
                <Source branch={live.meta.branch} commit={live.meta.commit} message={live.meta.message} />
              </Field>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-6">
            <p className="text-sm text-[var(--muted)]">Nothing is live yet. Publish from your docs app with a token from Settings → Tokens:</p>
            <CodeLine>{`ORBITDOCS_TOKEN=<token> npx orbitdocs publish --platform ${origin}`}</CodeLine>
            <p className="text-sm text-[var(--muted)]">
              Or{' '}
              <button className="font-medium text-[var(--foreground)] underline-offset-2 hover:underline" onClick={() => onTab('settings')}>
                connect a Git repository
              </button>{' '}
              to publish on every push and preview every pull request.
            </p>
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <div className="text-[13px] text-[var(--muted)]">APIs in the registry</div>
          <div className="mt-2 flex flex-col gap-1">
            {project.apis.length ? project.apis.map((a) => <span key={a.apiId} className="text-sm font-medium">{a.title} <span className="mono text-[var(--muted)]">v{a.version} · r{a.revision}</span></span>) : <span className="text-sm">None yet</span>}
          </div>
        </div>
        <div className="card p-5">
          <div className="text-[13px] text-[var(--muted)]">Git repository</div>
          <div className="mt-2 flex items-center gap-2 text-sm font-medium">
            {project.git ? (
              project.git.webUrl ? (
                <a href={project.git.webUrl} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 hover:underline">
                  {project.git.provider === 'gitlab' ? <SiGitlab size={14} className="shrink-0" /> : <SiGithub size={14} className="shrink-0" />} <span className="truncate">{project.git.repo}</span>
                </a>
              ) : (
                <>
                  {project.git.provider === 'gitlab' ? <SiGitlab size={14} /> : <SiGithub size={14} />} {project.git.repo}
                </>
              )
            ) : (
              'Not connected'
            )}
          </div>
        </div>
        <div className="card p-5">
          <div className="text-[13px] text-[var(--muted)]">Domains</div>
          <div className="mt-2 flex items-center gap-2 text-sm font-medium">
            <LuGlobe size={14} /> {1 + (domains?.filter((d) => d.verified).length ?? 0)}
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold">Active Previews</h2>
        {previews.length ? (
          <div className="list">
            {previews.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                <span className="flex w-28 items-center gap-1.5 text-sm font-medium">
                  <LuGitPullRequest size={14} /> {d.label}
                </span>
                <Status status="ready" />
                <LintStatus lint={d.lint} />
                <div className="min-w-0 flex-1">
                  <Source branch={d.meta.branch} commit={d.meta.commit} message={d.meta.message} />
                </div>
                <span className="text-[13px] text-[var(--muted)]">{ago(d.createdAt)}</span>
                <Button size="sm" variant="secondary" onPress={() => window.open(d.url!, '_blank')}>
                  Visit
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="card px-6 py-8 text-center text-sm text-[var(--muted)]">No open pull or merge requests with a preview.</div>
        )}
      </div>
    </div>
  );
}

function RowMenu({ items }: { items: Array<{ id: string; label: string; icon?: React.ReactNode; danger?: boolean; run: () => void }> }) {
  if (!items.length) return <span className="w-8" />;
  return (
    <Dropdown>
      <Dropdown.Trigger aria-label="More" className="grid size-8 place-items-center rounded-md hover:bg-[var(--default)]">
        <LuEllipsis size={16} />
      </Dropdown.Trigger>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu aria-label="Actions" onAction={(k) => items.find((i) => i.id === k)?.run()}>
          {items.map((i) => (
            <Dropdown.Item key={i.id} id={i.id} textValue={i.label} variant={i.danger ? 'danger' : undefined}>
              {i.icon}
              <Label>{i.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

export function Deployments({ project }: { project: Project }) {
  const { data, loading, reload } = useApi<Deployment[]>(`/api/projects/${project.slug}/deployments`);
  const { data: builds } = useApi<Build[]>(`/api/projects/${project.slug}/builds`);
  const editor = can(project.role, 'editor');
  const [confirm, dialog] = useConfirm();
  if (loading && !data) return <Spinner />;
  if (!data?.length) return <div className="card px-6 py-10 text-center text-sm text-[var(--muted)]">No deployments yet.</div>;
  const rollback = (d: Deployment) =>
    confirm({
      title: 'Roll back production?',
      body: <>Deployment <span className="mono font-medium text-[var(--foreground)]">{d.id.slice(0, 8)}</span> replaces the live site at once. You can roll forward again from this list.</>,
      confirmLabel: 'Instant Rollback',
      tone: 'warning',
      action: async () => {
        await api(`/api/projects/${project.slug}/deployments/${d.id}/promote`, { method: 'POST' });
        await reload();
      },
    });
  const removePreview = (d: Deployment) =>
    confirm({
      title: `Delete preview ${d.label ?? d.id.slice(0, 8)}?`,
      body: 'Its files are deleted and its URL stops working. A new push to the pull or merge request builds a new preview.',
      confirmLabel: 'Delete Preview',
      action: async () => {
        await api(`/api/projects/${project.slug}/deployments/${d.id}`, { method: 'DELETE' });
        await reload();
      },
    });
  return (
    <div className="list">
      {dialog}
      {data.map((d) => {
        const b = builds?.find((x) => x.deploymentId === d.id);
        const state = d.removedAt ? 'removed' : 'ready';
        return (
          <div key={d.id} className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1.6fr)_auto_auto] items-center gap-4 px-5 py-3.5 max-md:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <div className="mono truncate text-sm font-medium">{d.id.slice(0, 8)}</div>
              <div className="flex items-center gap-1.5 text-[13px] text-[var(--muted)]">
                {d.kind === 'production' ? 'Production' : `Preview · ${d.label}`}
                {d.live ? (
                  <Chip size="sm" variant="soft" color="accent" className="h-5">
                    Current
                  </Chip>
                ) : null}
              </div>
            </div>
            <div className="max-md:hidden">
              <Status status={state} />
              <div className="mt-0.5 text-[13px] text-[var(--muted)]">{b ? secs(b.startedAt, b.finishedAt) : `${d.files} files · ${bytes(d.bytes)}`}</div>
              {d.lint?.length ? (
                <div className="mt-0.5 text-[13px]">
                  <LintStatus lint={d.lint} />
                </div>
              ) : null}
            </div>
            <div className="min-w-0 max-md:hidden">
              <Source branch={d.meta.branch} commit={d.meta.commit} message={d.meta.message} />
            </div>
            <div className="text-[13px] whitespace-nowrap text-[var(--muted)] max-md:hidden">{ago(d.createdAt)}</div>
            <RowMenu
              items={[
                ...(d.url ? [{ id: 'visit', label: 'Visit', icon: <LuExternalLink size={14} />, run: () => window.open(d.url!, '_blank') }] : []),
                ...(editor && d.kind === 'production' && !d.live && !d.removedAt
                  ? [{ id: 'promote', label: 'Instant Rollback', icon: <LuRotateCcw size={14} />, run: () => rollback(d) }]
                  : []),
                ...(editor && d.kind === 'preview' && !d.removedAt
                  ? [{ id: 'remove', label: 'Delete Preview', danger: true, icon: <LuTrash2 size={14} />, run: () => removePreview(d) }]
                  : []),
              ]}
            />
          </div>
        );
      })}
    </div>
  );
}

function SpecViewer({ project, version, onClose }: { project: Project; version: Version | null; onClose: () => void }) {
  const [spec, setSpec] = useState<{ spec: unknown; lint: { problems: Array<{ severity: string; code: string; message: string; path: string }> } } | null>(null);
  useEffect(() => {
    setSpec(null);
    if (version) void api<typeof spec>(`/api/projects/${project.slug}/registry/${version.apiId}/${version.revision}`).then(setSpec);
  }, [project.slug, version]);
  return (
    <Modal isOpen={Boolean(version)} onOpenChange={(o) => !o && onClose()}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog className="sm:max-w-3xl">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>
                {version?.title} <span className="mono text-[var(--muted)]">r{version?.revision} · v{version?.version}</span>
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex max-h-[70vh] flex-col gap-4 overflow-auto">
              {!spec ? (
                <Spinner />
              ) : (
                <>
                  {spec.lint.problems.length ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="text-sm font-medium">Lint ({spec.lint.problems.length})</div>
                      {spec.lint.problems.slice(0, 30).map((p, i) => (
                        <div key={i} className="flex gap-2 text-xs">
                          <span className="dot mt-1" data-s={p.severity === 'error' ? 'error' : 'building'} />
                          <span className="mono text-[var(--muted)]">{p.path || '(root)'}</span>
                          <span>{p.message}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Status status="ready" label="No lint problems" />
                  )}
                  <pre className="mono overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-4 text-xs leading-relaxed">{JSON.stringify(spec.spec, null, 2).slice(0, 60000)}</pre>
                </>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onPress={() => window.open(`/api/projects/${project.slug}/registry/${version?.apiId}/${version?.revision}?download`, '_blank')}>
                <LuDownload size={14} /> Download
              </Button>
              <Button slot="close">Close</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

export function Registry({ project }: { project: Project }) {
  const { data, loading } = useApi<Version[]>(`/api/projects/${project.slug}/registry`);
  const [open, setOpen] = useState<Version | null>(null);
  const apis = useMemo(() => [...new Set((data ?? []).map((v) => v.apiId))], [data]);
  if (loading && !data) return <Spinner />;
  if (!data?.length) return <div className="card px-6 py-10 text-center text-sm text-[var(--muted)]">Every production publish stores each API spec as a new revision, linted with Spectral. Nothing published yet.</div>;
  return (
    <div className="flex flex-col gap-8">
      {apis.map((apiId) => {
        const versions = data.filter((v) => v.apiId === apiId);
        return (
          <div key={apiId}>
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="text-base font-semibold">{versions[0]!.title}</h2>
              <span className="mono text-[13px] text-[var(--muted)]">{apiId}</span>
            </div>
            <div className="list">
              {versions.map((v, i) => (
                <div key={v.id} className="grid grid-cols-[5rem_6rem_minmax(0,1fr)_auto_auto] items-center gap-4 px-5 py-3.5 max-md:grid-cols-[1fr_auto]">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    r{v.revision}
                    {i === 0 ? (
                      <Chip size="sm" variant="soft" color="accent" className="h-5">
                        Latest
                      </Chip>
                    ) : null}
                  </span>
                  <span className="mono text-sm max-md:hidden">v{v.version}</span>
                  <span className="flex items-center gap-4 text-sm text-[var(--muted)] max-md:hidden">
                    <span>{v.operations} operations</span>
                    <Status status={v.errors ? 'failed' : 'ready'} label={v.errors ? `${v.errors} lint errors` : v.warnings ? `${v.warnings} warnings` : 'Lint clean'} />
                  </span>
                  <span className="text-[13px] whitespace-nowrap text-[var(--muted)] max-md:hidden">
                    {ago(v.createdAt)} {v.createdBy ? `by ${v.createdBy}` : ''}
                  </span>
                  <Button size="sm" variant="secondary" onPress={() => setOpen(v)}>
                    <LuEye size={14} /> View
                  </Button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <SpecViewer project={project} version={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function BuildLog({ project, build, onClose }: { project: Project; build: Build | null; onClose: () => void }) {
  const [log, setLog] = useState<{ log: string; status: string } | null>(null);
  useEffect(() => {
    if (!build) return;
    let stop = false;
    const tick = async () => {
      const l = await api<{ log: string; status: string }>(`/api/projects/${project.slug}/builds/${build.id}/log`);
      if (stop) return;
      setLog(l);
      if (l.status === 'queued' || l.status === 'running') setTimeout(tick, 1500);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [project.slug, build]);
  return (
    <Modal isOpen={Boolean(build)} onOpenChange={(o) => !o && onClose()}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog className="sm:max-w-4xl">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading className="flex items-center gap-3">
                Build Logs {log ? <Status status={log.status} /> : null}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              {build?.lint?.length ? (
                <div className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
                  {build.lint.map((l) => (
                    <div key={l.apiId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                      <span className="font-medium">{l.title}</span>
                      <span className="mono text-[13px] text-[var(--muted)]">
                        {l.apiId} · v{l.version}
                        {l.revision ? ` · registry r${l.revision}` : build.kind === 'preview' ? ' · changed' : ''}
                      </span>
                      <span className="ml-auto">
                        <LintStatus lint={[l]} />
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              <pre className="mono max-h-[65vh] overflow-auto rounded-lg bg-[#0a0a0a] p-4 text-xs leading-relaxed text-[#ededed]">{log?.log || 'Waiting for output…'}</pre>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

export function Builds({ project }: { project: Project }) {
  const { data, loading, reload } = useApi<Build[]>(`/api/projects/${project.slug}/builds`);
  const [open, setOpen] = useState<Build | null>(null);
  useEffect(() => {
    if (!data?.some((b) => b.status === 'queued' || b.status === 'running')) return;
    const t = setTimeout(() => void reload(), 2000);
    return () => clearTimeout(t);
  }, [data, reload]);
  if (loading && !data) return <Spinner />;
  return (
    <>
      <p className="mb-4 text-sm text-[var(--muted)]">
        {project.git ? (
          <>
            From <span className="font-medium text-[var(--foreground)]">{project.git.repo}</span>: pushes to <span className="font-medium text-[var(--foreground)]">{project.git.branch}</span> go to production; every pull or merge request gets a preview.
          </>
        ) : (
          'Connect a Git repository in Settings to build on every push.'
        )}
      </p>
      {data?.length ? (
        <div className="list">
          {data.map((b) => (
            <button key={b.id} type="button" onClick={() => setOpen(b)} className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.6fr)_auto] items-center gap-4 px-5 py-3.5 text-left hover:bg-[var(--surface-secondary)] max-md:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-medium">{b.kind === 'preview' ? <><LuGitPullRequest size={14} /> {b.label}</> : 'Production'}</div>
                <div className="text-[13px] text-[var(--muted)]">{b.trigger}</div>
              </div>
              <div className="max-md:hidden">
                <Status status={b.status} />
                <div className="mt-0.5 text-[13px] text-[var(--muted)]">{secs(b.startedAt, b.finishedAt)}</div>
                {b.lint?.length ? (
                  <div className="mt-0.5">
                    <LintStatus lint={b.lint} />
                  </div>
                ) : null}
              </div>
              <div className="min-w-0 max-md:hidden">
                <Source branch={b.branch} commit={b.commit} message={b.message} />
              </div>
              <span className="text-[13px] whitespace-nowrap text-[var(--muted)]">{ago(b.createdAt)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="card px-6 py-10 text-center text-sm text-[var(--muted)]">
          <LuUpload className="mx-auto mb-2" size={18} />
          No builds yet.
        </div>
      )}
      <BuildLog project={project} build={open} onClose={() => setOpen(null)} />
    </>
  );
}

