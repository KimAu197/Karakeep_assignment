import { describe, expect, test } from "vitest";

import { BOOKMARK_HISTORY_FIELDS } from "@karakeep/shared/types/bookmarkHistory";

import {
  BOOKMARK_HISTORY_FIELD_REGISTRY,
  diffBookmarkHistory,
  PRIVATE_BOOKMARK_HISTORY_FIELDS,
} from "../bookmarkHistory";

describe("bookmark history registry", () => {
  test("covers every tracked field and marks only note as private", () => {
    expect(Object.keys(BOOKMARK_HISTORY_FIELD_REGISTRY).sort()).toEqual(
      [...BOOKMARK_HISTORY_FIELDS].sort(),
    );
    expect(PRIVATE_BOOKMARK_HISTORY_FIELDS).toEqual(["note"]);
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
