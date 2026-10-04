/** Code-sample languages shown on every operation, in tab order. */
export interface SampleLanguage {
  id: string;
  label: string;
  /** snippetz target + client. */
  target: string;
  client: string;
  /** shiki language id. */
  highlight: string;
}

export const SAMPLE_LANGUAGES: SampleLanguage[] = [
  { id: 'curl', label: 'Shell', target: 'shell', client: 'curl', highlight: 'shellscript' },
  { id: 'node', label: 'Node.js', target: 'node', client: 'fetch', highlight: 'javascript' },
  { id: 'python', label: 'Python', target: 'python', client: 'requests', highlight: 'python' },
  { id: 'go', label: 'Go', target: 'go', client: 'native', highlight: 'go' },
  { id: 'java', label: 'Java', target: 'java', client: 'okhttp', highlight: 'java' },
  { id: 'php', label: 'PHP', target: 'php', client: 'guzzle', highlight: 'php' },
  { id: 'ruby', label: 'Ruby', target: 'ruby', client: 'native', highlight: 'ruby' },
  { id: 'csharp', label: 'C#', target: 'csharp', client: 'httpclient', highlight: 'csharp' },
  { id: 'rust', label: 'Rust', target: 'rust', client: 'reqwest', highlight: 'rust' },
  { id: 'swift', label: 'Swift', target: 'swift', client: 'nsurlsession', highlight: 'swift' },
];

/** Languages for `x-codeSamples` entries, mapped to shiki ids. */
export function highlightLanguage(lang: string): string {
  const l = lang.toLowerCase();
  const map: Record<string, string> = {
    shell: 'shellscript', bash: 'shellscript', sh: 'shellscript', curl: 'shellscript',
    ts: 'typescript', typescript: 'typescript', js: 'javascript', javascript: 'javascript', node: 'javascript',
    py: 'python', python: 'python', go: 'go', golang: 'go', java: 'java', kotlin: 'kotlin',
    php: 'php', ruby: 'ruby', rb: 'ruby', csharp: 'csharp', 'c#': 'csharp', rust: 'rust', swift: 'swift',
    json: 'json', http: 'http',
  };
  return map[l] ?? 'text';
}
