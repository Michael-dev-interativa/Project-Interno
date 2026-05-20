import { base44 } from '@/api/base44Client';

export const ITEMS_INICIO_DE_PROJETO = [
  { numero_item: '1.1', descricao: 'Verificar com o cliente se há padronização de projeto para carimbo, nomenclatura e/ou documentos:' },
  { numero_item: '1.2', descricao: 'Enviar briefing para cliente solicitando preenchimento:' },
  { numero_item: '1.3', descricao: 'Criação de lista mestra de documentos:' },
  { numero_item: '1.4', descricao: 'Envio de documento entregas por etapa:' },
  { numero_item: '1.5', descricao: 'Envio de documento projetos de terceiros:' },
  { numero_item: '1.6', descricao: 'Criação de folhas e carimbos:' },
  { numero_item: '1.7', descricao: 'Criação de bases de arquitetura A-, estrutura E-, textos T-, fundação F- e luminotécnico L-:' },
  { numero_item: '1.8', descricao: 'Verificação de documentos recebidos pelo cliente com solicitações de pontos:' },
];

export const ITEMS_BASES_E_FOLHAS = [
  { numero_item: '1.1', descricao: 'Checar se o A- está nas cores corretas (Alvenaria na cor branca, pilares na cor azul, eixos no layer A-EIXOS e cor vermelha e demais layers na cor 8 cinza):' },
  { numero_item: '1.2', descricao: 'Checar se todos os ambientes estão com texto de arquitetura:' },
  { numero_item: '1.3', descricao: 'Checar se o T- está no layer A-TEXTOS:' },
  { numero_item: '1.4', descricao: 'Checar se os textos estão na fonte Arial e tamanho 18:' },
  { numero_item: '1.5', descricao: 'Checar se todos os pavimentos estão com E- de estrutura e se está saindo com linha traçejada:' },
  { numero_item: '1.6', descricao: 'Checar se o E- está no layer E-VIGAS, para as vigas e pilares e E-TEXTOS para os textos de tamanhos de vigas, pilares, lajes e também as indicações de corte de vigas:' },
  { numero_item: '1.7', descricao: 'Checar se o último pavimento está com o F- de fundação:' },
  { numero_item: '1.8', descricao: 'Checar se possui título na planta com fonte Arial e tamanhos de texto 70, 50 e 25:' },
  { numero_item: '1.9', descricao: 'Checar se o carimbo está preenchido corretamente:' },
  { numero_item: '1.10', descricao: 'Checar se na folha possui notas e legenda:' },
  { numero_item: '1.11', descricao: 'Checar se no padrão do cliente além de carimbo há solicitação de inclusão de planta chave, norte, arquivos de referência ou outros:' },
];

export const SECOES_PADRAO = [
  'Sistemas Eletrônicos',
  'Incêndio',
  'HVAC',
  'Hidráulica',
  'Elétrica',
];

export const ITEMS_COMPATIBILIZACAO = [
  { numero_item: '1.1', descricao: 'Checar se estamos passando alguma instalação em pilar' },
  { numero_item: '1.2', descricao: 'Checar se estamos passando alguma instalação em elevador' },
  { numero_item: '1.3', descricao: 'Checar se foram indicadas as furações necessárias em viga e se o tamanho do furo está adequado' },
  { numero_item: '1.4', descricao: 'Checar se temos alguma instalação passando no sentido vertical na viga' },
  { numero_item: '1.5', descricao: 'Checar se temos algum conflito com vigas de transição' },
  { numero_item: '1.6', descricao: 'Checar se temos algum conflito de pé direito ou forro' },
  { numero_item: '1.7', descricao: 'Checar se foram atendidos os raios solicitados por impermeabilização' },
  { numero_item: '1.8', descricao: 'Checar se foram atendidos os pontos de torneira solicitados por paisagismo' },
  { numero_item: '1.9', descricao: 'Checar se foram atendidos os pontos de iluminação solicitados por paisagismo' },
  { numero_item: '1.10', descricao: 'Checar se foram atendidos os pontos solicitados no projeto de interiores' },
  { numero_item: '1.11', descricao: 'Checar se foram atendidos os pontos solicitados no projeto de reuso' },
  { numero_item: '1.12', descricao: 'Checar se foram atendidos os pontos solicitados no projeto de irrigação' },
  { numero_item: '1.13', descricao: 'Checar se foram atendidos os pontos solicitados no projeto de piscina' },
  { numero_item: '1.14', descricao: 'Checar se foram atendidos todos os pontos de luminotécnico' },
  { numero_item: '1.15', descricao: 'Checar se foram atendidos os pontos solicitados no projeto de elevador, se houver' },
  { numero_item: '1.16', descricao: 'Checar se há algum outro projeto com necessidade de pontos' },
  { numero_item: '1.17', descricao: 'Checar se foram atendidos pontos para carro elétrico, se houver' },
  { numero_item: '1.18', descricao: 'Checar se todas as lajes possuem captação de água pluvial' },
  { numero_item: '1.18b', descricao: 'Checar se tem parede diafragma, e se foi feita a captação' },
  { numero_item: '1.19', descricao: 'Checar se shafts estão compatibilizados' },
  { numero_item: '1.20', descricao: 'Checar se temos conflito de altura de instalações em forro e estacionamentos' },
  { numero_item: '1.21', descricao: 'Checar se temos algum banheiro acima de área técnica elétrica' },
  { numero_item: '1.22', descricao: 'Checar se temos algum banheiro acima de viga de transição' },
  { numero_item: '1.23', descricao: 'Checar se todos os extintores e hidrantes estão locados a no máximo 5m da entrada' },
  { numero_item: '1.24', descricao: 'Checar se foi locado o registro de recalque de coluna' },
  { numero_item: '1.25', descricao: 'Para cozinhas industriais checar se foi locado o painel de registro de gás' },
  { numero_item: '1.26', descricao: 'Checar se a posição dos quadros está adequada e alinhada com cliente' },
  { numero_item: '1.27', descricao: 'Checar se shaft onde passa a prumada de gás está ventilado e se os ambientes com equipamentos de gás estão ventilados também conforme indica a comgás' },
  { numero_item: '1.28', descricao: 'Para apartamentos checar se foi locado o aquecedor e também a chaminé e se ela está compatibilizada com estrutura, se foi locado no forro e há necessidade de ventilação' },
  { numero_item: '1.29', descricao: 'Para apartamentos checar se estamos utilizando as sancas disponibilizadas por arquitetura' },
  { numero_item: '1.30', descricao: 'Checar se todos os equipamentos solicitados pelo cliente estão sendo alimentados, como máquina de lavar roupa, máquinas de lavar louça, triturador, coifa, filtro, água na geladeira entre outros' },
  { numero_item: '1.31', descricao: 'Checar se volumes dos reservatórios condizem com os da arquitetura, e se estiverem divergentes verificar se está alinhado com cliente' },
  { numero_item: '1.32', descricao: 'Checar se no gerador foram locadas as entradas e saídas de ar e também a chaminé; E verificar se foi feita a ampliação' },
  { numero_item: '1.33', descricao: 'Equipamentos central de aquecimento' },
  { numero_item: '1.34', descricao: 'Cota de saída de água pluvial para conseguir sair na sarjeta' },
  { numero_item: '1.35', descricao: 'Cota de saída de esgoto compatibilizar com concessionária' },
  { numero_item: '1.36', descricao: 'Detalhamento cotas de bombas com cortes' },
  { numero_item: '1.37', descricao: 'Verificar se teremos projeto de vedação' },
  { numero_item: '1.38', descricao: 'Não utilizar tubulações no contrapiso, a menos que seja combinado com o cliente' },
  { numero_item: '1.39', descricao: 'Em redes enterradas com cotas a mais de 2m, validar com cliente' },
];

/**
 * Cria um ChecklistPlanejamento com seus itens para uma disciplina,
 * vinculado a um empreendimento. Retorna o checklist criado.
 */
export async function criarChecklistParaDisciplina({
  tipo,
  empreendimento_id,
  cliente,
  tecnico_responsavel,
  numero_os,
  data_entrega,
  periodos,
}) {
  const isCompatibilizacao = tipo === 'Planejamento - COMPATIBILIZAÇÃO';
  const isBasesEFolhas = tipo === 'Planejamento - BASES E FOLHAS';
  const isInicioDeProjeto = tipo === 'Planejamento - INÍCIO DE PROJETO';

  const novoChecklist = await base44.entities.ChecklistPlanejamento.create({
    tipo,
    empreendimento_id: empreendimento_id || null,
    cliente: cliente || '',
    tecnico_responsavel: tecnico_responsavel || '',
    numero_os: numero_os || '',
    data_entrega: data_entrega || null,
    periodos: periodos || [],
    status: 'em_andamento',
  });

  if (isInicioDeProjeto) {
    for (let i = 0; i < ITEMS_INICIO_DE_PROJETO.length; i++) {
      await base44.entities.ChecklistItem.create({
        checklist_id: novoChecklist.id,
        secao: 'INÍCIO DE PROJETO',
        numero_item: ITEMS_INICIO_DE_PROJETO[i].numero_item,
        descricao: ITEMS_INICIO_DE_PROJETO[i].descricao,
        ordem: i + 1,
        status_por_periodo: {},
      });
    }
  } else if (isBasesEFolhas) {
    for (let i = 0; i < ITEMS_BASES_E_FOLHAS.length; i++) {
      await base44.entities.ChecklistItem.create({
        checklist_id: novoChecklist.id,
        secao: 'BASES E FOLHAS',
        numero_item: ITEMS_BASES_E_FOLHAS[i].numero_item,
        descricao: ITEMS_BASES_E_FOLHAS[i].descricao,
        ordem: i + 1,
        status_por_periodo: {},
      });
    }
  } else if (isCompatibilizacao) {
    for (let i = 0; i < ITEMS_COMPATIBILIZACAO.length; i++) {
      await base44.entities.ChecklistItem.create({
        checklist_id: novoChecklist.id,
        secao: 'COMPATIBILIZAÇÃO',
        numero_item: ITEMS_COMPATIBILIZACAO[i].numero_item,
        descricao: ITEMS_COMPATIBILIZACAO[i].descricao,
        ordem: i + 1,
        status_por_periodo: {},
      });
    }
  } else {
    for (let i = 0; i < SECOES_PADRAO.length; i++) {
      await base44.entities.ChecklistItem.create({
        checklist_id: novoChecklist.id,
        secao: SECOES_PADRAO[i],
        numero_item: `${i + 1}.0`,
        descricao: 'Seção criada automaticamente - adicione itens abaixo',
        ordem: 0,
        status_por_periodo: {},
      });
    }
  }

  return novoChecklist;
}
