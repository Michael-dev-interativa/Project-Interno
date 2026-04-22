-- Migration: Add unavailable dates and permitted viewers to users
-- Run with: psql -h <host> -U <user> -d <database> -f 004_add_user_unavailable_dates.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS datas_indisponiveis JSONB DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS usuarios_permitidos_visualizar JSONB DEFAULT '[]'::jsonb;

-- End of migration
