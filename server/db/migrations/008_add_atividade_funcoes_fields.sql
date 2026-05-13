-- Add full activity-template fields to atividade_funcoes
ALTER TABLE atividade_funcoes
  ADD COLUMN IF NOT EXISTS funcao         VARCHAR(255),
  ADD COLUMN IF NOT EXISTS frequencia     VARCHAR(50),
  ADD COLUMN IF NOT EXISTS tempo_estimado NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS dias_semana    INTEGER[],
  ADD COLUMN IF NOT EXISTS dia_mes        INTEGER,
  ADD COLUMN IF NOT EXISTS created_date   TIMESTAMPTZ DEFAULT now();
