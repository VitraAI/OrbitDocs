/**
 * A stand-in for the GitLab API that Git sync talks to, for local testing:
 *   node scripts/mock-gitlab.mjs        (http://localhost:8092/api/v4)
 * Records commit statuses and merge request notes; GET /calls lists them.
 */
import { createServer } from 'node:http';

const port = Number(process.env.MOCK_GITLAB_PORT ?? 8092);
const calls = [];

createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  if (req.method === 'GET' && req.url === '/calls') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(calls, null, 2));
  }
  const status = /^\/api\/v4\/projects\/([^/]+)\/statuses\/([0-9a-f]+)$/.exec(req.url ?? '');
  const note = /^\/api\/v4\/projects\/([^/]+)\/merge_requests\/(\d+)\/notes$/.exec(req.url ?? '');
  if (req.method === 'POST' && (status || note)) {
    if (req.headers['private-token'] !== (process.env.MOCK_GITLAB_TOKEN ?? 'glpat-test')) {
      res.writeHead(401).end('{"message":"401 Unauthorized"}');
      return;
    }
    const entry = { at: new Date().toISOString(), project: decodeURIComponent((status ?? note)[1]), ...(status ? { kind: 'status', sha: status[2] } : { kind: 'note', mr: Number(note[2]) }), body: JSON.parse(body || '{}') };
    calls.push(entry);
    console.log(`${entry.kind === 'status' ? `status ${entry.sha.slice(0, 8)} → ${entry.body.state}` : `note on !${entry.mr}: ${entry.body.body.split('\n')[0]}`}`);
    res.writeHead(201, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ id: calls.length }));
  }
  res.writeHead(404).end('{"message":"404 Not Found"}');
}).listen(port, 'localhost', () => console.log(`Mock GitLab API at http://localhost:${port}/api/v4`));
