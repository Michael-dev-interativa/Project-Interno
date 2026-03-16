-- Backfill para tabela documentos
-- Use com cuidado: esse script tenta popular colunas novas com heurísticas simples.
BEGIN;

-- 1) Copia `caminho` para `arquivo` quando este estiver vazio
UPDATE documentos SET arquivo = caminho WHERE arquivo IS NULL AND caminho IS NOT NULL;

-- 2) Tenta extrair um 'numero' a partir do primeiro token do titulo (se existir)
UPDATE documentos SET numero = trim(regexp_replace(titulo, '\\s.*$', ''))
WHERE numero IS NULL AND titulo IS NOT NULL;

-- 3) Se `descritivo` vazio e `titulo` for descritivo (comprido), copia o titulo
UPDATE documentos SET descritivo = titulo WHERE descritivo IS NULL AND titulo IS NOT NULL AND char_length(titulo) > 30;

-- 4) Se `disciplinas` vazio mas `disciplina_id` preenchido, popula com nome da disciplina
UPDATE documentos d
SET disciplinas = jsonb_build_array(disc.nome)
FROM disciplinas disc
WHERE d.disciplina_id = disc.id AND d.disciplinas IS NULL;

-- 5) Valores padrões simples para fator_dificuldade e tempos quando nulos
UPDATE documentos SET fator_dificuldade = 1.0 WHERE fator_dificuldade IS NULL;
UPDATE documentos SET tempo_total = COALESCE(tempo_total, 0) WHERE tempo_total IS NULL;
UPDATE documentos SET tempo_estudo_preliminar = COALESCE(tempo_estudo_preliminar, 0) WHERE tempo_estudo_preliminar IS NULL;
UPDATE documentos SET tempo_ante_projeto = COALESCE(tempo_ante_projeto, 0) WHERE tempo_ante_projeto IS NULL;
UPDATE documentos SET tempo_projeto_basico = COALESCE(tempo_projeto_basico, 0) WHERE tempo_projeto_basico IS NULL;
UPDATE documentos SET tempo_projeto_executivo = COALESCE(tempo_projeto_executivo, 0) WHERE tempo_projeto_executivo IS NULL;
UPDATE documentos SET tempo_liberado_obra = COALESCE(tempo_liberado_obra, 0) WHERE tempo_liberado_obra IS NULL;
UPDATE documentos SET tempo_concepcao = COALESCE(tempo_concepcao, 0) WHERE tempo_concepcao IS NULL;
UPDATE documentos SET tempo_planejamento = COALESCE(tempo_planejamento, 0) WHERE tempo_planejamento IS NULL;
UPDATE documentos SET tempo_execucao_total = COALESCE(tempo_execucao_total, 0) WHERE tempo_execucao_total IS NULL;

COMMIT;

-- Fim do backfill
