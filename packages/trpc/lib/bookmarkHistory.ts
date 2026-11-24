import type { ZBookmarkHistoryField } from "@karakeep/shared/types/bookmarkHistory";
import { BOOKMARK_HISTORY_FIELDS } from "@karakeep/shared/types/bookmarkHistory";

/**
 * The fields whose changes are recorded in the bookmark history.
 *
 * `private` fields are the owner's personal data (like `note`, which
 * `Bookmark.asZBookmark` also hides): their history is only returned to the
 * bookmark owner. Both the diff and the read-side filter use this registry.
 */
export const BOOKMARK_HISTORY_FIELD_REGISTRY: Record<
  ZBookmarkHistoryField,
  { private: boolean }
> = {
  title: { private: false },
  url: { private: false },
  description: { private: false },
  text: { private: false },
  note: { private: true },
};

export const PRIVATE_BOOKMARK_HISTORY_FIELDS = BOOKMARK_HISTORY_FIELDS.filter(
  (field) => BOOKMARK_HISTORY_FIELD_REGISTRY[field].private,
);

export type BookmarkHistoryValues = Partial<
  Record<ZBookmarkHistoryField, string | null | undefined>
>;

export interface BookmarkHistoryChange {
  field: ZBookmarkHistoryField;
  oldValue: string | null;
  newValue: string | null;
}

// `null`, `undefined` and `""` are all the same "empty" value.
function normalize(value: string | null | undefined): string | null {
  return value ? value : null;
}

/**
 * Compares the stored values of a bookmark with the values an update is about
 * to write, and returns one change per tracked field that really changes.
 *
 * A field that is `undefined` in `toWrite` is not being written, so it never
 * produces a change.
 */
export function diffBookmarkHistory(
  stored: BookmarkHistoryValues,
  toWrite: BookmarkHistoryValues,
): BookmarkHistoryChange[] {
  const changes: BookmarkHistoryChange[] = [];
  for (const field of BOOKMARK_HISTORY_FIELDS) {
    if (toWrite[field] === undefined) {
      continue;
    }
    const oldValue = normalize(stored[field]);
    const newValue = normalize(toWrite[field]);
    if (oldValue !== newValue) {
      changes.push({ field, oldValue, newValue });
    }
  }
  return changes;
}
