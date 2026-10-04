/**
 * Sends a Git sync webhook as GitLab or GitHub would, for local testing.
 *
 *   node scripts/webhook.mjs <webhook url> <secret> gitlab push <branch> <sha> [message]
 *   node scripts/webhook.mjs <webhook url> <secret> gitlab mr <open|update|merge|close> <iid> <branch> <sha> [title]
 *   node scripts/webhook.mjs <webhook url> <secret> github push <branch> <sha> [message]
 *   node scripts/webhook.mjs <webhook url> <secret> github pr <opened|synchronize|closed|merged> <number> <branch> <sha> [title]
 */
import { createHmac } from 'node:crypto';

const [url, secret, provider, kind, ...rest] = process.argv.slice(2);
let event;
let body;
if (provider === 'gitlab' && kind === 'push') {
  const [branch, sha, message = 'Update docs'] = rest;
  event = 'Push Hook';
  body = { object_kind: 'push', ref: `refs/heads/${branch}`, before: '0'.repeat(40), after: sha, checkout_sha: sha, commits: [{ id: sha, message }] };
} else if (provider === 'gitlab' && kind === 'mr') {
  const [action, iid, branch, sha, title = 'Update docs'] = rest;
  event = 'Merge Request Hook';
  body = {
    object_kind: 'merge_request',
    object_attributes: { iid: Number(iid), action, source_branch: branch, target_branch: 'main', title, url: `https://gitlab.example/merge_requests/${iid}`, last_commit: { id: sha, message: title }, ...(action === 'update' ? { oldrev: '1'.repeat(40) } : {}) },
  };
} else if (provider === 'github' && kind === 'push') {
  const [branch, sha, message = 'Update docs'] = rest;
  event = 'push';
  body = { ref: `refs/heads/${branch}`, after: sha, deleted: false, head_commit: { id: sha, message } };
} else if (provider === 'github' && kind === 'pr') {
  const [action, number, branch, sha, title = 'Update docs'] = rest;
  event = 'pull_request';
  body = { action: action === 'merged' ? 'closed' : action, number: Number(number), pull_request: { merged: action === 'merged', title, html_url: `https://github.example/pull/${number}`, head: { ref: branch, sha } } };
} else {
  console.error('Usage: see the comment at the top of this file.');
  process.exit(1);
}
const raw = JSON.stringify(body);
const headers = { 'content-type': 'application/json' };
if (provider === 'gitlab') Object.assign(headers, { 'x-gitlab-event': event, 'x-gitlab-token': secret });
else Object.assign(headers, { 'x-github-event': event, 'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}` });
const res = await fetch(url, { method: 'POST', headers, body: raw });
console.log(res.status, await res.text());
