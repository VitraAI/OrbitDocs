/** OpenAPI extension written by `@DocsOperation` (and readable from any spec). */
export const ORBIT_EXTENSION = 'x-orbitdocs';
/** Extensions OrbitDocs adds to the public document. */
export const ORDER_EXTENSION = 'x-orbitdocs-order';
export const STABILITY_EXTENSION = 'x-orbitdocs-stability';
export const HANDLER_EXTENSION = 'x-orbitdocs-handler';

export type Stability = 'stable' | 'beta' | 'alpha' | 'experimental' | 'deprecated';

/** How one operation reads in the reference. */
export interface OrbitMarker {
  /** Sidebar group (becomes the operation's only tag). Defaults to its existing tags. */
  group?: string;
  /** Title, an action in plain words: "Create a booking". Defaults to `summary`. */
  title?: string;
  /** What it does and when to use it. Defaults to `description`. */
  description?: string;
  /** Position within its group, ascending. */
  order?: number;
  stability?: Stability;
  /** Excludes the operation even when its controller is documented. */
  hidden?: boolean;
}

/** Extra Markdown for one operation (`@DocsContent`), shown in its reference section. */
export const CONTENT_EXTENSION = 'x-orbitdocs-content';

/** Where extra content appears inside an operation's section. */
export type ContentPosition = 'before-parameters' | 'after-description' | 'after-responses' | 'aside';

export interface OperationContent {
  markdown: string;
  position?: ContentPosition;
}
