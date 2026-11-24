/**
 * The dialog pre-fills the title with a fallback (e.g. the crawled title) when
 * no title is stored, so sending it unchanged would store that fallback. The
 * title is therefore only sent when the user changed the field.
 */
export function withTitleOnlyIfChanged<T extends { title?: string | null }>(
  values: T,
  titleChanged: boolean,
): Omit<T, "title"> & { title?: string | null } {
  const { title, ...rest } = values;
  return titleChanged ? { ...rest, title: title ?? null } : rest;
}
