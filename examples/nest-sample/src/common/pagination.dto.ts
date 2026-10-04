import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PageQueryDto {
  /**
   * Items per page.
   * @example 20
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  /**
   * Cursor from the previous page's `nextCursor`. Omit for the first page.
   * @example "eyJpZCI6ImJrXzEwIn0"
   */
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class PageInfoDto {
  /**
   * Cursor for the next page; `null` on the last page.
   * @example "eyJpZCI6ImJrXzIwIn0"
   */
  nextCursor: string | null;

  /**
   * Whether more items follow.
   * @example true
   */
  hasMore: boolean;
}

export function paginate<T extends { id: string }>(items: T[], query: PageQueryDto) {
  const limit = query.limit ?? 20;
  const start = query.cursor ? Number(Buffer.from(query.cursor, 'base64url').toString()) : 0;
  const data = items.slice(start, start + limit);
  const next = start + limit < items.length ? Buffer.from(String(start + limit)).toString('base64url') : null;
  return { data, page: { nextCursor: next, hasMore: next !== null } };
}
