# Shared context: Item Change History (Karakeep)

Read this fully before working. It is the only context agents share.

## Goal

Add a change history for bookmarks to Karakeep (TypeScript monorepo: Next.js web app, tRPC backend, Drizzle ORM on SQLite). When the owner edits a bookmark, each changed field is recorded (field name, old value, new value, time, who). The history is readable through a tRPC query and shown in the bookmark detail sidebar, newest first.

This is an interview exercise. A small, working, well-explained feature is the target. Reuse the repo's patterns. Do NOT disable authentication, authorization, type checking, lint or tests. Do NOT hand-edit the database to make the feature appear to work.

## Repo facts (verified by the orchestrator)

- Repo root: `/Users/kenzieluo/Desktop/code/karakeep`. Branch: `super-planner/item-change-history`. Solvers do NOT commit; only the orchestrator commits.
- Package manager: pnpm (pinned 11.28.9, auto-selected). Node on this machine is v25 (repo pins 24; it works).
- Repo conventions are in `CLAUDE.md` / `AGENTS.md` at the root. Business logic lives in `packages/trpc`; schema and migrations in `packages/db`; UI uses shadcn/ui + Tailwind; UI strings go through i18n (`apps/web/lib/i18n/locales/en/translation.json`, fallback language is `en`, so only the English file needs new keys).
- Commands: `pnpm typecheck`, `pnpm lint`, `pnpm format` (check) / `pnpm format:fix`, scoped with turbo e.g. `pnpm typecheck --filter=@karakeep/trpc`. Tests: `pnpm --filter @karakeep/trpc exec vitest run [file]` (plain `vitest` would start watch mode; always use `vitest run`).
- New migration: edit `packages/db/schema.ts`, then `pnpm db:generate --name <desc>` (creates `packages/db/drizzle/0098_<desc>.sql` plus meta). Apply to the local dev DB with `pnpm db:migrate`. Tests use an in-memory DB that applies all migrations automatically (`packages/trpc/testUtils.ts`).
- A dev server is ALREADY RUNNING at http://localhost:3000 (`pnpm web`, Next dev with hot reload), owned by the orchestrator. Do not start another one, do not kill it, do not use port 3000. Local dev DB: `data/db.db`. Background workers are not running (not needed).
- Baseline test results on the untouched code are in `.orchestra/results/baseline-tests.txt` (may still be filling in). A failure that also appears there is pre-existing.

## The existing update path

- All user edits of a bookmark go through the tRPC mutation `updateBookmark` in `packages/trpc/routers/bookmarks.ts` (~lines 581-770). The REST endpoint `PATCH /api/v1/bookmarks/:id` (`packages/api/routes/bookmarks.ts`) calls the same mutation. The deprecated `updateBookmarkText` mutation (same file) has no callers in the apps; it is OUT of scope.
- `updateBookmark` is guarded by `ensureBookmarkOwnership` (owner only). It runs one synchronous `ctx.db.transaction((tx) => {...})` that builds `linkUpdateData` (-> `bookmarkLinks`), a `text` write (-> `bookmarkTexts`, only when `input.text` is truthy), an `assetContent` write (-> `bookmarkAssets`), and `commonUpdateData` (-> `bookmarks`, always sets `modifiedAt`). It never reads the stored row, so it cannot tell a real change from a no-op today. It throws `BAD_REQUEST` (rolling back) when link/text/asset fields are sent for the wrong bookmark type. Note the quirks: `url` is only written when truthy and is trimmed; `text` is only written when truthy.
- Input schema: `zUpdateBookmarksRequestSchema` in `packages/shared/types/bookmarks.ts` (~line 312).
- Read permission: `ensureBookmarkAccess` middleware (same router file, ~line 114) lets in the owner or anyone who can view a shared list containing the bookmark; everyone else gets `NOT_FOUND`. `getBookmark` (~line 1015) is the model for a read procedure.
- Private fields: `Bookmark.asZBookmark()` in `packages/trpc/models/bookmarks.ts` (~line 841) blanks `note`, `archived`, `favourited` for non-owners. `note` is the owner's personal annotation on any bookmark. It is different from a "Note item", which is a bookmark of type `text` whose content is in `bookmarkTexts.text` and is visible to collaborators.
- Schema: `packages/db/schema.ts`: `bookmarks` (~236), `bookmarkLinks` (~312), `highlights` (~419, a good example of a per-bookmark child table with indexes and relations), `bookmarkTexts` (~486). `createdAtField()` has SECOND precision (`mode: "timestamp"`); `createdAtMsField()` has millisecond precision.
- Client hook: `useUpdateBookmark` in `packages/shared-react/hooks/bookmarks.ts` (~line 103) invalidates cached queries on success.
- Detail sidebar: `apps/web/components/dashboard/preview/BookmarkPreview.tsx`, the `detailsSection` block (~lines 502-537), which renders `NoteEditor`, `HighlightsBox`, `AttachmentBox`. `isOwner` is computed at ~line 449. `HighlightsBox.tsx` in the same folder is the model for a sidebar box that loads per-bookmark data with `useQuery` + `useTRPC`.
- Test helpers: `packages/trpc/testUtils.ts` (`defaultBeforeEach`, `getApiCaller`, `CustomTestContext`). `packages/trpc/routers/bookmarks.test.ts` has existing `updateBookmark` tests. `packages/trpc/routers/sharedLists.test.ts` sets up an owner plus a collaborator on a shared list (see "Bookmark Access in Shared Lists", ~line 617).

## Decisions (made by the user or delegated to the orchestrator)

1. **Tracked fields (version 1):** `title`, `url`, `description`, `text` (content of a Note item), `note` (owner's personal note, PRIVATE). Not tracked: `archived`, `favourited`, `summary`, `author`, `publisher`, dates, `assetContent`, tags.
2. **Single field registry.** One exported list defines the tracked fields and which are private. The diff AND the read-side privacy filter both use it. Adding a field later means adding one registry line.
3. **Pure diff function.** A function with no DB access that takes the stored values and the values about to be written and returns `{ field, oldValue, newValue }[]`. Unit-tested on its own.
4. **No-op rule.** A field produces a history row only if the value that will actually be written differs from the stored value. `null`, `undefined`-stored and `""` count as the same "empty" value. A field not present in the request never produces a row. The diff must be computed from the values the mutation really writes (e.g. the trimmed `url`; a falsy `text` is not written, so it produces no row).
5. **Existing write behaviour is unchanged.** A no-op save still does what it does today (including bumping `modifiedAt`). We only add the read-before-write and the history inserts. Do not refactor `updateBookmark` beyond what capture needs.
6. **Atomicity and concurrency.** Stored values are read INSIDE the existing transaction, and history rows are inserted INSIDE the same transaction. If the update throws (e.g. wrong bookmark type), no history row survives.
7. **One row per changed field.** All rows from one save share one `changeId` and one `createdAt`.
8. **Read access.** The history query uses `ensureBookmarkAccess`. For a caller who is not the bookmark owner, rows of private fields (`note`) are removed on the server. Strangers get `NOT_FOUND` like `getBookmark`.
9. **Scope limits (documented, not built):** background writes by workers (crawler, summariser, rule engine) are not captured; tags are not captured; no pagination (newest 100 rows); no retention policy; no REST endpoint or OpenAPI change; no mobile UI.

## CONTRACT (fixed; solvers build to it and report if it must change, they do not change it alone)

### Table `bookmarkHistory` (in `packages/db/schema.ts`)

| column | type | notes |
|---|---|---|
| `id` | text PK | `createId()` default, like other tables |
| `bookmarkId` | text NOT NULL | FK -> `bookmarks.id`, `onDelete: "cascade"` |
| `userId` | text NOT NULL | who made the change; FK -> `users.id`, `onDelete: "cascade"` |
| `changeId` | text NOT NULL | same value for all rows written by one save |
| `field` | text NOT NULL | one of the tracked field names |
| `oldValue` | text NULL | |
| `newValue` | text NULL | |
| `createdAt` | integer NOT NULL | millisecond precision (`timestamp_ms`) |

Index on (`bookmarkId`, `createdAt`). Add Drizzle `relations` if the neighbouring tables do so.

### Shared types: new file `packages/shared/types/bookmarkHistory.ts`

```ts
export const BOOKMARK_HISTORY_FIELDS = ["title", "url", "description", "text", "note"] as const;
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
```

### tRPC procedure (in `packages/trpc/routers/bookmarks.ts`, on `bookmarksAppRouter`)

`bookmarks.getBookmarkHistory`
- input: `{ bookmarkId: string }`
- output: `zGetBookmarkHistoryResponseSchema`
- a `query`, guarded by `ensureBookmarkAccess`
- returns at most the newest 100 rows, ordered newest first; the order must be deterministic even when two saves share the same millisecond (rows of a later save always come before rows of an earlier save)
- for non-owners, rows whose field is private are not returned

## How to exercise the running app without a browser

```bash
B=http://localhost:3000/api
# sign up a throwaway user (use a unique email)
curl -s -X POST $B/auth/sign-up/email -H 'content-type: application/json' -H 'Origin: http://localhost:3000' \
  -d '{"name":"T","email":"t-<unique>@example.com","password":"SmokeTest-pass-1234"}'
# exchange for an API key (rate limit: 10 per 15 minutes per client, use sparingly)
curl -s -X POST $B/trpc/apiKeys.exchange -H 'content-type: application/json' \
  -d '{"json":{"keyName":"t","email":"t-<unique>@example.com","password":"SmokeTest-pass-1234"}}'   # -> result.data.json.key
# REST with the key
curl -s -X POST  $B/v1/bookmarks      -H "Authorization: Bearer $KEY" -H 'content-type: application/json' -d '{"type":"link","url":"https://example.com/a","title":"Original"}'
curl -s -X PATCH $B/v1/bookmarks/$ID  -H "Authorization: Bearer $KEY" -H 'content-type: application/json' -d '{"title":"Edited"}'
# tRPC query with the key (input is URL-encoded JSON {"json":{...}})
curl -s -G $B/trpc/bookmarks.getBookmarkHistory -H "Authorization: Bearer $KEY" --data-urlencode 'input={"json":{"bookmarkId":"'$ID'"}}'
```

Delete any bookmarks you create this way (`DELETE $B/v1/bookmarks/$ID`). Throwaway users may be left behind; list their emails in your report.

## Rework round 1: decisions added after review R1 (user chose to fix all three should-fix findings)

10. **Autosave bursts are merged (review S1).** The personal `note` autosaves 800 ms after typing stops (`apps/web/components/dashboard/preview/useNoteDraft.ts`), which produced one history row per pause. Rule: the registry gets a per-field flag for autosaved fields (`note` only in version 1). When a save changes such a field, and the bookmark's most recent history row FOR THAT FIELD was written by the same user less than `BOOKMARK_HISTORY_MERGE_WINDOW_MS` (5 minutes) before now, the two are merged: the old row is deleted and ONE new row is written with the old row's `oldValue`, the new `newValue`, and this save's `changeId` / `createdAt`. If after merging `oldValue` equals `newValue` under the empty-value rule (the user typed something and reverted it), the old row is deleted and no row is written. Fields without the flag (`title`, `url`, `description`, `text`) are never merged: two quick title edits stay two entries. Rows of other fields from the same earlier save are left untouched. All of this happens inside the same transaction as the write. The table and the tRPC contract do not change; no new migration.
11. **Re-save is recorded (review S3).** The re-save branch of `createBookmark` in `packages/trpc/routers/bookmarks.ts` (the `alreadyExists` path, ~lines 296-345) overwrites `title` and `note` of an existing link bookmark when the caller supplies them, and bypassed history. It must record history for `title` and `note` with the same diff function and the same rules (no row when the value does not really change; merge rule for `note`), and the stored-value read, the bookmark update and the history insert must be in ONE transaction. Prefer one shared helper used by both `updateBookmark` and this branch over two copies of the capture code. Everything else that branch does today stays the same (the `RESAVE_EXEMPT_SOURCES` early return, bumping `createdAt`, un-archiving, reindex, webhook, the returned shape).
12. **Update transaction starts as a write transaction (review M2).** `updateBookmark`'s transaction now begins with a SELECT; a deferred transaction that reads first and writes later can fail with a busy/snapshot error if another process (the workers) writes in between. Open it with `{ behavior: "immediate" }` (precedent: `packages/trpc/routers/bookmarks.ts` ~line 501, `packages/trpc/models/users.ts` ~line 139). Same for the new re-save transaction.
13. **Edit dialog sends the title only when it was changed (review S2).** `apps/web/components/dashboard/bookmarks/EditBookmarkDialog.tsx` pre-fills the title field with `getBookmarkTitle(bookmark)` (which falls back to the crawled title when the stored title is null) and always sends `title` on save, so pressing Save without edits stored the fallback title and recorded "Title: empty -> crawled title". The dialog must send `title` only when the user changed that field. Other fields of the dialog keep their current behaviour.

## Rework round 3: decisions added after review R2 (the user asked to fix these two documented limits)

14. **Edit dialog sends the note only when it was changed (review R2-M1).** `apps/web/components/dashboard/bookmarks/EditBookmarkDialog.tsx` always sends `note`, and it fills its fields only when it opens. The Edit button sits in the same preview as the sidebar note editor, which autosaves (`apps/web/components/dashboard/preview/useNoteDraft.ts`). Sequence: stored note is "A"; the user types "B" in the sidebar; clicks Edit while the dialog still gets "A"; changes only the title; saves. The dialog sends `note: "A"`, which overwrites "B" (a data-loss bug that predates the history feature), and the history merge rule then treats B -> A as a revert and removes the A -> B row, so nothing shows it happened. Rule: the dialog must send `note` only when the user changed the note field in the dialog, exactly like `title` (decision 13). A deliberately edited or cleared note in the dialog is still sent. Other fields keep their behaviour.
15. **A bookmark that vanished before the write is not an error (review R2-M2).** If the bookmark row no longer exists when the capture transaction reads the stored values (it was deleted between the earlier existence/ownership check and the transaction), history recording must be skipped, so the request behaves as it did before the history feature: the re-save branch of `createBookmark` stays a silent no-op (it used to update zero rows and carry on), and `updateBookmark` behaves as at commit 28ae675 (its own existing checks and the later refetch decide the outcome). It must not fail with a foreign-key error from the history insert. No other behaviour changes.
