const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { pool } = require('../db/pool');

const CHECKLIST_TYPE = "Check List - HID C";

const sections = [
  {
    name: "Memorial Descritivo",
    items: [
      "Descrição técnica dos conceitos e parametros utilizados na conceituação dos projetos para redes de água potável e de reuso.",
      "Descrição técnica dos conceitos e parametros utilizados na conceituação dos projetos para redes de água quente",
      "Descrição técnica dos conceitos e parametros utilizados na conceituação dos projetos para redes de esgoto.",
      "Descrição técnica dos conceitos e parametros utilizados na conceituação dos projetos para redes de gás.",
      "Descrição técnica dos conceitos e parametros utilizados na conceituação dos projetos para redes de águas pluviais.",
      "Descrição técnica dos conceitos e parametros utilizados na conceituação dos projetos de drenagem subterrânea.",
      "Apresentação das normas técnicas.",
      "Apresentação das boas praticas de instalações a serem observadas pela instaladora.",
      "Descrição dos testes e comissionamentos exigidos para cada instalação, bem como documentos a serem entregues pela instaladora ao final da obra.",
      "Apresentação de projeto As Built, prevendo o acompanhando das mudanças para validação do mesmo ao final da obra.",
      "Nota de acompanhamento do processo junto as concessionárias pela instaladora até a ligação final da obra.",
      "Critérios para acústica e vibração nas salas técnicas e tubulações",
      "Critérios para compartimentação de ambientes nos trechos de passagem das instalações e áreas técnicas",
      "Validação dos cálculos de volume dos de água potável, água de reuso;",
      "Especificação técnicas de tubulações, conexões, válvulas, redutoras, registros, acabamentos, medidores, suportações e afins para as redes de água fria, quente e de reuso",
      "Especificação técnicas de tubulações, conexões, válvulas, registros, ralos secos e sifonados, isolamento drenos de ar condicionado, suportações e afins para as redes de esgoto sanitário e ventilação.",
      "Especificação técnicas de tubulações, conexões, valvulas, registros, grelhas e ralos para captação, canaletas, suportações e afins para as redes de gás.",
      "Especificação técnicas de tubulações, conexões, valvulas, registros, grelhas e ralos para captação, canaletas, suportações e afins para as redes de águas pluviais.",
      "Especificação técnicas de tubulações, conexões, valvulas, registros, grelhas e ralos para captação, canaletas, suportações e afins para as redes de drenagem subterrânea.",
      "Especificação para sistemas de bombeamento para recalque de água potável e reuso entre reservatórios.",
      "Especificação para válvulas redutoras de pressão para redes de água potável e reuso. Indicando pressão de entrada e saída, respeitando a relação de 5:1",
      "Especificação para sistemas de bombeamento para pressurização de redes de água potável e reuso.",
      "Especificação para sistemas de bombeamento para recalque de esgoto.",
      "Especificação para sistemas de bombeamento para recalque de águas pluviais, reservatório de retenção e drenagem profunda.",
      "Especificação de pintura e sinalizações das tubulações",
      "Compatibilização dos equipamentos que possuirão interface com automação, determinando os protocolos utilizados e os dados disponíveis para gerenciamento.",
      "Lista de Fornecedores - VENDOR LIST",
      "Suportações e fixações"
    ]
  },
  {
    name: "Instalações de Água Potável e Reuso",
    items: [
      "Diretriz de fornecimento de água emitido pelo concessionária",
      "Posicionamento de entrada de água e hidrômetro conforme padrão concessionária.",
      "Abastecimento via caminhão pipa, descrito em memorial descritivo",
      "Definição dos tipos de reservatórios utilizados e indicação dos volumes estabelecidos na memoria de cálculo e memorial descritivo",
      "Definição da locação de registros para manobra para facilidade de manuteção e operação nas derivações para as áreas especificas.",
      "Validação da pressão no ponto mais desfavorável e no ponto mais favorável.",
      "Detalhamento das casas de bombas indicando os tamanhos reais das mesmas, bem como a indicação de todos os equipamentos, válvulas, válvulas de retenção, juntas antivibratórias, registros e respiros compostos no sistemas",
      "Detalhamento em planta ou corte das tubulações que compõem os reservatórios com indicação das alturas da conexões, para recalque, sucção, vasos comunicantes, pescadores, limpeza, extravazão e inspeção para acesso aos reservatórios",
      "Rede de aviso interligando a extravazão do sistema com descarte em local de fácil visualização",
      "Barrilete de interligação entre reservatórios e prumadas de recalque e distribuição",
      "Detalhamento em planta e corte dos shaft´s de distribuição, quando aplicável, apresentando detalhamento dos medidores, VRP´s, ralos e drenos. Pontos de inspeção para acesso ao shaft",
      "Válvula eliminadora de ar para sistemas de pressurização",
      "Redes de respiro e drenagem das VRP´s",
      "Consideração de proteção mecânica nos trechos de descida de tubulações aparentes",
      "Torneiras de lavagem para limpeza e manutenção.",
      "Torneiras de lavagem para jardins",
      "Torneiro de lavagem para Pátios",
      "Torneira de lavagem para Casa de Máquinas - ACV",
      "Vistas isométricas das tubulações nas áreas com pontos de consumo, indicando o dimensionamento da rede de altura dos pontos",
      "Validação das redes de recalque e distribuição em esquema vertical ou fluxograma, indicando os diâmetros de cada trecho e as indicações de prumadas",
      "Detalhe de alimentação dos lavatórios, pias, tanques e vasos sanitários",
      "Detalhes das suportações",
      "Validação com automação as interfaces entre válvulas de bloqueio e bombas que serão monitorados"
    ]
  },
  {
    name: "Instalações de Água Quente",
    items: [
      "Definição do tipo de central de aquecimento",
      "Definição do volume de sistema de aquecimento adotado",
      "Definição do critério de alimentação e retorno do sistema.",
      "Barrilete de interligação entre central de aquecimento e prumadas de distribuição e definição da locação de registros para manobra para facilidade de manuteção e operação nas derivações para as áreas especificas.",
      "Validação da pressão no ponto mais desfavorável e no ponto mais favorável.",
      "Detalhamento da central de aquecimento, bombas e placas solares, indicando os tamanhos reais das mesmas, bem como a indicação de todos os equipamentos, válvulas, válvulas de retenção, juntas antivibratórias, registros e respiros compostos no sistemas",
      "Detalhamento em planta ou corte dos shaft´s de distribuição, quando aplicável, apresentando detalhamento dos medidores, VRP´s, ralos e drenos. Pontos de inspeção para acesso ao shaft",
      "Análise de flexibilidade e dilatação da rede de água quente",
      "Válvulas eliminadoras de ar e quebra vácuo.",
      "Vistas isométricas das tubulações nas áreas com pontos de consumo, indicando o dimensionamento da rede de altura dos pontos",
      "Validação das redes de distribuição em esquema vertical ou fluxograma, indicando os diâmetros de cada trecho e as indicações de prumadas",
      "Detalhe de alimentação de água quente dos lavatórios, chuveiros e pontos de cozinha.",
      "Detalhes das suportações e isolamento térmico",
      "Validação com automação as interfaces entre válvulas de bloqueio e medidores que serão monitorados"
    ]
  },
  {
    name: "Instalações de Gás Combustível",
    items: [
      "Diretriz para descarte a rede pública emitido pelo concessionária",
      "Detalhes ampliados dos sanitários com indicação das redes de captação compatibilizando com as plantas",
      "Indicação dos caimentos das redes nos pavimentos.",
      "Validação cota de descarte na interligação com a rede pública",
      "Validação da localização de poços de águas servidas e/ou esgoto, detalhando as alturas das redes de entrada e saída, altura livre e volume, posicionamento dos registros e válvulas de retenção, tamanho das bombas e visitas para inspeção e manutenção",
      "Captação através de ralos para as caixas d´agua e detalhamento da conexão da limpeza e extravazão com os mesmos.",
      "Captação dos drenos de ar condicionado, casas de máquinas com previsão de isolamento térmico.",
      "Captação dos drenos das VRP´s, conjunto de automação das bombas de incêndio, VGA´s e controles setoriais.",
      "Captação dos drenos dos purgos do sistema de ar condicionado.",
      "Validação de esgoto gorduroso para copas com caixa separadora de gordura e prumada independente",
      "Validação de esgoto oleoso a partir do sistema de óleo diesel para geradores, heliponto e estacionamento, quando exigido por órgãos locais",
      "Detalhamento especifico para desvio nos pés das prumadas",
      "Validação das redes primárias e secundárias em esquema vertical ou fluxograma, indicado os diâmetros de cada trecho e as indicações de prumadas",
      "Indicação em planta da interligação da rede de ventilação a cobertura e detalhamento do descarte do sistema, respeitando distância de portas, janelas e vãos",
      "Verificação da necessidade de interligação das prumadas de esgoto até a cobertura",
      "Verificação de aclive nas redes horizontais de ventilação sanitária",
      "Consideração de proteção mecânica nos trechos de descida de tubulações aparentes",
      "Detalhe de caixas e poços de inspeção e caixas separadores",
      "Detalhes das suportações",
      "Detalhe de captação dos lavatórios, pias, tanques e vasos sanitários"
    ]
  },
  {
    name: "Instalação de Esgoto e Ventilação Sanitária",
    items: [
      "Diretriz para descarte a rede pública emitido pelo concessionária",
      "Detalhes ampliados dos sanitários com indicação das redes de captação compatibilizando com as plantas",
      "Indicação dos caimentos das redes nos pavimentos.",
      "Validação cota de descarte na interligação com a rede pública",
      "Validação da localização de poços de águas servidas e/ou esgoto, detalhando as alturas das redes de entrada e saída, altura livre e volume, posicionamento dos registros e válvulas de retenção, tamanho das bombas e visitas para inspeção e manutenção",
      "Captação através de ralos para as caixas d´agua e detalhamento da conexão da limpeza e extravazão com os mesmos.",
      "Captação dos drenos de ar condicionado, casas de máquinas com previsão de isolamento térmico.",
      "Captação dos drenos das VRP´s, conjunto de automação das bombas de incêndio, VGA´s e controles setoriais.",
      "Captação dos drenos dos purgos do sistema de ar condicionado.",
      "Validação de esgoto gorduroso para copas com caixa separadora de gordura e prumada independente",
      "Validação de esgoto oleoso a partir do sistema de óleo diesel para geradores, heliponto e estacionamento, quando exigido por órgãos locais",
      "Detalhamento especifico para desvio nos pés das prumadas",
      "Validação das redes primárias e secundárias em esquema vertical ou fluxograma, indicado os diâmetros de cada trecho e as indicações de prumadas",
      "Indicação em planta da interligação da rede de ventilação a cobertura e detalhamento do descarte do sistema, respeitando distância de portas, janelas e vãos",
      "Verificação da necessidade de interligação das prumadas de esgoto até a cobertura",
      "Verificação de aclive nas redes horizontais de ventilação sanitária",
      "Consideração de proteção mecânica nos trechos de descida de tubulações aparentes",
      "Detalhe de caixas e poços de inspeção e caixas separadores",
      "Detalhes das suportações",
      "Detalhe de captação dos lavatórios, pias, tanques e vasos sanitários"
    ]
  },
  {
    name: "Instalações de Águas Pluviais e Drenagem Superficial",
    items: [
      "Validação das redes captação e condução nas plantas, indicando os diâmetros, cotas de instalação e caimentos",
      "Detalhamento dos reservatórios de retardo.",
      "Validação cota de descarte junto a sarjeta ou na interligação com a rede pública",
      "Consideração de proteção mecânica nos trechos de descida de tubulações aparentes",
      "Indicação dos caimentos em lajes e pisos com orientação aos ralos de captação",
      "Validação da captação das rampas, terraços, marquises, jardins e áreas de ventilação permanente",
      "Indicação dos tipos de captação através de grelhas hemisféricas, grelhas planas e captações de jardim",
      "Validação da localização de poços de águas pluviais e drenagem, detalhando as alturas das redes de entrada e saída, altura livre e volume, posicionamento dos registros e válvulas de retenção, tamanho das bombas e visitas para inspeção e manutenção",
      "Detalhamento especifico para desvio nos pés das prumadas",
      "Detalhe de caixas e poços de inspeção e caixas com grelhas",
      "Detalhes das suportações"
    ]
  }
];

function buildNumeroItem(sectionIndex, itemIndex) {
  return `${sectionIndex + 1}.${itemIndex + 1}`;
}

async function ensureChecklist() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selectRes = await client.query("SELECT id FROM checklists WHERE tipo = $1 LIMIT 1", [CHECKLIST_TYPE]);
    let checklistId;
    if (selectRes.rows.length > 0) {
      checklistId = selectRes.rows[0].id;
    } else {
      const insertChecklist = await client.query(
        "INSERT INTO checklists (tipo) VALUES ($1) RETURNING id",
        [CHECKLIST_TYPE]
      );
      checklistId = insertChecklist.rows[0].id;
    }
    await client.query("DELETE FROM checklist_items WHERE checklist_id = $1", [checklistId]);
    let ordem = 1;
    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
      const section = sections[sectionIndex];
      for (let itemIndex = 0; itemIndex < section.items.length; itemIndex += 1) {
        const descricao = section.items[itemIndex];
        await client.query(
          `
            INSERT INTO checklist_items (
              checklist_id,
              secao,
              numero_item,
              descricao,
              ordem,
              status,
              folhas,
              observacoes,
              conclusao,
              tempo
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          `,
          [
            checklistId,
            section.name,
            buildNumeroItem(sectionIndex, itemIndex),
            descricao,
            ordem++,
            "pendente",
            JSON.stringify([]),
            "",
            "",
            ""
          ]
        );
      }
    }
    await client.query("COMMIT");
    console.log(`Checklist "${CHECKLIST_TYPE}" populado com ${ordem - 1} itens.`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Falha ao inserir checklist padrão:", error);
  } finally {
    client.release();
    await pool.end();
  }
}

ensureChecklist().catch((err) => {
  console.error("Erro ao rodar script de checklist:", err);
  process.exit(1);
});
