# Supabase migrations

This folder holds SQL migrations applied to the Supabase (remote) database. It is **not** the authoritative record of the POS schema — it only contains migrations that have been written to share changes across environments.

## Where the schema actually lives

| Artifact | Role |
|---|---|
| `apps/store-app/src/lib/dbSchema.ts` | Canonical local (IndexedDB / Dexie) schema + version upgrades. Bump `CURRENT_DB_VERSION` here when adding a new table/index. |
| `apps/store-app/src/types/database.ts` | Supabase-generated row types used by sync. Regenerate from Supabase when the remote schema changes. |
| `apps/store-app/src/services/syncService.ts` (+ `syncConfig.ts`) | Canonical list of synced tables + their dependency order. |
| Supabase dashboard | The remote schema is managed directly in the Supabase console today. The SQL files in this folder capture **specific** changes that need to land in every environment — not a full history. |

## What belongs in this folder

Commit a `.sql` file here when:

1. You make a schema change in the Supabase dashboard that must also be applied to other environments (staging, other tenants), **or**
2. You add a feature that depends on a new RPC, RLS policy, trigger, or table.

Include a short header comment: what the migration does, why, and the approximate date. Name files with a short descriptive suffix (`branch_event_log.sql`, `add_expires_at_to_public_access_tokens.sql`) — alphabetical order is fine for now given the small volume.

## What does **not** belong here

- A reconstruction of the full database schema from scratch — the dashboard + generated types are the source of truth.
- Local-only Dexie changes — those go in `dbSchema.ts`.
- One-off data fixes — use a script or admin console, not a migration file.

## Applying migrations

These files are applied manually via the Supabase SQL editor (or `supabase db push` if you have a local Supabase project configured). There is no automated migration runner in CI today.

If the migration set grows beyond a handful of files, adopt either the Supabase CLI's migration tooling or an external tool like Flyway — at that point switch to numbered filenames (`001_branch_event_log.sql`, …) and stop using this README as the convention.
