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
    console.log(`📋 Atividade Memorial identificada: "${atividade.atividade}" (Disciplina: ${atividade.disciplina}, Subdisciplina: ${atividade.subdisciplina})`);
  }
  
  return isConcepcao && isMemorialSub;
};

export const getCorrectEtapa = (atividade) => {
  if (isMemorialActivity(atividade)) {
    console.log(`📋 Memorial "${atividade.atividade}" (${atividade.subdisciplina}) → "Estudo Preliminar"`);
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