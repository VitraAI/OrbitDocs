/**
 * A local OpenAI-compatible model for trying Ask AI without a key:
 *   node scripts/mock-llm.mjs   (http://localhost:8091/v1)
 * It answers from the first documentation source it is given and cites it,
 * streaming word by word like a real model.
 */
import { createServer } from 'node:http';

const port = Number(process.env.MOCK_LLM_PORT ?? 8091);

function reply(messages) {
  const last = messages.at(-1)?.content ?? '';
  const text = typeof last === 'string' ? last : last.map((p) => p.text ?? '').join('');
  const question = /Question: ([\s\S]*)$/.exec(text)?.[1]?.trim() ?? text;
  const source = /\[1\] ([^\n]+)\n([\s\S]*?)(\n\n---|\n\nQuestion:)/.exec(text);
  if (!source) return "I couldn't find that in the docs. Try the search, or the API reference.";
  const title = source[1].replace(/\s*\(.*\)$/, '');
  const body = source[2]
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#+\s.*$/gm, '')
    .replace(/^\|.*$/gm, '')
    .replace(/<[^>]+>/g, '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20)
    .slice(0, 2)
    .join(' ');
  const code = /```(\w*)\n([\s\S]*?)```/.exec(source[2]);
  return `**${question.replace(/\?$/, '')}**: according to *${title}*, ${body || 'see the page for details.'} [1]${code ? `\n\n\`\`\`${code[1] || 'bash'}\n${code[2].trim()}\n\`\`\`` : ''}`;
}

createServer(async (req, res) => {
  if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) {
    res.writeHead(404).end();
    return;
  }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  const answer = reply(body.messages ?? []);
  const id = `chatcmpl-${Date.now()}`;
  const chunk = (delta, finish = null) => `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
  if (!body.stream) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id, object: 'chat.completion', model: body.model, choices: [{ index: 0, message: { role: 'assistant', content: answer }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  res.write(chunk({ role: 'assistant', content: '' }));
  for (const word of answer.split(/(?<= )/)) {
    res.write(chunk({ content: word }));
    await new Promise((r) => setTimeout(r, 25));
  }
  res.write(chunk({}, 'stop'));
  res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', model: body.model, choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`);
  res.end('data: [DONE]\n\n');
}).listen(port, 'localhost', () => console.log(`Mock LLM at http://localhost:${port}/v1`));
