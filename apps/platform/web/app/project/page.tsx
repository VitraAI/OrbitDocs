'use client';

import { Button, Spinner } from '@heroui/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { SiGithub, SiGitlab } from 'react-icons/si';

import { hostOf, ProjectAvatar, type ProjectSummary } from '@/app/page';
import { Builds, Deployments, Overview, type Project, Registry } from '@/components/project-site';
import { AnalyticsTab, Settings } from '@/components/project-team';
import { type NavTab, Page, Shell, TitleBand } from '@/components/shell';
import { type Me, useApi } from '@/lib/api';

const TABS: Array<[string, string]> = [
  ['overview', 'Overview'],
  ['deployments', 'Deployments'],
  ['builds', 'Builds'],
  ['registry', 'Registry'],
  ['analytics', 'Analytics'],
  ['settings', 'Settings'],
];

function ProjectView({ me, slug, tab }: { me: NonNullable<Me['user']>; slug: string; tab: string }) {
  const router = useRouter();
  const { data: project, error, reload } = useApi<Project>(slug ? `/api/projects/${slug}` : null);
  const { data: meta } = useApi<Me>('/api/auth/me');
  const go = (t: string) => router.replace(`/project/?slug=${slug}&tab=${t}`, { scroll: false });
  if (error) return <Page><p className="text-[var(--danger)]">{error.message}</p></Page>;
  if (!project) return <Page><Spinner /></Page>;
  const titles: Record<string, string> = { overview: project.name, deployments: 'Deployments', builds: 'Builds', registry: 'Registry', analytics: 'Analytics', settings: 'Settings' };
  return (
    <>
      <TitleBand
        title={titles[tab] ?? project.name}
        description={tab === 'overview' ? <span className="mono">{hostOf(project.url) ?? `${project.slug}.${meta?.domain}`}</span> : tab === 'registry' ? 'Every published version of every API spec.' : tab === 'deployments' ? 'Production builds and previews. Roll back to any kept build.' : undefined}
        actions={
          tab === 'overview' ? (
            <>
              {project.git?.webUrl ? (
                <Button variant="secondary" onPress={() => window.open(project.git!.webUrl!, '_blank')}>
                  {project.git.provider === 'gitlab' ? <SiGitlab size={14} /> : <SiGithub size={14} />} Repository
                </Button>
              ) : null}
              {project.url ? <Button onPress={() => window.open(project.url!, '_blank')}>Visit</Button> : null}
            </>
          ) : null
        }
      />
      <Page>
        {tab === 'overview' ? <Overview project={project} onTab={go} /> : null}
        {tab === 'deployments' ? <Deployments project={project} /> : null}
        {tab === 'builds' ? <Builds project={project} /> : null}
        {tab === 'registry' ? <Registry project={project} /> : null}
        {tab === 'analytics' ? <AnalyticsTab project={project} /> : null}
        {tab === 'settings' ? <Settings project={project} me={me} domain={meta?.domain ?? ''} onSaved={() => void reload()} /> : null}
      </Page>
    </>
  );
}

function ProjectPage() {
  const params = useSearchParams();
  const slug = params.get('slug') ?? '';
  const tab = params.get('tab') ?? 'overview';
  const { data: project } = useApi<Project>(slug ? `/api/projects/${slug}` : null);
  const { data: all } = useApi<ProjectSummary[]>('/api/projects');
  const tabs: NavTab[] = TABS.map(([id, label]) => ({ id, label, href: `/project/?slug=${slug}&tab=${id}` }));
  return (
    <Shell
      crumbs={[
        {
          label: (
            <span className="flex items-center gap-2">
              <ProjectAvatar name={project?.name ?? slug} size={20} />
              {project?.name ?? slug}
            </span>
          ),
          href: `/project/?slug=${slug}`,
          switcher: {
            title: 'Projects',
            selected: slug,
            items: (all ?? []).map((p) => ({
              id: p.slug,
              text: p.name,
              href: `/project/?slug=${p.slug}`,
              label: (
                <span className="flex min-w-0 items-center gap-2.5">
                  <ProjectAvatar name={p.name} size={20} />
                  <span className="truncate">{p.name}</span>
                </span>
              ),
            })),
            footer: { label: 'All projects', href: '/' },
          },
        },
      ]}
      tabs={tabs}
      active={tab}
    >
      {(me) => <ProjectView me={me} slug={slug} tab={tab} />}
    </Shell>
  );
}

export default function ProjectRoute() {
  return (
    <Suspense fallback={null}>
      <ProjectPage />
    </Suspense>
  );
}
