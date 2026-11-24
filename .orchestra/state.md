# State

- DONE. Branch `super-planner/item-change-history` = 28ae675 (upstream main) + f14014f (T1+T2) + 722fb53 (T3+T4) + ddbcd34 (T5+T6). All reviewed/verified (R1, R2, V1-V4; V3 and V4 in real Chrome).
- Pushed to https://github.com/KimAu197/Karakeep_assignment (public): `main` = 28ae675, `super-planner/item-change-history` = ddbcd34. Remote name locally: `assignment`.
- Final counts: trpc 605/605; web 119 pass + 2 baseline failures (server/auth.test.ts, lib/date-format.test.ts); shared 170; api 11; shared-server 10; typecheck/lint/format pass.
- Not in git: `.orchestra/`, the interview PDF, `my-session.txt`, `.env` files (all excluded/ignored).
- Dev server: orchestrator's background task on :3000 (`pnpm web`); stops with the session.
- Throwaway users in data/db.db: smoketest-1795545704@, v1-hist-a-1795547065@, v1-hist-b-1795547065@, v2-verifier-1795547958@, browser-1795547953505@, browser2-1795548845197@ (all example.com).
- Known limits (not built): background worker writes and tags not captured; 100-row cap, no pagination; collaborators see history from before sharing; no userId index; values clamped to 3 lines; long note sessions merge into one entry; history does not show who made a change; deprecated updateBookmarkText not captured.
