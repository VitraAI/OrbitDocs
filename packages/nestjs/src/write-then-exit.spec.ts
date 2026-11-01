import { describe, expect, it, vi } from 'vitest';

import { writeThenExit } from './write-then-exit';

describe('writeThenExit', () => {
  it('exits only once the write has been flushed', () => {
    let flush: (() => void) | undefined;
    const stream = {
      write: vi.fn((_text: string, done: () => void) => {
        flush = done;
        return false;
      }),
    };
    const exit = vi.fn();

    writeThenExit(stream as never, 'ORBITDOCS_RESULT {}\n', 0, exit);

    expect(stream.write).toHaveBeenCalledWith('ORBITDOCS_RESULT {}\n', expect.any(Function));
    expect(exit).not.toHaveBeenCalled();
    flush?.();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('passes the exit code through', () => {
    const stream = { write: (_text: string, done: () => void) => (done(), true) };
    const exit = vi.fn();
    writeThenExit(stream as never, 'boom\n', 1, exit);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
