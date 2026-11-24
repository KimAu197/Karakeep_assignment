import { describe, expect, test } from "vitest";

import { BOOKMARK_HISTORY_FIELDS } from "@karakeep/shared/types/bookmarkHistory";

import type { BookmarkHistoryChange } from "../bookmarkHistory";
import {
  BOOKMARK_HISTORY_FIELD_REGISTRY,
  BOOKMARK_HISTORY_MERGE_WINDOW_MS,
  diffBookmarkHistory,
  mergeBookmarkHistoryChange,
  PRIVATE_BOOKMARK_HISTORY_FIELDS,
} from "../bookmarkHistory";

describe("bookmark history registry", () => {
  test("covers every tracked field and marks only note as private", () => {
    expect(Object.keys(BOOKMARK_HISTORY_FIELD_REGISTRY).sort()).toEqual(
      [...BOOKMARK_HISTORY_FIELDS].sort(),
    );
    expect(PRIVATE_BOOKMARK_HISTORY_FIELDS).toEqual(["note"]);
  });

  test("marks only note as autosaved", () => {
    expect(
      BOOKMARK_HISTORY_FIELDS.filter(
        (field) => BOOKMARK_HISTORY_FIELD_REGISTRY[field].autosaved,
      ),
    ).toEqual(["note"]);
  });
});

describe("diffBookmarkHistory", () => {
  test("returns a change for a field whose value changes", () => {
    expect(
      diffBookmarkHistory({ title: "Original" }, { title: "Edited" }),
    ).toEqual([{ field: "title", oldValue: "Original", newValue: "Edited" }]);
  });

  test("returns one change per changed field, in registry order", () => {
    expect(
      diffBookmarkHistory(
        {
          title: "t",
          url: "https://a.com",
          description: "d",
          text: null,
          note: null,
        },
        { note: "n", title: "t2", url: "https://b.com", description: "d" },
      ),
    ).toEqual([
      { field: "title", oldValue: "t", newValue: "t2" },
      { field: "url", oldValue: "https://a.com", newValue: "https://b.com" },
      { field: "note", oldValue: null, newValue: "n" },
    ]);
  });

  test("returns nothing when the value is unchanged", () => {
    expect(diffBookmarkHistory({ title: "Same" }, { title: "Same" })).toEqual(
      [],
    );
  });

  test("returns nothing when no field is written", () => {
    expect(diffBookmarkHistory({ title: "t", note: "n" }, {})).toEqual([]);
    expect(
      diffBookmarkHistory(
        { title: "t" },
        { title: undefined, note: undefined },
      ),
    ).toEqual([]);
  });

  test("treats null, undefined and empty string as the same empty value", () => {
    expect(diffBookmarkHistory({ title: null }, { title: "" })).toEqual([]);
    expect(diffBookmarkHistory({ note: "" }, { note: null })).toEqual([]);
    expect(diffBookmarkHistory({}, { description: "" })).toEqual([]);
    expect(diffBookmarkHistory({}, { description: null })).toEqual([]);
  });

  test("records clearing a value and setting an empty one as null", () => {
    expect(diffBookmarkHistory({ title: "t" }, { title: null })).toEqual([
      { field: "title", oldValue: "t", newValue: null },
    ]);
    expect(diffBookmarkHistory({ note: "n" }, { note: "" })).toEqual([
      { field: "note", oldValue: "n", newValue: null },
    ]);
    expect(diffBookmarkHistory({ title: "" }, { title: "t" })).toEqual([
      { field: "title", oldValue: null, newValue: "t" },
    ]);
  });

  test("treats a whitespace difference as a change", () => {
    // The caller passes the value it really writes (e.g. the trimmed url);
    // the diff itself compares exact strings.
    expect(diffBookmarkHistory({ title: "a" }, { title: "a " })).toEqual([
      { field: "title", oldValue: "a", newValue: "a " },
    ]);
  });
});

describe("mergeBookmarkHistoryChange", () => {
  const now = new Date("2026-01-01T00:10:00.000Z");
  const noteChange: BookmarkHistoryChange = {
    field: "note",
    oldValue: "ab",
    newValue: "abc",
  };
  const previousRow = (msBeforeNow: number, userId = "user-1") => ({
    id: "previous-row",
    userId,
    oldValue: "a",
    createdAt: new Date(now.getTime() - msBeforeNow),
  });

  test("merges an autosaved field with its recent row by the same user", () => {
    expect(
      mergeBookmarkHistoryChange(noteChange, previousRow(1000), "user-1", now),
    ).toEqual({
      deleteRowId: "previous-row",
      change: { field: "note", oldValue: "a", newValue: "abc" },
    });
    expect(
      mergeBookmarkHistoryChange(
        noteChange,
        previousRow(BOOKMARK_HISTORY_MERGE_WINDOW_MS - 1),
        "user-1",
        now,
      ).deleteRowId,
    ).toBe("previous-row");
  });

  test("does not merge a row at or beyond the window", () => {
    for (const age of [
      BOOKMARK_HISTORY_MERGE_WINDOW_MS,
      BOOKMARK_HISTORY_MERGE_WINDOW_MS + 1,
    ]) {
      expect(
        mergeBookmarkHistoryChange(noteChange, previousRow(age), "user-1", now),
      ).toEqual({ deleteRowId: null, change: noteChange });
    }
  });

  test("does not merge without a previous row or with another user's row", () => {
    expect(
      mergeBookmarkHistoryChange(noteChange, undefined, "user-1", now),
    ).toEqual({ deleteRowId: null, change: noteChange });
    expect(
      mergeBookmarkHistoryChange(
        noteChange,
        previousRow(1000, "user-2"),
        "user-1",
        now,
      ),
    ).toEqual({ deleteRowId: null, change: noteChange });
  });

  test("never merges fields that are not autosaved", () => {
    for (const field of ["title", "url", "description", "text"] as const) {
      const change = { field, oldValue: "ab", newValue: "abc" };
      expect(
        mergeBookmarkHistoryChange(change, previousRow(1000), "user-1", now),
      ).toEqual({ deleteRowId: null, change });
    }
  });

  test("deletes the previous row and writes nothing when the edit is reverted", () => {
    expect(
      mergeBookmarkHistoryChange(
        { field: "note", oldValue: "ab", newValue: "a" },
        previousRow(1000),
        "user-1",
        now,
      ),
    ).toEqual({ deleteRowId: "previous-row", change: null });
    // Empty values are equal under the empty-value rule.
    expect(
      mergeBookmarkHistoryChange(
        { field: "note", oldValue: "draft", newValue: null },
        { ...previousRow(1000), oldValue: "" },
        "user-1",
        now,
      ),
    ).toEqual({ deleteRowId: "previous-row", change: null });
  });
});
