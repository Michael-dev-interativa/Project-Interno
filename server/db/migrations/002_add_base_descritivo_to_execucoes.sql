-- Migration 002: Adiciona coluna base_descritivo em execucoes
-- base_descritivo armazena o nome base da atividade rápida, separado do descritivo formatado.
ALTER TABLE execucoes ADD COLUMN IF NOT EXISTS base_descritivo TEXT;
