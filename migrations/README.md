# OPS Migrations

Manual SQL migrations for the OPS MySQL database (`vrindavan_ops`).

## How to run

Migrations are sequential and idempotent where possible. Run them in order:

```bash
mysql -u root -proot vrindavan_ops < migrations/001_create_inward_po_tables.sql
mysql -u root -proot vrindavan_ops < migrations/002_add_grn_received_status.sql
```

## Convention

- File naming: `NNN_description.sql` (e.g. `003_add_something.sql`)
- Each migration should be safe to re-run (use `IF NOT EXISTS`, `IF EXISTS` where possible)
- Include a comment header with date and description
- ALTER TABLE statements are not idempotent — check before re-running
