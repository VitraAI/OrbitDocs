import type { IconType } from 'react-icons';
import { BsMicrosoft } from 'react-icons/bs';
import { LuArrowLeft, LuLogOut } from 'react-icons/lu';
import { SiAppwrite, SiAuth0, SiClerk, SiFirebase, SiGoogle, SiKeycloak, SiOkta, SiSupabase } from 'react-icons/si';

import { iconHtml } from './icon-html';
import type { AccessManifest, AppSession, ProviderBrand } from './manifest';

const icon = (Icon: IconType) => iconHtml(Icon);

const PROVIDER_ICON: Record<ProviderBrand, IconType> = {
  google: SiGoogle,
  microsoft: BsMicrosoft,
  okta: SiOkta,
  auth0: SiAuth0,
  clerk: SiClerk,
  keycloak: SiKeycloak,
};

const APP_ICON: Record<AppSession['type'], IconType> = {
  supabase: SiSupabase,
  clerk: SiClerk,
  firebase: SiFirebase,
  appwrite: SiAppwrite,
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Favicon and Apple touch icon of the site. */
function head(manifest: AccessManifest): string {
  const { icon, appleIcon } = manifest.site;
  return `${icon ? `<link rel="icon" href="${esc(icon)}">` : ''}${appleIcon ? `<link rel="apple-touch-icon" href="${esc(appleIcon)}">` : ''}`;
}

/** The site's logo (light and dark, following the system theme), or its title. */
function brand(manifest: AccessManifest): string {
  const { logo, title } = manifest.site;
  if (!logo) return esc(title);
  if (logo.light === logo.dark) return `<img src="${esc(logo.light)}" alt="${esc(title)}">`;
  return `<img class="light" src="${esc(logo.light)}" alt="${esc(title)}"><img class="dark" src="${esc(logo.dark)}" alt="${esc(title)}">`;
}

function shell(manifest: AccessManifest, title: string, body: string): string {
  const accent = manifest.site.accent ?? '#3b6fe0';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(manifest.site.title)}</title>${head(manifest)}
<style>
:root{color-scheme:light dark;--accent:${esc(accent)};--bg:#fff;--fg:#1b1b1b;--muted:#6b6b6b;--border:#e3e3e3;--card:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#ededed;--muted:#a3a3a3;--border:#2c2c2c;--card:#1b1b1b}}
*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:15px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.card{width:min(400px,calc(100vw - 32px));padding:32px;border:1px solid var(--border);border-radius:16px;background:var(--card)}
h1{margin:0 0 6px;font-size:20px;font-weight:600}p{margin:0 0 20px;color:var(--muted);font-size:14px}
.site{margin-bottom:24px;font-weight:600;font-size:14px}
.site img{display:block;height:28px;width:auto;max-width:100%}.site .dark{display:none}
@media (prefers-color-scheme:dark){.site .light{display:none}.site .dark{display:block}}
a.btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:40px;margin-top:10px;padding:8px 14px;text-align:center;line-height:1.3;border:1px solid var(--border);border-radius:10px;background:transparent;color:var(--fg);font:inherit;font-weight:500;text-decoration:none;cursor:pointer}
a.btn:hover{border-color:var(--accent)}
a.btn.primary{border:0;background:var(--accent);color:#fff}a.btn.primary:hover{filter:brightness(1.08)}
.sep{display:flex;align-items:center;gap:10px;margin:18px 0 4px;color:var(--muted);font-size:12px}.sep:before,.sep:after{content:"";flex:1;border-top:1px solid var(--border)}
.note{margin-top:16px;padding:10px 12px;border-radius:10px;background:color-mix(in oklab,var(--accent) 12%,transparent);font-size:13px;color:var(--fg)}
.error{background:color-mix(in oklab,#e5484d 14%,transparent)}
</style></head><body><main class="card"><div class="site">${brand(manifest)}</div>${body}</main></body></html>`;
}

export function loginPage(manifest: AccessManifest, opts: { next: string; base: string; error?: string }): string {
  const title = manifest.loginPage.title ?? 'Sign in to read the docs';
  const desc = manifest.loginPage.description ?? 'These docs are private. Sign in to continue.';
  const next = encodeURIComponent(opts.next);
  const app = manifest.appSession;
  // Your product's own sign-in comes first: most readers already have an account there.
  const appButton = app
    ? `<a class="btn primary" href="${opts.base}/_auth/app?next=${next}">${icon(APP_ICON[app.type])}Continue with ${esc(app.name ?? `${manifest.site.title} account`)}</a>`
    : '';
  const sso = manifest.providers
    .map((p) => `<a class="btn" href="${opts.base}/_auth/start/${esc(p.id)}?next=${next}">${icon(PROVIDER_ICON[p.brand])}Continue with ${esc(p.name)}</a>`)
    .join('');
  const sep = appButton && sso ? '<div class="sep">or</div>' : '';
  const msg = opts.error ? `<div class="note error">${esc(opts.error)}</div>` : '';
  return shell(manifest, 'Sign in', `<h1>${esc(title)}</h1><p>${esc(desc)}</p>${appButton}${sep}${sso}${msg}`);
}

export function deniedPage(manifest: AccessManifest, opts: { base: string; email: string }): string {
  return shell(
    manifest,
    'No access',
    `<h1>You don't have access to this page</h1><p>You're signed in as <strong>${esc(opts.email)}</strong>, which isn't in a group that can read it. Ask the docs owner for access.</p><a class="btn" href="${opts.base}/">${icon(LuArrowLeft)}Go to the docs home</a><a class="btn" href="${opts.base}/_auth/logout">${icon(LuLogOut)}Sign in with another account</a>`,
  );
}
