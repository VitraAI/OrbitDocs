import type { ContentPosition, HttpMethod, Stability } from '@orbitdocs/openapi';
import type { ReactNode } from 'react';

/**
 * Serializable views of the reference's sections. The page server-renders the
 * section of its own URL and ships the others as light placeholders; their
 * full views load from `<reference>/sections/<group-slug>.json` (and
 * `models.json`), built by the same code, and render with the same component.
 */

export interface SampleData {
  id: string;
  label: string;
  /** Plain source (copy button). */
  code: string;
  /** Highlighted HTML. */
  html: string;
}

export interface ResponseData {
  status: string;
  description: string;
  mediaType?: string;
  /** Example body: plain (copy button) and highlighted. */
  code?: string;
  html?: string;
  /** Schema fields as HTML: in the Responses list and with "Show Schema". */
  schemaHtml?: string;
  /** Response headers as HTML (Responses list). */
  headersHtml?: string;
}

/** What a placeholder shows before the full section loads. */
export interface OperationHead {
  slug: string;
  method: HttpMethod | string;
  path: string;
  summary: string;
  deprecated?: boolean;
  stability?: Stability | string;
  /** Rough height in px, so the scrollbar barely moves when the section loads. */
  estimate?: number;
}

export interface OperationData extends OperationHead {
  secured: boolean;
  /** "Copy as Markdown". */
  markdown: string;
  descriptionHtml?: string;
  /** Inner HTML of each `.od-block` of the docs column before Responses: parameter groups, body. */
  blocks: string[];
  /** `x-orbitdocs-content` Markdown from the spec, by position. */
  inline: Array<{ position: ContentPosition; html: string }>;
  samples: SampleData[];
  /** Every language, when the page only carries one sample (the rest load from `/reference-samples/`). */
  sampleOptions?: Array<{ id: string; label: string }>;
  /** `<api>:<operation-slug>`, the request opened in the API client. */
  requestId: string;
  responses: ResponseData[];
}

/** `sections/<group-slug>.json`. */
export interface GroupSectionsFile {
  operations: Record<string, OperationData>;
}

/** `sections/models.json`: each model's fields as HTML, by schema name. */
export interface ModelsSectionsFile {
  models: Record<string, string>;
}

/** The Models section's index: names and descriptions, always in the page. */
export interface ModelHead {
  name: string;
  description?: string;
}

/** Extra content placed inside an operation's section (MDX file or @DocsContent). */
export interface ExtraContent {
  position: ContentPosition;
  node: ReactNode;
}
