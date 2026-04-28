function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function toUniqueEtapas(etapas) {
  return [...new Set((etapas || []).map(e => String(e || '').trim()).filter(Boolean))];
}

function findEtapaByAlias(etapasDisponiveis, aliases = []) {
  const normalizedEtapas = etapasDisponiveis.map(etapa => ({
    raw: etapa,
    normalized: normalizeText(etapa)
  }));

  for (const alias of aliases) {
    const aliasNorm = normalizeText(alias);
    const found = normalizedEtapas.find(e => e.normalized.includes(aliasNorm));
    if (found) return found.raw;
  }

  return null;
}

function extractEtapaCandidatesFromDocumentos(documentos = [], etapasDisponiveis = []) {
  const candidates = [];

  for (const doc of documentos) {
    if (doc?.etapa) candidates.push(String(doc.etapa));

    const searchable = [doc?.numero, doc?.arquivo, doc?.titulo, doc?.nome, doc?.descritivo]
      .filter(Boolean)
      .join(' | ');

    if (!searchable) continue;

    const normalizedSearchable = normalizeText(searchable);
    for (const etapa of etapasDisponiveis) {
      if (normalizedSearchable.includes(normalizeText(etapa))) {
        candidates.push(etapa);
      }
    }
  }

  return toUniqueEtapas(candidates);
}

export function suggestEtapaForActivity({
  etapasDisponiveis = [],
  disciplina = '',
  atividadeNome = '',
  selectedDocumentos = []
}) {
  const etapas = toUniqueEtapas(etapasDisponiveis);
  if (!etapas.length) {
    return { etapa: null, confidence: 'none', reason: 'Nenhuma etapa configurada no empreendimento.' };
  }

  if (etapas.length === 1) {
    return {
      etapa: etapas[0],
      confidence: 'high',
      reason: 'Empreendimento possui apenas uma etapa configurada.'
    };
  }

  const docCandidates = extractEtapaCandidatesFromDocumentos(selectedDocumentos, etapas);
  if (docCandidates.length === 1) {
    return {
      etapa: docCandidates[0],
      confidence: 'high',
      reason: 'Etapa inferida pelas folhas/documentos selecionados.'
    };
  }

  const disciplinaNorm = normalizeText(disciplina);
  const atividadeNorm = normalizeText(atividadeNome);

  const disciplinaRules = [
    { match: ['planejamento', 'coordenacao', 'coordenação', 'gestao', 'gestão', 'bim'], aliases: ['Planejamento', 'Concepção'] },
    { match: ['arquitetura', 'estrutura', 'estrutural', 'hidraulica', 'hidráulica', 'eletrica', 'elétrica', 'instalacoes', 'instalações'], aliases: ['Projeto Executivo', 'Projeto Básico', 'Ante-Projeto'] },
    { match: ['estudo', 'viabilidade', 'levantamento'], aliases: ['Estudo Preliminar', 'Concepção'] }
  ];

  for (const rule of disciplinaRules) {
    if (rule.match.some(term => disciplinaNorm.includes(normalizeText(term)))) {
      const etapa = findEtapaByAlias(etapas, rule.aliases);
      if (etapa) {
        return {
          etapa,
          confidence: 'medium',
          reason: `Sugestão pela disciplina selecionada (${disciplina}).`
        };
      }
    }
  }

  const atividadeRules = [
    { match: ['concepcao', 'concepção', 'escopo', 'briefing'], aliases: ['Concepção'] },
    { match: ['planejamento', 'cronograma'], aliases: ['Planejamento'] },
    { match: ['estudo preliminar', 'estudo'], aliases: ['Estudo Preliminar'] },
    { match: ['ante projeto', 'ante-projeto'], aliases: ['Ante-Projeto'] },
    { match: ['projeto basico', 'projeto básico'], aliases: ['Projeto Básico'] },
    { match: ['projeto executivo', 'executivo'], aliases: ['Projeto Executivo'] },
    { match: ['obra', 'liberado'], aliases: ['Liberado para Obra'] }
  ];

  for (const rule of atividadeRules) {
    if (rule.match.some(term => atividadeNorm.includes(normalizeText(term)))) {
      const etapa = findEtapaByAlias(etapas, rule.aliases);
      if (etapa) {
        return {
          etapa,
          confidence: 'low',
          reason: 'Sugestão baseada no texto da atividade.'
        };
      }
    }
  }

  return {
    etapa: null,
    confidence: 'none',
    reason: 'Sem sugestão automática confiável. Selecione manualmente.'
  };
}
