// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";

import { withTitleAndNoteOnlyIfChanged } from "./editBookmarkPayload";

const values = {
  bookmarkId: "b1",
  title: "Crawled title",
  note: "A",
  summary: "a summary",
};
const unchanged = { title: false, note: false };

describe("withTitleAndNoteOnlyIfChanged", () => {
  it("leaves out an untouched title and note, and keeps the other fields", () => {
    const payload = withTitleAndNoteOnlyIfChanged(values, unchanged);
    expect(payload).not.toHaveProperty("title");
    expect(payload).not.toHaveProperty("note");
    expect(payload).toEqual({ bookmarkId: "b1", summary: "a summary" });
  });

  it("sends a changed title", () => {
    expect(
      withTitleAndNoteOnlyIfChanged(
        { ...values, title: "Renamed" },
        { ...unchanged, title: true },
      ),
    ).toEqual({ bookmarkId: "b1", summary: "a summary", title: "Renamed" });
  });

  it("sends a cleared title as it does today", () => {
    const titleChanged = { ...unchanged, title: true };
    expect(
      withTitleAndNoteOnlyIfChanged({ ...values, title: "" }, titleChanged),
    ).toMatchObject({ title: "" });
    expect(
      withTitleAndNoteOnlyIfChanged(
        { ...values, title: undefined },
        titleChanged,
      ),
    ).toMatchObject({ title: null });
  });

  it("sends a changed note", () => {
    expect(
      withTitleAndNoteOnlyIfChanged(
        { ...values, note: "B" },
        { ...unchanged, note: true },
      ),
    ).toEqual({ bookmarkId: "b1", summary: "a summary", note: "B" });
  });

  it("sends a cleared note as the empty string, which clears it today", () => {
    expect(
      withTitleAndNoteOnlyIfChanged(
        { ...values, note: "" },
        { ...unchanged, note: true },
      ),
    ).toEqual({ bookmarkId: "b1", summary: "a summary", note: "" });
  });

  it("treats the title and the note independently", () => {
    const titleOnly = withTitleAndNoteOnlyIfChanged(
      { ...values, title: "Renamed" },
      { title: true, note: false },
    );
    expect(titleOnly).toMatchObject({ title: "Renamed" });
    expect(titleOnly).not.toHaveProperty("note");

    const noteOnly = withTitleAndNoteOnlyIfChanged(
      { ...values, note: "B" },
      { title: false, note: true },
    );
    expect(noteOnly).toMatchObject({ note: "B" });
    expect(noteOnly).not.toHaveProperty("title");
  });
});

// The dialog asks react-hook-form whether a field is dirty. These pin down
// that this is tracked for a field edited the way the dialog's inputs edit it
// (the registered onChange), and that it is relative to the last reset.
describe.each([
  { field: "title" as const, initial: "Crawled title" },
  { field: "note" as const, initial: "A" },
])("react-hook-form $field dirtiness", ({ field, initial }) => {
  function setup(defaults: { title?: string | null; note?: string } = {}) {
    const form = renderHook(() =>
      useForm<{ title?: string | null; note?: string }>({
        defaultValues: { title: "Crawled title", note: "A", ...defaults },
      }),
    ).result;
    const type = (name: "title" | "note", value: string) =>
      act(() =>
        form.current
          .register(name)
          .onChange({ target: { name, value }, type: "change" }),
      );
    const isDirty = (name: "title" | "note" = field) =>
      form.current.getFieldState(name).isDirty;
    return { form, type, isDirty };
  }

  it("is not dirty when untouched", () => {
    const { isDirty } = setup();
    expect(isDirty()).toBe(false);
  });

  it("is dirty after a change, including clearing it", async () => {
    const { type, isDirty } = setup();
    await type(field, "Changed");
    expect(isDirty()).toBe(true);
    await type(field, "");
    expect(isDirty()).toBe(true);
  });

  it("is not dirty after changing it back", async () => {
    const { type, isDirty } = setup();
    await type(field, "x");
    expect(isDirty()).toBe(true);
    await type(field, initial);
    expect(isDirty()).toBe(false);
  });

  it("is measured against the values of the last reset", async () => {
    const { form, type, isDirty } = setup();
    await type(field, "Changed");
    act(() => form.current.reset({ title: "Changed", note: "Changed" }));
    expect(isDirty()).toBe(false);
    await type(field, "Again");
    expect(isDirty()).toBe(true);
  });

  it("is not made dirty by editing the other field", async () => {
    const { type, isDirty } = setup();
    await type(field === "title" ? "note" : "title", "Changed");
    expect(isDirty(field === "title" ? "note" : "title")).toBe(true);
    expect(isDirty()).toBe(false);
  });

  it("is not dirty when untouched and no value is stored", () => {
    // The dialog's note default is undefined when the stored note is null.
    const { isDirty } = setup({ [field]: undefined });
    expect(isDirty()).toBe(false);
  });
});
