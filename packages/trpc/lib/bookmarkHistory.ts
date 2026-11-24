import type { ZBookmarkHistoryField } from "@karakeep/shared/types/bookmarkHistory";
import { BOOKMARK_HISTORY_FIELDS } from "@karakeep/shared/types/bookmarkHistory";

/**
 * The fields whose changes are recorded in the bookmark history.
 *
 * `private` fields are the owner's personal data (like `note`, which
 * `Bookmark.asZBookmark` also hides): their history is only returned to the
 * bookmark owner. Both the diff and the read-side filter use this registry.
 *
 * `autosaved` fields are saved by the UI while the user types (the note
 * autosaves after a short pause), so close saves are merged into one row (see
 * `mergeBookmarkHistoryChange`).
 */
export const BOOKMARK_HISTORY_FIELD_REGISTRY: Record<
  ZBookmarkHistoryField,
  { private: boolean; autosaved: boolean }
> = {
  title: { private: false, autosaved: false },
  url: { private: false, autosaved: false },
  description: { private: false, autosaved: false },
  text: { private: false, autosaved: false },
  note: { private: true, autosaved: true },
};

// A save of an autosaved field merges with that field's latest history row
// when the row is younger than this.
export const BOOKMARK_HISTORY_MERGE_WINDOW_MS = 5 * 60 * 1000;

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

export interface PreviousBookmarkHistoryRow {
  id: string;
  userId: string;
  oldValue: string | null;
  createdAt: Date;
}

/**
 * Applies the autosave merge rule to one change made by `userId` at `now`.
 * `previous` is the bookmark's most recent history row for the same field.
 *
 * The change is merged when its field is autosaved and `previous` was written
 * by the same user less than `BOOKMARK_HISTORY_MERGE_WINDOW_MS` before `now`:
 * `previous` is then deleted and the change starts from `previous.oldValue`.
 * If that makes the change a no-op (an edit that was reverted), no change is
 * left to write.
 */
export function mergeBookmarkHistoryChange(
  change: BookmarkHistoryChange,
  previous: PreviousBookmarkHistoryRow | undefined,
  userId: string,
  now: Date,
): { deleteRowId: string | null; change: BookmarkHistoryChange | null } {
  if (
    !BOOKMARK_HISTORY_FIELD_REGISTRY[change.field].autosaved ||
    !previous ||
    previous.userId !== userId ||
    now.getTime() - previous.createdAt.getTime() >=
      BOOKMARK_HISTORY_MERGE_WINDOW_MS
  ) {
    return { deleteRowId: null, change };
  }
  const oldValue = normalize(previous.oldValue);
  return {
    deleteRowId: previous.id,
    change:
      oldValue === normalize(change.newValue) ? null : { ...change, oldValue },
  };
}
