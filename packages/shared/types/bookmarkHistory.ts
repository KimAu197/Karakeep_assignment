import { z } from "zod";

export const BOOKMARK_HISTORY_FIELDS = [
  "title",
  "url",
  "description",
  "text",
  "note",
] as const;
export const zBookmarkHistoryFieldSchema = z.enum(BOOKMARK_HISTORY_FIELDS);
export type ZBookmarkHistoryField = z.infer<typeof zBookmarkHistoryFieldSchema>;

export const zBookmarkHistoryEntrySchema = z.object({
  id: z.string(),
  bookmarkId: z.string(),
  userId: z.string(),
  changeId: z.string(),
  field: zBookmarkHistoryFieldSchema,
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
  createdAt: z.date(),
});
export type ZBookmarkHistoryEntry = z.infer<typeof zBookmarkHistoryEntrySchema>;

export const zGetBookmarkHistoryResponseSchema = z.object({
  history: z.array(zBookmarkHistoryEntrySchema),
});
