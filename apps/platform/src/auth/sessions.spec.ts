import { SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlatformConfig } from '../config';
import type { Db } from '../db';
import { AdminController } from '../projects/controllers';
import { AuthService, type Req, SESSION_COOKIE, type User } from './auth.service';

// The fake database below matches rows by `eq(column, value)` only.
vi.mock('drizzle-orm', async (importOriginal) => ({ ...(await importOriginal<typeof import('drizzle-orm')>()), eq: (column: { name: string }, value: unknown) => ({ column: column.name, value }) }));

const SECRET = 's'.repeat(40);
const T = 1_767_225_600_100; // x.100 s: later changes in the same second follow.

function fakeDb(rows: User[]) {
  const match = (w?: { column: string; value: unknown }) => (r: User) => !w || (r as unknown as Record<string, unknown>)[w.column] === w.value;
  return {
    select: () => ({ from: () => ({ where: async (w: { column: string; value: unknown }) => rows.filter(match(w)).map((r) => ({ ...r })) }) }),
    update: () => ({
      set: (set: Partial<User>) => ({
        where: (w: { column: string; value: unknown }) => {
          const hit = rows.filter(match(w));
          for (const r of hit) Object.assign(r, set);
          return Object.assign(Promise.resolve(), { returning: async () => hit.map((r) => ({ ...r })) });
        },
      }),
    }),
  } as unknown as Db;
}

const user = (id: string, isAdmin = false): User => ({ id, email: `${id}@acme.com`, name: id, passwordHash: null, isAdmin, active: true, externalId: null, createdAt: new Date(0), lastLoginAt: null, passwordChangedAt: null });

function setup() {
  const rows = [user('admin', true), user('ada')];
  const db = fakeDb(rows);
  const audit = { record: vi.fn(async () => undefined) };
  const auth = new AuthService(db, { secret: SECRET, sso: [], publicUrl: 'http://localhost:8080', admin: null } as unknown as PlatformConfig, audit as never);
  const admin = new AdminController(auth, audit as never, db);
  const req = (token?: string): Req & { protocol: string } => ({ headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}, protocol: 'http' });
  const signedIn = async (token: string) => (await auth.user(req(token)))?.id ?? null;
  const row = (id: string) => rows.find((r) => r.id === id)!;
  return { auth, admin, req, signedIn, row };
}

/** The session cookie a response set, or null. */
function cookieOf(res: { setHeader: ReturnType<typeof vi.fn> }): string | null {
  const call = res.setHeader.mock.calls.find(([name]) => name === 'Set-Cookie');
  return call ? /od_platform=([^;]*)/.exec(String(call[1]))![1]! : null;
}

describe('sessions and password changes', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T);
  });
  afterEach(() => vi.useRealTimers());

  it('ends a session issued earlier in the same second as the change', async () => {
    const { auth, signedIn, row } = setup();
    const before = await auth.session(row('ada'));
    vi.setSystemTime(T + 400);
    row('ada').passwordChangedAt = new Date();
    const after = await auth.session(row('ada'));
    expect(await signedIn(before)).toBeNull();
    expect(await signedIn(after)).toBe('ada');
  });

  it('keeps a session issued after the change, and never dates a new one before it', async () => {
    const { auth, signedIn, row } = setup();
    row('ada').passwordChangedAt = new Date(T + 5);
    expect(await signedIn(await auth.session(row('ada')))).toBe('ada');
  });

  it('ends a session signed without milliseconds in the second of the change', async () => {
    const { signedIn, row } = setup();
    const key = new TextEncoder().encode(`orbitdocs:session:${SECRET}`);
    const legacy = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject('ada').setIssuedAt().setExpirationTime('1h').setAudience('orbitdocs:platform').sign(key);
    expect(await signedIn(legacy)).toBe('ada');
    vi.setSystemTime(T + 400);
    row('ada').passwordChangedAt = new Date();
    expect(await signedIn(legacy)).toBeNull();
  });

  it('keeps the current session when admins reset their own password; other sessions end', async () => {
    const { auth, admin, req, signedIn, row } = setup();
    const here = await auth.session(row('admin'));
    const elsewhere = await auth.session(row('admin'));
    vi.setSystemTime(T + 300);
    const res = { setHeader: vi.fn() };
    await admin.updateUser(req(here) as never, 'admin', { password: 'a-new-password-1' }, res as never);
    const fresh = cookieOf(res);
    expect(fresh).toBeTruthy();
    expect(await signedIn(fresh!)).toBe('admin');
    expect(await signedIn(here)).toBeNull();
    expect(await signedIn(elsewhere)).toBeNull();
  });

  it("signs out everyone else's sessions on a reset, without touching the admin's", async () => {
    const { auth, admin, req, signedIn, row } = setup();
    const mine = await auth.session(row('admin'));
    const theirs = await auth.session(row('ada'));
    vi.setSystemTime(T + 300);
    const res = { setHeader: vi.fn() };
    await admin.updateUser(req(mine) as never, 'ada', { password: 'a-new-password-1' }, res as never);
    expect(cookieOf(res)).toBeNull();
    expect(await signedIn(theirs)).toBeNull();
    expect(await signedIn(mine)).toBe('admin');
  });

  it('refuses unknown users and a self-deactivation', async () => {
    const { auth, admin, req, row } = setup();
    const mine = await auth.session(row('admin'));
    const res = { setHeader: vi.fn() };
    await expect(admin.updateUser(req(mine) as never, 'nobody', { active: false }, res as never)).rejects.toThrow(/No such user/);
    await expect(admin.updateUser(req(mine) as never, 'admin', { active: false }, res as never)).rejects.toThrow(/cannot deactivate/);
  });
});
