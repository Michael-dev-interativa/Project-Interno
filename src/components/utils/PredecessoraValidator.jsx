

// Sequência obrigatória das etapas - FONTE DA VERDADE
export const ETAPAS_ORDER = [
  'Concepção', 
  'Estudo Preliminar', 
  'Ante-Projeto', // Corrigido para usar hífen, como nos dados
  'Projeto Básico', 
  'Projeto Executivo', 
  'Liberado para Obra' // Corrigido para incluir "para", como nos dados
];

// Verifica se uma atividade pode ser iniciada baseado nas predecessoras
export const canStartActivity = (atividade, allPlanejamentos, documento) => {
  if (!atividade || !atividade.etapa) return { canStart: true, reason: '' };

  const etapaIndex = ETAPAS_ORDER.indexOf(atividade.etapa);
  
  // Se é a primeira etapa (Concepção), sempre pode iniciar
  if (etapaIndex <= 0) {
    return { canStart: true, reason: '' };
  }

  // Verificar se todas as etapas anteriores estão concluídas para este documento
  for (let i = 0; i < etapaIndex; i++) {
    const etapaPredecessora = ETAPAS_ORDER[i];
    
    // Buscar planejamentos da etapa predecessora para o mesmo documento
    const planejamentosPredecessores = allPlanejamentos.filter(plano => {
      // Se tem documento, verificar pelo documento
      if (documento && plano.documento_id === documento.id) {
        return plano.atividade?.etapa === etapaPredecessora;
      }
      // Se não tem documento (atividades de documentação), verificar pelo empreendimento
      if (!documento && !plano.documento_id) {
        return plano.atividade?.etapa === etapaPredecessora && 
               plano.empreendimento_id === atividade.empreendimento_id;
      }
      return false;
    });

    // Se não há planejamentos da etapa predecessora, não pode iniciar
    if (planejamentosPredecessores.length === 0) {
      return {
        canStart: false,
        reason: `Aguardando planejamento da etapa: ${etapaPredecessora}`
      };
    }

    // Verificar se todos os planejamentos da etapa predecessora estão concluídos
    const todosConcluidos = planejamentosPredecessores.every(plano => 
      plano.status === 'concluido'
    );

    if (!todosConcluidos) {
      const pendentes = planejamentosPredecessores.filter(plano => plano.status !== 'concluido');
      return {
        canStart: false,
        reason: `Aguardando conclusão da etapa: ${etapaPredecessora} (${pendentes.length} atividade(s) pendente(s))`
      };
    }
  }

  return { canStart: true, reason: '' };
};

// Obter status da etapa (para exibição)
export const getEtapaStatus = (etapa, allPlanejamentos, documento, empreendimentoId) => {
  const planejamentosEtapa = allPlanejamentos.filter(plano => {
    if (documento && plano.documento_id === documento.id) {
      return plano.atividade?.etapa === etapa;
    }
    if (!documento && !plano.documento_id) {
      return plano.atividade?.etapa === etapa && plano.empreendimento_id === empreendimentoId;
    }
    return false;
  });

  if (planejamentosEtapa.length === 0) return 'nao_planejado';
  
  const todosConcluidos = planejamentosEtapa.every(plano => plano.status === 'concluido');
  const algumEmAndamento = planejamentosEtapa.some(plano => plano.status === 'em_andamento');
  
  if (todosConcluidos) return 'concluido';
  if (algumEmAndamento) return 'em_andamento';
  return 'planejado';
};
