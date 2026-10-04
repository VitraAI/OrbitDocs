'use client';

import { Button, Form, Input, Label, Modal, SearchField, Skeleton, TextArea, TextField, ToggleButton, ToggleButtonGroup } from '@heroui/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LuFolderPlus, LuGitBranch, LuLayoutGrid, LuList, LuPlus } from 'react-icons/lu';
import { SiGithub, SiGitlab } from 'react-icons/si';

import { Empty, globalTabs, Page, Shell } from '@/components/shell';
import { ago, api, type Role, useApi } from '@/lib/api';

export interface ProjectSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  role: Role;
  url: string | null;
  publishedAt: string | null;
  previews: number;
  apis: Array<{ apiId: string; title: string; version: string; revision: number }>;
  git: { provider: string; repo: string } | null;
  latest?: { message?: string; branch?: string; commit?: string } | null;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/--+/g, '-').slice(0, 40);

/** A deterministic gradient per project, like Vercel's default project avatars. */
export function ProjectAvatar({ name, size = 32 }: { name: string; size?: number }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full border border-[var(--border)] text-xs font-semibold text-white"
      style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${h} 80% 60%), hsl(${(h + 60) % 360} 80% 50%))` }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export const hostOf = (url: string | null) => (url ? url.replace(/^https?:\/\//, '').replace(/\/$/, '') : null);

function NewProject({ onCreated }: { onCreated: (slug: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api('/api/projects', { method: 'POST', json: { name, slug, description: form.get('description') || undefined } });
      setOpen(false);
      onCreated(slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen={open} onOpenChange={setOpen}>
      <Button onPress={() => setOpen(true)}>
        Add New… <LuPlus size={15} />
      </Button>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>New Project</Modal.Heading>
            </Modal.Header>
            <Form onSubmit={submit}>
              <Modal.Body className="flex flex-col gap-4">
                <TextField isRequired value={name} onChange={(v) => { setName(v); if (!touched) setSlug(slugify(v)); }}>
                  <Label>Project Name</Label>
                  <Input placeholder="payments-docs" autoFocus />
                </TextField>
                <TextField isRequired value={slug} onChange={(v) => { setTouched(true); setSlug(slugify(v)); }}>
                  <Label>Domain</Label>
                  <Input placeholder="payments" className="mono" />
                </TextField>
                <p className="-mt-2 text-xs text-[var(--muted)]">
                  <span className="mono">{slug || 'name'}.{typeof window === 'undefined' ? '' : location.host}</span>
                </p>
                <TextField name="description">
                  <Label>Description</Label>
                  <TextArea rows={2} placeholder="Optional" />
                </TextField>
                {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" slot="close">
                  Cancel
                </Button>
                <Button type="submit" isPending={busy} isDisabled={!name || !slug}>
                  Create
                </Button>
              </Modal.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

function Projects() {
  const router = useRouter();
  const { data, loading } = useApi<ProjectSummary[]>('/api/projects');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const shown = (data ?? []).filter((p) => `${p.name} ${p.slug} ${p.git?.repo ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <Page>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <SearchField aria-label="Search projects" value={query} onChange={setQuery} className="min-w-56 flex-1">
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Search Projects…" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <ToggleButtonGroup aria-label="View" selectionMode="single" disallowEmptySelection selectedKeys={new Set([view])} onSelectionChange={(k) => setView([...k][0] as 'grid' | 'list')}>
          <ToggleButton id="grid" isIconOnly aria-label="Grid">
            <LuLayoutGrid size={15} />
          </ToggleButton>
          <ToggleButton id="list" isIconOnly aria-label="List">
            <ToggleButtonGroup.Separator />
            <LuList size={15} />
          </ToggleButton>
        </ToggleButtonGroup>
        <NewProject onCreated={(slug) => router.push(`/project/?slug=${slug}`)} />
      </div>
      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : !shown.length ? (
        <Empty icon={<LuFolderPlus size={18} />} title={query ? 'No projects match' : 'No projects yet'}>
          {query ? null : (
            <>
              Create a project, then publish with <span className="mono">npx orbitdocs publish</span> or connect its Git repository.
            </>
          )}
        </Empty>
      ) : view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <Link key={p.id} href={`/project/?slug=${p.slug}`} className="card group flex flex-col gap-4 p-5 transition-colors hover:border-[var(--muted)]/40 hover:shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
              <div className="flex items-center gap-3">
                <ProjectAvatar name={p.name} />
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="truncate text-[13px] text-[var(--muted)]">{hostOf(p.url) ?? `${p.slug}.${typeof window === 'undefined' ? '' : location.host}`}</div>
                </div>
              </div>
              {p.git ? (
                <span className="flex w-fit items-center gap-1.5 rounded-full bg-[var(--default)] px-2.5 py-1 text-xs font-medium">
                  {p.git.provider === 'gitlab' ? <SiGitlab size={12} /> : <SiGithub size={12} />}
                  {p.git.repo}
                </span>
              ) : (
                <span className="w-fit rounded-full bg-[var(--default)] px-2.5 py-1 text-xs text-[var(--muted)]">Published with the CLI</span>
              )}
              <div className="mt-auto min-w-0">
                <div className="truncate text-sm">{p.latest?.message ?? (p.apis.length ? p.apis.map((a) => `${a.title} v${a.version}`).join(', ') : 'No deployments yet')}</div>
                <div className="mt-1 flex items-center gap-1 text-[13px] text-[var(--muted)]">
                  {p.publishedAt ? ago(p.publishedAt) : 'Not published'}
                  {p.latest?.branch ? (
                    <>
                      {' '}
                      on <LuGitBranch size={13} /> <span className="font-medium text-[var(--foreground)]">{p.latest.branch}</span>
                    </>
                  ) : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="list">
          {shown.map((p) => (
            <Link key={p.id} href={`/project/?slug=${p.slug}`} className="flex items-center gap-4 px-5 py-4 hover:bg-[var(--surface-secondary)]">
              <ProjectAvatar name={p.name} size={28} />
              <div className="w-56 min-w-0">
                <div className="truncate font-medium">{p.name}</div>
                <div className="truncate text-[13px] text-[var(--muted)]">{hostOf(p.url) ?? p.slug}</div>
              </div>
              <div className="hidden min-w-0 flex-1 truncate text-sm text-[var(--muted)] md:block">{p.latest?.message ?? '—'}</div>
              <div className="text-[13px] whitespace-nowrap text-[var(--muted)]">{p.publishedAt ? ago(p.publishedAt) : 'Not published'}</div>
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}

export default function Home() {
  return (
    <Shell tabs={(me) => globalTabs(me.isAdmin)} active="overview">
      {() => <Projects />}
    </Shell>
  );
}
