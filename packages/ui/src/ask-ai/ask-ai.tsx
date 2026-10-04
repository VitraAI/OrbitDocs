'use client';

import { Button, Drawer, Kbd, TextArea, Tooltip } from '@heroui/react';
import { Marked } from 'marked';
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LuArrowUp, LuCheck, LuCopy, LuFileText, LuRotateCcw, LuSparkles, LuSquare } from 'react-icons/lu';

interface Source {
  n: number;
  title: string;
  url: string;
  heading?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  error?: string;
  pending?: boolean;
}

interface AiConfig {
  enabled: boolean;
  greeting?: string;
  suggestions: string[];
}

/** Markdown from the model, without raw HTML or images; links stay on http(s) or the site. */
const markdown = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html: () => '',
    image: () => '',
    link({ href, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (!/^(https?:\/\/|\/|#)/.test(href)) return text;
      const external = /^https?:\/\//.test(href);
      return `<a href="${href.replace(/"/g, '&quot;')}"${external ? ' target="_blank" rel="noreferrer"' : ''}>${text}</a>`;
    },
  },
});

/** `[1]` citations become links to their source. */
function render(content: string, sources: Source[] = []): string {
  const html = markdown.parse(content, { async: false }) as string;
  return html.replace(/\[(\d+)\](?![^<]*<\/code>)/g, (m, n: string) => {
    const s = sources.find((x) => x.n === Number(n));
    return s ? `<a class="od-ai-cite" href="${s.url}" title="${s.title.replace(/"/g, '&quot;')}">${n}</a>` : m;
  });
}

/** The sources an answer cites; all of them when it cites none. */
function citedSources(m: Message): Source[] {
  const cited = new Set([...m.content.matchAll(/\[(\d+)\]/g)].map((x) => Number(x[1])));
  const used = (m.sources ?? []).filter((s) => cited.has(s.n));
  return used.length ? used : (m.sources ?? []);
}

const STORE = 'orbitdocs:ask-ai';

/**
 * "Ask AI" in the top bar: a chat over the docs, answered by the site's own
 * LLM with sources. Hidden when the site has no AI server (plain static hosting).
 */
export function AskAi({ base }: { base: string }) {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [copied, setCopied] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const busy = messages.at(-1)?.pending ?? false;

  useEffect(() => {
    fetch(`${base}/_ai/config/`)
      .then((r) => (r.ok ? (r.json() as Promise<AiConfig>) : null))
      .then((c) => setConfig(c?.enabled ? c : null))
      .catch(() => setConfig(null));
    try {
      const saved = sessionStorage.getItem(STORE);
      if (saved) setMessages((JSON.parse(saved) as Message[]).filter((m) => !m.pending));
    } catch {
      // private mode: start fresh
    }
  }, [base]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(messages.filter((m) => !m.pending)));
    } catch {
      // ignore
    }
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  // ⌘I / Ctrl+I opens Ask AI.
  useEffect(() => {
    if (!config) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [config]);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      setInput('');
      const history: Message[] = [...messages, { role: 'user', content: q }];
      setMessages([...history, { role: 'assistant', content: '', pending: true }]);
      const update = (fn: (m: Message) => Message) => setMessages((all) => [...all.slice(0, -1), fn(all.at(-1)!)]);
      const controller = new AbortController();
      abort.current = controller;
      try {
        const res = await fetch(`${base}/_ai/chat/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `Ask AI failed (${res.status})`);
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            const ev = JSON.parse(line) as { type: string; delta?: string; sources?: Source[]; message?: string };
            if (ev.type === 'sources') update((m) => ({ ...m, sources: ev.sources }));
            else if (ev.type === 'text') update((m) => ({ ...m, content: m.content + (ev.delta ?? '') }));
            else if (ev.type === 'error') update((m) => ({ ...m, error: ev.message }));
          }
        }
        update((m) => ({ ...m, pending: false }));
      } catch (err) {
        const stopped = (err as Error).name === 'AbortError';
        update((m) => ({ ...m, pending: false, error: stopped ? undefined : (err as Error).message }));
      } finally {
        abort.current = null;
      }
    },
    [base, busy, messages],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void ask(input);
    }
  };

  const rendered = useMemo(() => messages.map((m) => (m.role === 'assistant' ? render(m.content, m.sources) : '')), [messages]);

  if (!config) return null;
  return (
    <>
      <Tooltip delay={400}>
        <Button size="sm" variant="ghost" className="od-ai-trigger" onPress={() => setOpen(true)} aria-label="Ask AI">
          <LuSparkles size={15} />
          <span className="od-ai-trigger-label">Ask AI</span>
        </Button>
        <Tooltip.Content>
          Ask AI <Kbd>⌘ I</Kbd>
        </Tooltip.Content>
      </Tooltip>
      <Drawer>
        <Drawer.Backdrop isOpen={open} onOpenChange={setOpen} variant="transparent">
          <Drawer.Content placement="right" className="od-ai">
            <Drawer.Dialog aria-label="Ask AI">
              <Drawer.CloseTrigger />
              <Drawer.Header className="od-ai-header">
                <Drawer.Heading>
                  <LuSparkles size={16} /> Ask AI
                </Drawer.Heading>
                {messages.length ? (
                  <Button size="sm" variant="ghost" onPress={() => setMessages([])} isDisabled={busy}>
                    <LuRotateCcw size={13} /> New chat
                  </Button>
                ) : null}
              </Drawer.Header>
              <Drawer.Body className="od-ai-body">
                {!messages.length ? (
                  <div className="od-ai-empty">
                    <span className="od-ai-empty-icon">
                      <LuSparkles size={22} />
                    </span>
                    <p>{config.greeting ?? 'Ask anything about these docs. Answers cite the pages they come from.'}</p>
                    {config.suggestions.length ? (
                      <div className="od-ai-suggestions">
                        {config.suggestions.map((s) => (
                          <Button key={s} size="sm" variant="secondary" onPress={() => void ask(s)}>
                            {s}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="od-ai-thread" aria-live="polite">
                    {messages.map((m, i) =>
                      m.role === 'user' ? (
                        <div key={i} className="od-ai-question">
                          {m.content}
                        </div>
                      ) : (
                        <div key={i} className="od-ai-answer">
                          {m.pending && !m.content ? (
                            <div className="od-ai-thinking" aria-label="Thinking">
                              <span />
                              <span />
                              <span />
                            </div>
                          ) : null}
                          {m.content ? <div className="od-ai-markdown prose" dangerouslySetInnerHTML={{ __html: rendered[i]! }} /> : null}
                          {m.error ? <p className="od-ai-error">{m.error}</p> : null}
                          {!m.pending && m.sources?.length ? (
                            <div className="od-ai-sources">
                              {citedSources(m).map((s) => (
                                <a key={s.n} href={s.url} className="od-ai-source">
                                  <span className="od-ai-source-n">{s.n}</span>
                                  <LuFileText size={13} />
                                  <span className="od-ai-source-title">{s.title}</span>
                                </a>
                              ))}
                            </div>
                          ) : null}
                          {!m.pending && m.content ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              isIconOnly
                              aria-label="Copy answer"
                              className="od-ai-copy"
                              onPress={() => {
                                void navigator.clipboard.writeText(m.content);
                                setCopied(i);
                                setTimeout(() => setCopied(null), 1500);
                              }}
                            >
                              {copied === i ? <LuCheck size={13} /> : <LuCopy size={13} />}
                            </Button>
                          ) : null}
                        </div>
                      ),
                    )}
                    <div ref={end} />
                  </div>
                )}
              </Drawer.Body>
              <Drawer.Footer className="od-ai-footer">
                <div className="od-ai-composer">
                  <TextArea
                    aria-label="Your question"
                    placeholder="Ask a question…"
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    className="od-ai-input"
                    autoFocus
                  />
                  {busy ? (
                    <Button isIconOnly size="sm" variant="secondary" aria-label="Stop" onPress={() => abort.current?.abort()}>
                      <LuSquare size={12} />
                    </Button>
                  ) : (
                    <Button isIconOnly size="sm" aria-label="Send" isDisabled={!input.trim()} onPress={() => void ask(input)}>
                      <LuArrowUp size={15} />
                    </Button>
                  )}
                </div>
                <p className="od-ai-note">Answers come from these docs and can be wrong. Check the sources.</p>
              </Drawer.Footer>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
    </>
  );
}
