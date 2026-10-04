import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { APICallError, type LanguageModel, type ModelMessage, RetryError, streamText } from 'ai';

import type { AiManifest, AiPage, AiSettings } from './manifest';
import type { Hit, SearchIndex } from './search';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Source {
  n: number;
  title: string;
  /** Site URL including base path. */
  url: string;
  heading?: string;
}

/** The configured model, with the key from the environment. `fetcher` makes its HTTP calls. */
export function languageModel(ai: AiSettings, env: Record<string, string | undefined>, fetcher?: typeof fetch): LanguageModel {
  const apiKey = env[ai.apiKeyEnv];
  if (!apiKey) throw new Error(`${ai.apiKeyEnv} is not set (API key for Ask AI)`);
  const baseURL = ai.baseUrl;
  switch (ai.provider) {
    case 'openai':
      return createOpenAI({ apiKey, baseURL, fetch: fetcher })(ai.model);
    case 'anthropic':
      return createAnthropic({ apiKey, baseURL, fetch: fetcher })(ai.model);
    case 'google':
      return createGoogle({ apiKey, baseURL, fetch: fetcher })(ai.model);
    case 'openai-compatible':
      if (!baseURL) throw new Error('ai.baseUrl is required for the openai-compatible provider');
      return createOpenAICompatible({ name: 'orbitdocs', apiKey, baseURL, fetch: fetcher })(ai.model);
  }
}

export function instructions(manifest: AiManifest): string {
  return [
    `You are the documentation assistant for ${manifest.site.title}.`,
    'Answer the question using only the numbered sources from the documentation below.',
    'Cite the sources you use inline as [1], [2]. Do not invent endpoints, fields or behaviour.',
    "If the sources don't answer the question, say so briefly and point to the closest page.",
    'Write in Markdown. Use fenced code blocks with a language for code, and keep answers short.',
    manifest.ai.askAi.instructions ?? '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Numbered passages for the prompt, and the matching citations for the reader. */
export function context(hits: Hit[], basePath: string): { text: string; sources: Source[] } {
  const sources: Source[] = [];
  const parts: string[] = [];
  const numbers = new Map<string, number>();
  // Site URLs end with a slash (trailingSlash builds).
  const href = (url: string) => `${basePath}${url.endsWith('/') ? url : `${url}/`}`;
  for (const { chunk } of hits) {
    let n = numbers.get(chunk.page.url);
    if (!n) {
      n = numbers.size + 1;
      numbers.set(chunk.page.url, n);
      sources.push({ n, title: chunk.page.title, url: href(chunk.page.url), heading: chunk.heading });
    }
    parts.push(`[${n}] ${chunk.page.title}${chunk.heading ? ` > ${chunk.heading}` : ''} (${href(chunk.page.url)})\n${chunk.text}`);
  }
  return { text: parts.join('\n\n---\n\n'), sources };
}

const line = (o: unknown) => `${JSON.stringify(o)}\n`;

/**
 * What a reader sees when an answer fails. Setup problems (a missing key) are named;
 * provider errors only give their HTTP status, since their text can echo request details.
 */
function readerMessage(err: unknown): string {
  if (APICallError.isInstance(err)) return `The AI provider couldn't answer${err.statusCode ? ` (HTTP ${err.statusCode})` : ''}. Try again in a moment.`;
  if (RetryError.isInstance(err)) return readerMessage(err.lastError);
  return err instanceof Error ? err.message : 'Ask AI could not answer.';
}

/**
 * Answers the last question as NDJSON lines:
 * `{type:"sources"}`, then `{type:"text",delta}`…, then `{type:"done"}` (or `{type:"error"}`).
 */
export function answer(opts: {
  manifest: AiManifest;
  index: SearchIndex;
  messages: ChatMessage[];
  env: Record<string, string | undefined>;
  /** Pages the reader may see. */
  canRead: (page: AiPage) => boolean;
  model?: LanguageModel;
  /** Makes the provider's HTTP calls. */
  fetch?: typeof fetch;
  signal?: AbortSignal;
}): Response {
  const { manifest, messages } = opts;
  const question = messages.at(-1)?.content ?? '';
  // Follow-ups ("and in Python?") search with the previous question too.
  const previous = messages.slice(0, -1).filter((m) => m.role === 'user').at(-1)?.content ?? '';
  let hits = opts.index.search(question, { limit: manifest.ai.askAi.maxSources, filter: opts.canRead });
  if (hits.length < 2 && previous) hits = opts.index.search(`${previous} ${question}`, { limit: manifest.ai.askAi.maxSources, filter: opts.canRead });
  const { text, sources } = context(hits, manifest.basePath);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (o: unknown) => controller.enqueue(enc.encode(line(o)));
      send({ type: 'sources', sources });
      try {
        const history: ModelMessage[] = messages.slice(-8, -1).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
        const result = streamText({
          model: opts.model ?? languageModel(manifest.ai, opts.env, opts.fetch),
          instructions: instructions(manifest),
          messages: [
            ...history,
            {
              role: 'user',
              content: `Documentation sources:\n\n${text || '(no matching documentation)'}\n\nQuestion: ${question.slice(0, 2000)}`,
            },
          ],
          abortSignal: opts.signal,
        });
        // fullStream, not textStream: textStream drops provider errors and ends as if answered.
        let failed: unknown;
        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') send({ type: 'text', delta: part.text });
          else if (part.type === 'error') failed = part.error;
        }
        if (failed !== undefined) throw failed;
        send({ type: 'done' });
      } catch (err) {
        send({ type: 'error', message: readerMessage(err) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}
