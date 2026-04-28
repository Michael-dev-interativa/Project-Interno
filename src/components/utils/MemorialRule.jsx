// **UTILITÁRIO**: Regra de Memorial - Centralizar lógica
export const MEMORIAL_SUBDISCIPLINAS = [
  'Memorial',
  'Memorial - Bo', 
  'Memorial - E',
  'Memorial - HI',
  'Memorial - HV',
  'Memorial - IN',
  'Memorial - SI',
  'Memorial - SP',
  // **COMPATIBILIDADE**: Manter também os formatos com hífen para casos antigos
  'Memorial-Bo', 
  'Memorial-E',
  'Memorial-HI',
  'Memorial-HV',
  'Memorial-IN',
  'Memorial-SI',
  'Memorial-SP'
];

export const isMemorialActivity = (atividade) => {
  const isConcepcao = atividade.disciplina === 'Concepção';
  const isMemorialSub = MEMORIAL_SUBDISCIPLINAS.includes(atividade.subdisciplina);
  
  if (isConcepcao && isMemorialSub) {
  }
  
  return isConcepcao && isMemorialSub;
};

export const getCorrectEtapa = (atividade) => {
  if (isMemorialActivity(atividade)) {
    return 'Estudo Preliminar';
  }
  return atividade.etapa;
};

export const applyMemorialRule = (analytic, atividade) => {
  const etapaCorreta = getCorrectEtapa(atividade);
  return {
    ...analytic,
    etapa: etapaCorreta
  };
};