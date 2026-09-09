# reference/

Not part of the migration path. Nothing in this folder is executed.

`_ARCHIVE_legacy_schema.sql.txt` is the original hand-written schema. It is kept
only as a historical record and **must not be run** — it disagrees with the
migrations in `../migrations/` on several points (it targets `profiles.id` for
foreign keys where the migrations target `auth.users.id`, and it is missing the
risk-scoring columns added in `001_init.sql`).

The single source of truth for the database is `../migrations/`, applied in
filename order. To rebuild from scratch:

    supabase db reset
