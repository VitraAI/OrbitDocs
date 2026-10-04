'use client';

import { useDocsSearch } from 'fumadocs-core/search/client';
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogFooter,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  TagsList,
  TagsListItem,
} from 'fumadocs-ui/components/dialog/search';
import type { DefaultSearchDialogProps } from 'fumadocs-ui/components/dialog/search-default';
import { useI18n } from 'fumadocs-ui/contexts/i18n';
import { use, useMemo, useState } from 'react';

let oramaStatic: Promise<typeof import('fumadocs-core/search/client/orama-static')> | undefined;

/**
 * Fumadocs' default search dialog (static Orama index) with its footer, the
 * tag filters and `footer`, inside the dialog. fumadocs-ui 16.15 renders that
 * footer outside the dialog's portal, so with tags or a footer it shows at the
 * top of every page. Same props as the default dialog.
 */
export function OrbitSearchDialog({ defaultTag, tags = [], api, delayMs, allowClear = false, links = [], footer, type: _type, ...props }: DefaultSearchDialogProps) {
  const { locale } = useI18n();
  const [tag, setTag] = useState(defaultTag);
  const client = use((oramaStatic ??= import('fumadocs-core/search/client/orama-static'))).staticClient({ from: api, locale, tag });
  const { search, setSearch, query } = useDocsSearch({ client, delayMs });
  const defaultItems = useMemo(
    () => (links.length ? links.map(([name, url]) => ({ type: 'page' as const, id: name, content: name, url })) : null),
    [links],
  );
  return (
    <SearchDialog search={search} onSearchChange={setSearch} isLoading={query.isLoading} {...props}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList items={query.data !== 'empty' ? query.data : defaultItems} />
        {tags.length || footer ? (
          <SearchDialogFooter className="flex flex-col gap-2">
            {tags.length ? (
              <TagsList tag={tag} onTagChange={setTag} allowClear={allowClear}>
                {tags.map((t) => (
                  <TagsListItem key={t.value} value={t.value}>
                    {t.name}
                  </TagsListItem>
                ))}
              </TagsList>
            ) : null}
            {footer}
          </SearchDialogFooter>
        ) : null}
      </SearchDialogContent>
    </SearchDialog>
  );
}
