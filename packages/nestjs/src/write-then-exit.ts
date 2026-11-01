/**
 * Writes `text` to `stream`, then exits with `code` once the write has been flushed.
 *
 * A write to a pipe is asynchronous on macOS, and past the pipe's buffer (64 KB) anywhere,
 * so `process.exit()` straight after `write()` drops what is still queued: a large
 * extraction result reached the CLI cut off mid-JSON. The write callback runs once the
 * data has been handed to the OS.
 */
export function writeThenExit(
  stream: Pick<NodeJS.WritableStream, 'write'>,
  text: string,
  code: number,
  exit: (code: number) => void = process.exit,
): void {
  stream.write(text, () => exit(code));
}
