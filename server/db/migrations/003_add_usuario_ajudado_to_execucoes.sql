-- Migration 003: Adiciona coluna usuario_ajudado em execucoes
ALTER TABLE execucoes ADD COLUMN IF NOT EXISTS usuario_ajudado TEXT;
