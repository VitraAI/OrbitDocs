import { randomBytes } from 'node:crypto';

/** A random, URL-safe id with a type prefix: `bk_7Hq2xP`. */
export function newId(prefix: string, length = 6): string {
  return `${prefix}_${randomBytes(length).toString('base64url').replace(/[-_]/g, 'x').slice(0, length)}`;
}
