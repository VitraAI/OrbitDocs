/** Kebab-case slug: "Create a booking (async)" → "create-a-booking". */
export function slugify(text: string, maxWords = 8): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .split('-')
      .filter(Boolean)
      .slice(0, maxWords)
      .join('-') || 'operation'
  );
}

/** `slugify(text)`, made unique against `used` (which it updates). */
export function uniqueSlug(text: string, used: Set<string>): string {
  const base = slugify(text);
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
  used.add(slug);
  return slug;
}
