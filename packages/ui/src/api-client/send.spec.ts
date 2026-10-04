import { describe, expect, it, vi } from 'vitest';

import { sendRequest } from './send';
import type { Collection, RequestDraft } from './types';

const collectionBase: Collection = { id: 'api:t', name: 'T', auth: { type: 'none' }, folders: [], preRequestScript: '', postResponseScript: '' };
const request: RequestDraft = { id: 't:one', collectionId: 'api:t', name: 'One', method: 'GET', url: 'https://x/one', params: [], headers: [], body: { mode: 'none', raw: '', form: [] }, auth: { type: 'inherit' }, preRequestScript: '', postResponseScript: '' };

describe('sendRequest', () => {
  it('sends nothing for a collection with sending off', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const collection = { ...collectionBase, sendDisabled: 'Demo API.' };
      const outcome = await sendRequest(request, { collection, environment: undefined, globals: [], runVariables: { a: '1' } });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(outcome.error).toBe('Demo API.');
      expect(outcome.response).toBeUndefined();
      expect(outcome.runVariables).toEqual({ a: '1' });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
