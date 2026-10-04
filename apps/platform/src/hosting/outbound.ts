import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { BlockList, isIP } from 'node:net';

import { Agent } from 'undici';

/**
 * Outbound requests made for hosted sites (sign-in, personalization hook, audit
 * webhook, Ask AI, API MCP) go where the site's config says. Without a guard, a
 * site could point them at the platform's network: its database, admin pages or
 * the cloud metadata service. `guardedFetch` refuses private, loopback,
 * link-local and reserved addresses, and the platform's own hosts, unless
 * SITE_OUTBOUND_ALLOW lists them.
 */

/** Addresses no hosted site may reach: everything that isn't the public internet. */
const BLOCKED = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata (169.254.169.254)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast
] as const)
  BLOCKED.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
  ['2001:db8::', 32], // documentation
] as const)
  BLOCKED.addSubnet(net, bits, 'ipv6');

/** `::ffff:10.0.0.1` and NAT64 `64:ff9b::a00:1` carry an IPv4 address: check that one. */
function embeddedIpv4(address: string): string | null {
  const lower = address.toLowerCase();
  const dotted = /^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (dotted) return dotted[1]!;
  const hex = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (!hex) return null;
  const hi = parseInt(hex[1]!, 16);
  const lo = parseInt(hex[2]!, 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

export function isBlockedAddress(address: string): boolean {
  const v4 = embeddedIpv4(address);
  if (v4) return BLOCKED.check(v4, 'ipv4');
  const family = isIP(address);
  if (family === 4) return BLOCKED.check(address, 'ipv4');
  if (family === 6) return BLOCKED.check(address, 'ipv6');
  return true;
}

/** SITE_OUTBOUND_ALLOW: hostnames (`keycloak.internal`, `*.corp.acme.com`), IPs and CIDRs, comma-separated. */
export interface OutboundAllow {
  hosts: string[];
  suffixes: string[];
  ips: BlockList;
}

export function parseOutboundAllow(value: string | undefined): OutboundAllow {
  const allow: OutboundAllow = { hosts: [], suffixes: [], ips: new BlockList() };
  for (const raw of (value ?? '').split(',')) {
    const entry = raw.trim().toLowerCase().replace(/^\[|\]$/g, '');
    if (!entry) continue;
    const [ip, bits] = entry.split('/');
    const family = isIP(ip!);
    if (family) {
      const type = family === 4 ? 'ipv4' : 'ipv6';
      if (bits !== undefined) allow.ips.addSubnet(ip!, Number(bits), type);
      else allow.ips.addAddress(ip!, type);
    } else if (entry.startsWith('*.')) allow.suffixes.push(entry.slice(1));
    else allow.hosts.push(entry);
  }
  return allow;
}

export class OutboundBlockedError extends Error {
  constructor(target: string, reason: string) {
    super(`Blocked a hosted site's request to ${target}: ${reason}. To allow it, add it to SITE_OUTBOUND_ALLOW.`);
    this.name = 'OutboundBlockedError';
  }
}

export interface OutboundOptions {
  allow: OutboundAllow;
  /** The platform's own domain: the dashboard and every hosted site (`*.domain`). */
  platformDomain: string;
  /** Tests: resolve names without DNS. */
  lookup?: typeof dnsLookup;
}

const MAX_REDIRECTS = 5;

/**
 * A fetch for hosted sites. Names are checked when the connection is made (on
 * the address actually used, so DNS rebinding can't slip through) and every
 * redirect is followed here and checked again.
 */
export function guardedFetch(opts: OutboundOptions): typeof fetch {
  const { allow } = opts;
  const domain = opts.platformDomain.toLowerCase().replace(/:\d+$/, '');
  const hostAllowed = (host: string) => allow.hosts.includes(host) || allow.suffixes.some((s) => host.endsWith(s));
  const ipAllowed = (address: string) => {
    const v4 = embeddedIpv4(address);
    if (v4) return allow.ips.check(v4, 'ipv4');
    const family = isIP(address);
    return family !== 0 && allow.ips.check(address, family === 4 ? 'ipv4' : 'ipv6');
  };
  const resolve = opts.lookup ?? dnsLookup;

  // Checks happen at connect time, on the addresses the socket will use.
  const agent = new Agent({
    connect: {
      lookup: (hostname, options, callback) => {
        resolve(hostname, { ...options, all: true }, (err, addresses) => {
          if (err) return callback(err, [] as LookupAddress[]);
          const list = (Array.isArray(addresses) ? addresses : [{ address: addresses, family: 4 }]) as LookupAddress[];
          const host = hostname.toLowerCase();
          const blocked = !hostAllowed(host) && list.find((a) => isBlockedAddress(a.address) && !ipAllowed(a.address));
          if (blocked) return callback(new OutboundBlockedError(hostname, `it resolves to ${blocked.address}, a private or reserved address`), [] as LookupAddress[]);
          callback(null, (options as { all?: boolean }).all ? list : list[0]!.address, list[0]!.family);
        });
      },
    },
  });

  /** What the agent can't see: the scheme, the platform's hosts and IP literals (no lookup for those). */
  function check(url: URL) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new OutboundBlockedError(url.href, `only http and https are allowed`);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (hostAllowed(host)) return;
    if (host === 'localhost' || host.endsWith('.localhost')) throw new OutboundBlockedError(url.host, 'it is this machine');
    if (domain && (host === domain || host.endsWith(`.${domain}`))) throw new OutboundBlockedError(url.host, 'it is the platform itself');
    if (isIP(host) && isBlockedAddress(host) && !ipAllowed(host)) throw new OutboundBlockedError(url.host, 'a private or reserved address');
  }

  return async function fetchForSite(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = new Request(input, init);
    const mode = init?.redirect ?? request.redirect;
    let url = new URL(request.url);
    let method = request.method;
    let body: ArrayBuffer | null = method === 'GET' || method === 'HEAD' ? null : await request.arrayBuffer();
    const headers = new Headers(request.headers);
    for (let hop = 0; ; hop++) {
      check(url);
      const res = await fetch(url, { method, headers, body, signal: request.signal, redirect: 'manual', dispatcher: agent } as RequestInit);
      const location = res.headers.get('location');
      if (mode === 'manual' || res.status < 300 || res.status > 399 || !location) return res;
      if (mode === 'error') throw new TypeError(`Redirect from ${url.href} was not allowed`);
      if (hop >= MAX_REDIRECTS) throw new TypeError(`Too many redirects from ${request.url}`);
      const next = new URL(location, url);
      // Like browsers: 303 (and 301/302 after a POST) continue as GET without a body.
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) {
        method = 'GET';
        body = null;
        headers.delete('content-type');
        headers.delete('content-length');
      }
      // Credentials never follow a redirect to another origin.
      if (next.origin !== url.origin) {
        headers.delete('authorization');
        headers.delete('cookie');
      }
      url = next;
    }
  };
}
