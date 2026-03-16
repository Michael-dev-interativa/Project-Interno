-- Migration: Add missing planning columns to documentos
-- Run with: psql -h <host> -U <user> -d <database> -f 001_add_documentos_fields.sql

ALTER TABLE documentos ADD COLUMN IF NOT EXISTS executor_principal VARCHAR(255);
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS multiplos_executores BOOLEAN DEFAULT FALSE;
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS inicio_planejado TIMESTAMPTZ;
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS termino_planejado TIMESTAMPTZ;

-- Optional: set defaults or backfill existing rows if needed
-- UPDATE documentos SET multiplos_executores = FALSE WHERE multiplos_executores IS NULL;

-- End of migration
