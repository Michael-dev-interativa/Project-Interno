-- Performance indexes for the most frequently filtered columns
-- Every tab in EmpreendimentoPage filters by empreendimento_id — without indexes
-- PostgreSQL does a sequential scan of the entire table on each request.

CREATE INDEX CONCURRENTLY IF NOT EXISTS documentos_empreendimento_idx
  ON documentos(empreendimento_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atividades_empreendimento_idx
  ON atividades(empreendimento_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS planejamento_atividades_empreendimento_idx
  ON planejamento_atividades(empreendimento_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS planejamento_atividades_executor_id_idx
  ON planejamento_atividades(executor_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS execucoes_empreendimento_idx
  ON execucoes(empreendimento_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS execucoes_planejamento_atividade_id_idx
  ON execucoes(planejamento_atividade_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS execucoes_usuario_id_idx
  ON execucoes(usuario_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS checklists_empreendimento_idx
  ON checklists(empreendimento_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atividades_empreendimento_emp_idx
  ON atividades_empreendimento(empreendimento_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS planejamento_documentos_documento_id_idx
  ON planejamento_documentos(documento_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS planejamento_documentos_planejamento_id_idx
  ON planejamento_documentos(planejamento_atividade_id);
