---
'@orbitdocs/core': minor
'@orbitdocs/next': minor
'@orbitdocs/ui': minor
---

- New `navigation.apiSwitcher` option (default `sidebar`): with several APIs, the reference sidebar's title is a select of the APIs, and "API Reference" in the top bar links to the first API. `menu` keeps the top-bar menu of every API.
- The API client's collections are a tree: each collection and folder opens and closes, shows its number of requests, and remembers its state in the browser. Only the open request's folder is expanded at first; a search expands every match, and one button collapses or expands every folder.
- Browsers and password managers no longer autofill the reference filter or the API client's search fields. API keys and other secrets are masked with CSS instead of password fields, which made browsers treat the page as a login form.
- The API client seeds one environment per server, shared by every API on it, instead of one copy per API. Copies saved by earlier versions fold into it, keeping the values the reader typed.
- Long examples and inline code (tokens, keys, URLs) wrap in the reference instead of making the page scroll sideways.
