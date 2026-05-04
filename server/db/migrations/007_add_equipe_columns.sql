-- Migration 007: Add cor/descricao to equipes, add equipe_id to users

ALTER TABLE equipes
  ADD COLUMN IF NOT EXISTS cor VARCHAR(50) DEFAULT '#3B82F6',
  ADD COLUMN IF NOT EXISTS descricao TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS equipe_id INTEGER REFERENCES equipes(id) ON DELETE SET NULL;
