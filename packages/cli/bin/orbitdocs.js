#!/usr/bin/env node
// The CLI lives in dist/ (built by tsup). This committed entry lets pnpm link the
// `orbitdocs` binary in a fresh clone, before dist/ exists.
import '../dist/index.js';
