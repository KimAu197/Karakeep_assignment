# Plan: Item Change History

## Goal

Bookmark change history, version 1, as defined in `.orchestra/context.md` (decisions 1-9 and the CONTRACT).

## Acceptance criteria

| # | Criterion | Representative case | Evidence |
|---|---|---|---|
| AC1 | An edit records each changed field with old value, new value, time, user | Title "Original" -> "Edited" | trpc test passes; `getBookmarkHistory` on the running app returns the row |
| AC2 | No-op saves record nothing | Save the same title again; save with no fields; `""` over `null` | trpc tests + pure diff unit tests pass |
| AC3 | History is retrievable through tRPC, newest first, with access control | Owner reads; collaborator on a shared list reads; stranger gets NOT_FOUND | trpc tests pass |
| AC4 | Private field history is not exposed | Collaborator does not receive `note` rows; owner does | trpc test in `sharedLists.test.ts` passes |
| AC5 | A failed update leaves no history | `url` sent for a text bookmark -> BAD_REQUEST and zero rows | trpc test passes |
| AC6 | The detail sidebar shows a readable history section, newest first, refreshed after an edit | Edit a title in the UI, the entry appears without reload | Web typecheck/lint pass; the user confirms in the browser (agents have no browser) |
| AC7 | Nothing else broke | Existing suites | `vitest run` for trpc, shared, api, web, shared-server shows no new failures vs `.orchestra/results/baseline-tests.txt`; `pnpm typecheck`, `pnpm lint`, `pnpm format` pass |

## Tasks

### T1 Backend: table, capture, query, tests — status: planned
- Role: solver. Review: yes (R1). Verify: yes (V1).
- Depends on: nothing.
- Owns exclusively:
  - `packages/db/schema.ts`, `packages/db/drizzle/**` (new migration + meta only)
  - `packages/shared/types/bookmarkHistory.ts` (new)
  - `packages/trpc/lib/bookmarkHistory.ts` and `packages/trpc/lib/bookmarkHistory.test.ts` (new: registry with private flags, pure diff function, unit tests)
  - `packages/trpc/routers/bookmarks.ts`
  - `packages/trpc/routers/bookmarks.test.ts`, `packages/trpc/routers/sharedLists.test.ts` (add tests; do not change existing ones)
- Do:
  1. Add the `bookmarkHistory` table per the CONTRACT; generate the migration with `pnpm db:generate --name bookmark_history`; apply it to the local DB with `pnpm db:migrate`.
  2. Add the shared types file per the CONTRACT.
  3. Add the registry + pure diff function + unit tests.
  4. In `updateBookmark`: inside the existing transaction read the stored values, diff against what is about to be written, insert history rows. Keep every existing behaviour.
  5. Add `getBookmarkHistory` per the CONTRACT.
  6. Tests (edge cases): real change (each tracked field, link and text bookmark); multi-field save shares one `changeId`; no-op with same value; request with no tracked fields; `null`/`""` equivalence; whitespace-only difference in `url` (trimmed); untracked-field-only save (e.g. `archived`) records nothing; failed update (wrong type) records nothing; newest-first order across several saves; deleting the bookmark removes its history; owner sees `note` rows; collaborator sees `title` rows but not `note` rows; stranger gets NOT_FOUND; a non-owner cannot create history (update is rejected).
- Done when: the new tests pass; the full trpc suite shows no new failures vs baseline; `pnpm typecheck --filter=@karakeep/trpc --filter=@karakeep/shared --filter=@karakeep/db` and `pnpm lint` and `pnpm format` pass for the files it touched; migration applied to `data/db.db`.

### T2 Frontend: history section in the detail sidebar — status: planned
- Role: solver. Review: yes (R1). Verify: yes (V1).
- Depends on: the CONTRACT only (T1 runs at the same time; the procedure and types file may not exist yet when T2 starts).
- Owns exclusively:
  - `apps/web/components/dashboard/preview/HistoryBox.tsx` (new)
  - `apps/web/components/dashboard/preview/BookmarkPreview.tsx` (only to mount the box in `detailsSection`)
  - `packages/shared-react/hooks/bookmarks.ts` (only the `useUpdateBookmark` invalidation)
  - `apps/web/lib/i18n/locales/en/translation.json` (new keys only)
- Do: a `HistoryBox` modelled on `HighlightsBox.tsx` that queries `bookmarks.getBookmarkHistory`, groups rows by `changeId`, shows newest first with field label, old -> new (long values truncated, empty shown as an explicit "empty" label), and a relative time; loading, empty and error states; mount it in the sidebar for owners and collaborators alike (the server already filters private rows); invalidate the history query in `useUpdateBookmark` on success.
- Done when: `pnpm typecheck --filter=@karakeep/web --filter=@karakeep/shared-react` passes once T1's procedure exists (if it does not exist yet at the end, say so; the only acceptable errors are the missing procedure/types file); `pnpm lint` and `pnpm format` pass for its files; existing web tests still pass.

### R1 Review of T1 + T2 — status: planned
- Role: reviewer (read-only, new agent). After T1 and T2.

### V1 Verification of T1 + T2 — status: planned
- Role: verifier (runs things, new agent, fixes nothing). After T1 and T2. Covers AC1-AC5 and AC7 by running, plus AC1/AC3/AC4 against the running app through HTTP.

---

# Rework round 1 (after R1 review and V1 verification of commit f14014f)

Status of T1, T2: verified and committed (f14014f). R1: no blockers, three should-fix (S1-S3). V1: all checks pass. The user chose to fix S1, S2 and S3. Decisions 10-13 in context.md define the behaviour.

## Extra acceptance criteria

| # | Criterion | Representative case | Evidence |
|---|---|---|---|
| AC8 | Autosave bursts of `note` become one entry | Three note saves by the owner within 5 minutes -> one `note` row from the first old value to the last new value; a save after the window -> a second row; type-then-revert -> no row | trpc tests with a controlled clock; HTTP check on the running app |
| AC9 | Non-autosaved fields are never merged | Two title edits seconds apart -> two rows | trpc test; HTTP check |
| AC10 | Re-saving an existing link records title/note changes | `createBookmark` with the same URL and a different title -> one `title` row; same title -> no row; no title supplied -> no row | trpc tests; HTTP check |
| AC11 | Saving the Edit dialog unchanged sends no `title` | Open Edit on a link with no stored title, press Save -> request has no `title` | unit test if the payload logic is testable without a browser, else code reading + user check in browser |
| AC12 | Nothing else broke | same as AC7 | same suites vs baseline; trpc must stay at 0 failures |

## Tasks

### T3 Backend rework: merge autosaves, record re-save, immediate transaction — status: planned
- Role: solver (the T1 solver, continued). Review: yes (R2). Verify: yes (V2).
- Owns exclusively: `packages/trpc/lib/bookmarkHistory.ts`, `packages/trpc/lib/__tests__/bookmarkHistory.test.ts`, `packages/trpc/routers/bookmarks.ts`, `packages/trpc/routers/bookmarks.test.ts`, `packages/trpc/routers/sharedLists.test.ts`. No schema or migration change.
- Do: decisions 10, 11, 12. Also fix review M7: the new no-op test's comment claims a "no fields" save bumps `modifiedAt`; make the test assert what really happens and say so accurately.
- Tests to add: AC8 (merge within window; no merge after window; revert deletes the row; merge only with the same user's row; merge only the latest row of that field; a multi-field earlier save keeps its `title` row when its `note` row is merged away; privacy of merged rows unchanged), AC9, AC10 (title changed / same / not supplied; note changed; exempt source records nothing; atomicity), and that existing re-save behaviour is unchanged.
- Done when: new tests pass; full trpc suite 0 failures (run twice); typecheck (trpc, shared, db), lint, format pass.

### T4 Frontend rework: Edit dialog sends title only when changed — status: planned
- Role: solver (the T2 solver, continued). Review: yes (R2). Verify: yes (V2).
- Owns exclusively: `apps/web/components/dashboard/bookmarks/EditBookmarkDialog.tsx` (and, only if it adds one, a test file next to it or a small pure helper file in the same folder).
- Do: decision 13.
- Done when: typecheck (web), lint, format pass; web tests show no new failures vs baseline.

---

# Rework round 3 (after R2/V2/V3; commit 722fb53 = T3 + T4, reviewed, verified, browser-checked)

Status: T3, T4 verified and committed (722fb53). V3 (real Chrome via Playwright): all 11 steps pass. The user asked to fix two limits that had been documented: decisions 14 and 15 in context.md.

| # | Criterion | Representative case | Evidence |
|---|---|---|---|
| AC13 | Edit dialog does not overwrite a note it did not change | Note field untouched in the dialog -> request has no `note` key; changed or cleared -> sent | unit tests; real-browser check of the sidebar-note-then-Edit sequence |
| AC14 | A bookmark deleted before the write causes no history error | Re-save / update where the row is gone at transaction time -> no foreign-key failure, same outcome as before the feature | trpc test that removes the row between the check and the transaction |
| AC15 | Nothing else broke | as AC7 | trpc 602 passing before this round must stay at 0 failures; web: only the 2 baseline failures |

### T5 Backend: skip history when the bookmark is gone — status: planned
- Role: solver (T1/T3 solver, continued). Review: orchestrator reads the diff (small, low risk). Verify: V4.
- Owns: `packages/trpc/routers/bookmarks.ts`, `packages/trpc/routers/bookmarks.test.ts`.
- Do: decision 15.

### T6 Frontend: Edit dialog sends note only when changed — status: planned
- Role: solver (T2/T4 solver, continued). Review: orchestrator reads the diff. Verify: V4 (unit tests + real browser).
- Owns: `apps/web/components/dashboard/bookmarks/EditBookmarkDialog.tsx`, `editBookmarkPayload.ts`, `editBookmarkPayload.test.ts`.
- Do: decision 14.
