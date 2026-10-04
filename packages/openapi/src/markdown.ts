import type { OperationModel, ReferenceModel } from './model';
import type { Schema } from './types';

import { typeLabel } from './labels';

const fence = (lang: string, body: string) => `\`\`\`${lang}\n${body}\n\`\`\``;

/** One operation as Markdown (Copy as Markdown, llms-full.txt, per-page .md). */
export function operationMarkdown(op: OperationModel, model: ReferenceModel): string {
  const schemas = model.schemas;
  const lines: string[] = [`## ${op.summary}`, '', `\`${op.method.toUpperCase()} ${op.path}\``, ''];
  if (op.deprecated) lines.push('> Deprecated.', '');
  if (op.description) lines.push(op.description, '');
  if (op.parameters.length) {
    lines.push('### Parameters', '', '| Name | In | Type | Required | Description |', '| --- | --- | --- | --- | --- |');
    for (const p of op.parameters) {
      lines.push(`| \`${p.name}\` | ${p.in} | ${typeLabel(p.schema, schemas)} | ${p.required ? 'yes' : 'no'} | ${(p.description ?? '').replace(/\n/g, ' ')} |`);
    }
    lines.push('');
  }
  const body = op.requestBody?.content[0];
  if (body) {
    lines.push(`### Request body (\`${body.mediaType}\`)`, '');
    if (op.requestBody?.description) lines.push(op.requestBody.description, '');
    if (body.example !== undefined) lines.push(fence('json', JSON.stringify(body.example, null, 2)), '');
  }
  lines.push('### Responses', '');
  for (const r of op.responses) {
    lines.push(`- **${r.status}** ${r.description}`);
    const c = r.content[0];
    if (c?.example !== undefined && r.status.startsWith('2')) lines.push('', fence('json', JSON.stringify(c.example, null, 2)));
  }
  return lines.join('\n');
}

/** A whole API as Markdown. */
export function referenceMarkdown(model: ReferenceModel): string {
  const parts = [`# ${model.title} (${model.version})`, '', model.description ?? ''];
  for (const g of model.groups) {
    if (g.name) parts.push('', `# ${g.name}`, '', g.description ?? '');
    for (const op of g.operations) parts.push('', operationMarkdown(op, model));
  }
  return parts.join('\n');
}
