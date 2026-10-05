import { resolveConfig } from '@vitra-ai/orbitdocs-next';

import input from '../orbitdocs.config';

/** The validated site config, shared by every page. */
export const orbit = resolveConfig(input);
