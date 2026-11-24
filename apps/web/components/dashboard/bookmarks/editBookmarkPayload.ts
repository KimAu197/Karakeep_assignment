/**
 * The title and the note are only sent when the user changed them in the
 * dialog. The title is pre-filled with a fallback (e.g. the crawled title)
 * when none is stored, so sending it unchanged would store that fallback. The
 * note can be saved from the preview sidebar while the dialog holds an older
 * copy, so sending it unchanged could overwrite the newer note.
 */
export function withTitleAndNoteOnlyIfChanged<
  T extends { title?: string | null; note?: string },
>(
  values: T,
  changed: { title: boolean; note: boolean },
): Omit<T, "title" | "note"> & { title?: string | null; note?: string } {
  const { title, note, ...rest } = values;
  return {
    ...rest,
    ...(changed.title ? { title: title ?? null } : {}),
    ...(changed.note ? { note } : {}),
  };
}
