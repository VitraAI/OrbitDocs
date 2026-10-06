# @vitra-ai/orbitdocs-ui

## 0.2.1

### Patch Changes

- @vitra-ai/orbitdocs-openapi@0.2.1

## 0.2.0

### Minor Changes

- b9ca837: The API client's collections panel can be resized: drag its edge (or focus it and press ← or →) between 200 and 560 px, and double-click to reset. The client remembers the width. Its empty response pane also looks cleaner, with a send icon and the keyboard shortcuts as keys.

### Patch Changes

- b9ca837: File fields in form bodies work again: the API client shows them as file fields (one per file for a list of files) instead of a text field holding `[null]`, code samples attach a file instead of sending `files=[null]`, and the reference shows their type as `string · binary` instead of `any`. Lists in form bodies are now sent as one field per item.
- b9ca837: The landing page terminal no longer shows a scrollbar under long commands. They still scroll sideways, and keyboard users can focus the terminal to scroll it with the arrow keys.
- Updated dependencies [b9ca837]
  - @vitra-ai/orbitdocs-openapi@0.2.0

## 0.1.0

### Initial release

- API reference UI: operations, schemas, examples, code samples in many languages, and "Test Request".
- API client built on HeroUI: collections, request tabs, environments, history, scripts, code generation, a collection runner, a command palette, right-click menus, and settings for layout, density, font and accent.
- Ask AI panel and the shared theme (`styles.css`).
- New `send` option on each API (`apis[].send`, default `true`): set it to `false` to stop readers from sending that API's requests from the docs, for example for a demo API with no live server. Test Request and Send are disabled with a short reason (`sendDisabledMessage`), while code samples and Copy as cURL keep working.
- - New `navigation.apiSwitcher` option (default `sidebar`): with several APIs, the reference sidebar's title is a select of the APIs, and "API Reference" in the top bar links to the first API. `menu` keeps the top-bar menu of every API. - The API client's collections are a tree: each collection and folder opens and closes, shows its number of requests, and remembers its state in the browser. Only the open request's folder is expanded at first; a search expands every match, and one button collapses or expands every folder. - Browsers and password managers no longer autofill the reference filter or the API client's search fields. API keys and other secrets are masked with CSS instead of password fields, which made browsers treat the page as a login form. - The API client seeds one environment per server, shared by every API on it, instead of one copy per API. Copies saved by earlier versions fold into it, keeping the values the reader typed. - Long examples and inline code (tokens, keys, URLs) wrap in the reference instead of making the page scroll sideways.
- Markdown tables in operation descriptions and `@DocsContent` are styled like the guides' tables: bordered, compact, and scrolling sideways on narrow screens.
