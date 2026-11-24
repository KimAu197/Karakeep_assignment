// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";

import { withTitleOnlyIfChanged } from "./editBookmarkPayload";

const values = {
  bookmarkId: "b1",
  title: "Crawled title",
  note: "a note",
};

describe("withTitleOnlyIfChanged", () => {
  it("leaves out an untouched title", () => {
    const payload = withTitleOnlyIfChanged(values, false);
    expect(payload).not.toHaveProperty("title");
    expect(payload).toEqual({ bookmarkId: "b1", note: "a note" });
  });

  it("sends a changed title", () => {
    expect(
      withTitleOnlyIfChanged({ ...values, title: "Renamed" }, true),
    ).toEqual({ ...values, title: "Renamed" });
  });

  it("sends a cleared title as it does today", () => {
    expect(withTitleOnlyIfChanged({ ...values, title: "" }, true)).toEqual({
      ...values,
      title: "",
    });
    expect(
      withTitleOnlyIfChanged({ ...values, title: undefined }, true),
    ).toEqual({ ...values, title: null });
  });
});

// The dialog asks react-hook-form whether the title is dirty. These pin down
// that this is tracked for a field edited the way the dialog's input edits it
// (the registered onChange), and that it is relative to the last reset.
describe("react-hook-form title dirtiness", () => {
  function setup() {
    const form = renderHook(() =>
      useForm<{ title?: string | null }>({
        defaultValues: { title: "Crawled title" },
      }),
    ).result;
    const type = (value: string) =>
      act(() =>
        form.current
          .register("title")
          .onChange({ target: { name: "title", value }, type: "change" }),
      );
    const isDirty = () => form.current.getFieldState("title").isDirty;
    return { form, type, isDirty };
  }

  it("is not dirty when untouched", () => {
    const { isDirty } = setup();
    expect(isDirty()).toBe(false);
  });

  it("is dirty after a change, including clearing it", async () => {
    const { type, isDirty } = setup();
    await type("Renamed");
    expect(isDirty()).toBe(true);
    await type("");
    expect(isDirty()).toBe(true);
  });

  it("is not dirty after changing it back", async () => {
    const { type, isDirty } = setup();
    await type("x");
    expect(isDirty()).toBe(true);
    await type("Crawled title");
    expect(isDirty()).toBe(false);
  });

  it("is measured against the values of the last reset", async () => {
    const { form, type, isDirty } = setup();
    await type("Renamed");
    act(() => form.current.reset({ title: "Renamed" }));
    expect(isDirty()).toBe(false);
    await type("Again");
    expect(isDirty()).toBe(true);
  });
});
