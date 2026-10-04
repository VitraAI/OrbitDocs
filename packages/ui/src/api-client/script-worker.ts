/**
 * Source of the Web Worker that runs pre-request and post-response scripts.
 * Kept as a string so the package needs no bundler worker support: the client
 * creates it from a Blob. Scripts get a Postman-compatible `pm` object.
 */
export const WORKER_SOURCE = String.raw`
"use strict";
const fmt = (v) => { if (typeof v === 'string') return v; try { return JSON.stringify(v); } catch { return String(v); } };
const deepEqual = (a, b) => {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]));
};
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

function expect(actual) {
  let negate = false;
  const assert = (ok, msg) => { if (negate ? ok : !ok) throw new Error((negate ? 'expected not: ' : 'expected: ') + msg); };
  const api = {
    equal: (v) => (assert(actual === v, fmt(actual) + ' to equal ' + fmt(v)), api),
    equals: (v) => api.equal(v),
    eql: (v) => (assert(deepEqual(actual, v), fmt(actual) + ' to deeply equal ' + fmt(v)), api),
    a: (t) => (assert(typeOf(actual) === t.toLowerCase(), fmt(actual) + ' to be a ' + t), api),
    an: (t) => api.a(t),
    above: (n) => (assert(actual > n, fmt(actual) + ' to be above ' + n), api),
    greaterThan: (n) => api.above(n),
    below: (n) => (assert(actual < n, fmt(actual) + ' to be below ' + n), api),
    lessThan: (n) => api.below(n),
    least: (n) => (assert(actual >= n, fmt(actual) + ' to be at least ' + n), api),
    most: (n) => (assert(actual <= n, fmt(actual) + ' to be at most ' + n), api),
    include: (v) => (assert(typeof actual === 'string' ? actual.includes(v) : Array.isArray(actual) ? actual.some((x) => deepEqual(x, v)) : actual && typeof v === 'object' && Object.entries(v).every(([k, x]) => deepEqual(actual[k], x)), fmt(actual) + ' to include ' + fmt(v)), api),
    contain: (v) => api.include(v),
    property: (...args) => {
      const [name, value] = args;
      const has = actual != null && Object.prototype.hasOwnProperty.call(Object(actual), name);
      assert(args.length > 1 ? has && deepEqual(actual[name], value) : has, fmt(actual) + ' to have property ' + name + (args.length > 1 ? ' = ' + fmt(value) : ''));
      return api;
    },
    lengthOf: (n) => (assert(actual != null && actual.length === n, 'length ' + (actual && actual.length) + ' to be ' + n), api),
    length: (n) => api.lengthOf(n),
    match: (re) => (assert(re.test(String(actual)), fmt(actual) + ' to match ' + re), api),
    oneOf: (list) => (assert(list.some((x) => deepEqual(x, actual)), fmt(actual) + ' to be one of ' + fmt(list)), api),
    status: (code) => { const s = actual && (actual.code ?? actual.status); assert(s === code, 'status ' + s + ' to be ' + code); return api; },
    header: (name) => { assert(actual && actual.headers && actual.headers.has(name), 'response to have header ' + name); return api; },
    jsonBody: (path) => { let v; try { v = actual.json(); } catch { v = undefined; } assert(v !== undefined && (path === undefined || path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), v) !== undefined), 'response to have JSON body' + (path ? ' with ' + path : '')); return api; },
  };
  const chains = ['to', 'be', 'been', 'is', 'that', 'which', 'and', 'has', 'have', 'with', 'at', 'of', 'same', 'does', 'deep'];
  for (const c of chains) Object.defineProperty(api, c, { get: () => api });
  Object.defineProperty(api, 'not', { get: () => ((negate = !negate), api) });
  const flags = {
    ok: () => assert(Boolean(actual), fmt(actual) + ' to be truthy'),
    true: () => assert(actual === true, fmt(actual) + ' to be true'),
    false: () => assert(actual === false, fmt(actual) + ' to be false'),
    null: () => assert(actual === null, fmt(actual) + ' to be null'),
    undefined: () => assert(actual === undefined, fmt(actual) + ' to be undefined'),
    exist: () => assert(actual != null, fmt(actual) + ' to exist'),
    empty: () => assert(actual != null && (typeof actual === 'string' || Array.isArray(actual) ? actual.length === 0 : Object.keys(actual).length === 0), fmt(actual) + ' to be empty'),
  };
  for (const [k, fn] of Object.entries(flags)) Object.defineProperty(api, k, { get: () => (fn(), api) });
  return api;
}

const store = (obj, changed) => ({
  get: (k) => obj[k],
  set: (k, v) => { obj[k] = typeof v === 'string' ? v : JSON.stringify(v); changed && changed.add(k); },
  unset: (k) => { delete obj[k]; changed && changed.add(k); },
  has: (k) => Object.prototype.hasOwnProperty.call(obj, k),
  toObject: () => ({ ...obj }),
  replaceIn: (s) => String(s).replace(/\{\{\s*([$\w.-]+)\s*\}\}/g, (m, n) => (n in obj ? obj[n] : m)),
});

const headerList = (list) => ({
  get: (name) => { const h = list.find((x) => x.key.toLowerCase() === String(name).toLowerCase()); return h && h.value; },
  has: (name) => list.some((x) => x.key.toLowerCase() === String(name).toLowerCase()),
  add: ({ key, value }) => list.push({ key, value: String(value), enabled: true }),
  upsert: ({ key, value }) => { const h = list.find((x) => x.key.toLowerCase() === key.toLowerCase()); if (h) h.value = String(value); else list.push({ key, value: String(value), enabled: true }); },
  remove: (name) => { const i = list.findIndex((x) => x.key.toLowerCase() === String(name).toLowerCase()); if (i >= 0) list.splice(i, 1); },
  toObject: () => Object.fromEntries(list.map((h) => [h.key, h.value])),
});

self.onmessage = async (event) => {
  const { script, phase, request, response, environment, globals, variables, info } = event.data;
  const tests = [], logs = [], pending = [];
  const env = { ...environment }, glob = { ...globals }, vars = { ...variables };
  const envChanged = new Set(), globChanged = new Set();
  const req = { ...request, headers: request.headers.map((h) => ({ ...h })) };
  const pmRequest = {
    get url() { return req.url; }, set url(v) { req.url = String(v); },
    get method() { return req.method; }, set method(v) { req.method = String(v).toUpperCase(); },
    headers: headerList(req.headers),
    get body() { return req.body; }, set body(v) { req.body = typeof v === 'string' ? v : JSON.stringify(v); },
  };
  let pmResponse;
  if (response) {
    const h = new Map(response.headers.map(([k, v]) => [k.toLowerCase(), v]));
    pmResponse = {
      code: response.status, status: response.statusText, responseTime: response.time, responseSize: response.size,
      headers: { get: (n) => h.get(String(n).toLowerCase()), has: (n) => h.has(String(n).toLowerCase()), toObject: () => Object.fromEntries(h) },
      text: () => response.body,
      json: () => JSON.parse(response.body),
    };
    Object.defineProperty(pmResponse, 'to', { get: () => expect(pmResponse).to });
  }
  const pm = {
    info: { eventName: phase === 'pre' ? 'prerequest' : 'test', requestName: info.name, requestId: info.id },
    environment: store(env, envChanged),
    collectionVariables: store(env, envChanged),
    globals: store(glob, globChanged),
    variables: store(vars),
    request: pmRequest,
    response: pmResponse,
    expect,
    test: (name, fn) => {
      // Results keep the order tests were declared in, sync or async.
      const slot = tests.push({ name, passed: false, pending: true }) - 1;
      const done = (passed, e) => { tests[slot] = passed ? { name, passed: true } : { name, passed: false, error: e && e.message ? e.message : String(e) }; };
      try {
        const r = fn();
        if (r && typeof r.then === 'function') pending.push(r.then(() => done(true), (e) => done(false, e)));
        else done(true);
      } catch (e) { done(false, e); }
    },
  };
  const log = (level) => (...a) => logs.push((level === 'log' ? '' : level + ': ') + a.map(fmt).join(' '));
  const consoleShim = { log: log('log'), info: log('info'), warn: log('warn'), error: log('error'), debug: log('debug') };
  let error;
  try {
    const run = new Function('pm', 'console', 'expect', '"use strict"; return (async () => {\n' + script + '\n})();');
    await run(pm, consoleShim, expect);
  } catch (e) { error = e && e.message ? e.message : String(e); }
  await Promise.all(pending);
  self.postMessage({
    tests, logs, error, request: req, variables: vars,
    environment: Object.fromEntries([...envChanged].map((k) => [k, k in env ? env[k] : null])),
    globals: Object.fromEntries([...globChanged].map((k) => [k, k in glob ? glob[k] : null])),
  });
};
`;
