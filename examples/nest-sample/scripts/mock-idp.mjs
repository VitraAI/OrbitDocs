/**
 * Local stand-ins for trying private docs, on one port (default 8090):
 *
 *   /realms/orbit/*   a Keycloak-style OpenID Connect realm. Every sign-in
 *                     returns MOCK_EMAIL (and MOCK_GROUPS, comma-separated).
 *   /app/login        a Supabase-style product sign-in: pick an email, get a
 *                     signed `sb-localhost-auth-token` session cookie, go back.
 *   /auth/v1/.well-known/jwks.json   the keys that sign those sessions.
 *
 *   MOCK_EMAIL=ada@orbit-travel.example node scripts/mock-idp.mjs
 */
import { createServer } from 'node:http';

import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { OAuth2Issuer, OAuth2Service } from 'oauth2-mock-server';

const port = Number(process.env.MOCK_IDP_PORT ?? 8090);
const origin = `http://localhost:${port}`;
const REALM = '/realms/orbit';

// Keycloak-style realm.
const issuer = new OAuth2Issuer();
issuer.url = `${origin}${REALM}`;
await issuer.keys.generate('RS256');
const oidc = new OAuth2Service(issuer);
oidc.on('beforeTokenSigning', (token) => {
  token.payload.email = process.env.MOCK_EMAIL ?? 'ada@orbit-travel.example';
  token.payload.name = process.env.MOCK_NAME ?? 'Ada Lovelace';
  token.payload.groups = (process.env.MOCK_GROUPS ?? '').split(',').filter(Boolean);
});

// Supabase-style product sessions.
const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'app-1', alg: 'RS256', use: 'sig' };
const COOKIE = 'sb-localhost-auth-token';

// Brand assets come from the docs site (served by the Nest app under /docs).
const assets = process.env.MOCK_ASSETS_URL ?? 'http://localhost:3010/docs';
const page = (body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orbit Travel</title><link rel="icon" href="${assets}/icon.png"><link rel="apple-touch-icon" href="${assets}/apple-icon.png">
<style>body{font:15px system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#0f1115;color:#eee}form{display:grid;gap:10px;width:320px;padding:28px;border:1px solid #333;border-radius:14px;background:#171a21}input,button{height:40px;border-radius:9px;border:1px solid #333;padding:0 12px;font:inherit;background:#0f1115;color:#eee}button{background:#3ecf8e;color:#08130d;border:0;font-weight:600;cursor:pointer}h1{font-size:18px;margin:0 0 6px}.logo{height:30px;width:auto;margin-bottom:10px}p{margin:0;color:#999;font-size:13px}</style>${body}`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', origin);
  if (url.pathname.startsWith(REALM)) {
    req.url = req.url.slice(REALM.length) || '/';
    return oidc.requestHandler(req, res);
  }
  if (url.pathname === '/auth/v1/.well-known/jwks.json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ keys: [jwk] }));
  }
  if (url.pathname === '/app/login' && req.method === 'GET') {
    const back = url.searchParams.get('redirect_to') ?? '';
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(
      page(`<form method="post"><img class="logo" src="${assets}/logo-dark.png" alt="OrbitDocs"><h1>Orbit Travel</h1><p>Sign in to your Orbit Travel account.</p>
<input type="email" name="email" aria-label="Email" value="${process.env.MOCK_APP_EMAIL ?? 'sam@orbit-travel.example'}" required>
<input type="hidden" name="redirect_to" value="${back.replace(/"/g, '&quot;')}"><button>Sign in</button></form>`),
    );
  }
  if (url.pathname === '/app/login' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const form = new URLSearchParams(body);
    const email = form.get('email') ?? '';
    const token = await new SignJWT({ email, role: 'authenticated', app_metadata: { groups: [] }, user_metadata: { full_name: email.split('@')[0] } })
      .setProtectedHeader({ alg: 'RS256', kid: 'app-1' })
      .setIssuer(`${origin}/auth/v1`)
      .setAudience('authenticated')
      .setSubject(email)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    const value = `base64-${Buffer.from(JSON.stringify({ access_token: token, token_type: 'bearer' })).toString('base64url')}`;
    // Cookies ignore ports, so localhost:3010 (the docs) sees this one too.
    res.writeHead(303, { 'set-cookie': `${COOKIE}=${value}; Path=/; SameSite=Lax`, location: form.get('redirect_to') || `${origin}/app/login` });
    return res.end();
  }
  if (url.pathname === '/app/logout') {
    res.writeHead(303, { 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0`, location: `${origin}/app/login` });
    return res.end();
  }
  res.writeHead(404).end();
});
server.listen(port, 'localhost', () => {
  console.log(`Mock Keycloak realm at ${issuer.url} (signs in ${process.env.MOCK_EMAIL ?? 'ada@orbit-travel.example'})`);
  console.log(`Mock product sign-in at ${origin}/app/login`);
});
