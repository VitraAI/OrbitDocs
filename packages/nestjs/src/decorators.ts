import { applyDecorators } from '@nestjs/common';
import { ApiExtension, ApiResponse } from '@nestjs/swagger';
import { CONTENT_EXTENSION, type ContentPosition, ORBIT_EXTENSION, type OrbitMarker, type OperationContent } from '@orbitdocs/openapi';

export type DocsOperationOptions = Omit<OrbitMarker, 'hidden'>;

/**
 * Puts one route in the public API reference. Routes are opt-in: anything not
 * marked never appears in the docs, so internal and admin routes cannot leak.
 *
 * Documentation metadata only — no effect on routing, guards or behaviour.
 *
 * @example
 *   @Post()
 *   @DocsOperation({ group: 'Bookings', title: 'Create a booking', order: 1 })
 *   create(@Body() dto: CreateBookingDto) {}
 */
export function DocsOperation(options: DocsOperationOptions = {}) {
  return ApiExtension(ORBIT_EXTENSION, options);
}

/** Keeps a route out of the reference even if it is marked (useful in opt-out mode). */
export function DocsHidden() {
  return ApiExtension(ORBIT_EXTENSION, { hidden: true } satisfies OrbitMarker);
}

/**
 * Documents the errors one route returns, and when. Generic codes (400 with
 * input, 401/403 when secured, 404 with a path parameter, 500) are added
 * automatically; list what this route adds or says more about.
 *
 * @example @DocsErrors({ 404: 'No booking with this id.', 409: 'The flight is full.' })
 */
export function DocsErrors(errors: Partial<Record<number, string>>) {
  return applyDecorators(
    ...Object.entries(errors).map(([status, description]) =>
      ApiResponse({ status: Number(status), description }),
    ),
  );
}

export interface CodeSample {
  /** Language id for highlighting: `typescript`, `python`, `go`, `shell`… */
  lang: string;
  /** Tab label; defaults to the language. */
  label?: string;
  source: string;
}

/** Hand-written code samples shown before the generated ones (`x-codeSamples`). */
export function DocsSamples(samples: CodeSample[]) {
  return ApiExtension('x-codeSamples', samples);
}

/** Any OpenAPI `x-` extension on the operation (shown or used by plugins). */
export function DocsExtension(key: `x-${string}`, value: unknown) {
  return ApiExtension(key, value);
}

/**
 * Extra Markdown shown in the operation's reference section — notes, warnings,
 * links. GitHub alerts (`> [!WARNING]`) render as callouts. For longer content
 * with components, use `reference/<api>/<operation>.mdx` in the docs app.
 *
 * @example
 *   @DocsContent('> [!WARNING]\n> Cancelling within 24 h of departure is not refunded.', 'before-parameters')
 */
export function DocsContent(markdown: string, position: ContentPosition = 'after-description') {
  return ApiExtension(CONTENT_EXTENSION, [{ markdown, position } satisfies OperationContent]);
}
