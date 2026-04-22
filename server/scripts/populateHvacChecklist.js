const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { pool } = require('../db/pool');

const CHECKLIST_TYPE = "Check List - HVAC C";

const sections = [
  {
    name: "Memorial Descritivo, Memórias de Cálculo e Especificações Técnicas",
    items: [
      "Descrição técnica dos conceitos e parametros utilizados na conceituação dos projetos para condicionamento dos ambientes",
      "Descrição técnica dos conceitos e parametros utilizados na conceituação dos projetos para renovação de ar.",
      "Descrição técnica dos conceitos e parametros utilizados na conceituação dos projetos para ventilação e exautão em geral.",
      "Descrição técnica dos conceitos e parametros utilizados na conceituação dos projetos para pressurização de escada.",
      "Apresentação das normas técnicas.",
      "Apresentação das boas praticas de instalações a serem observadas pela instaladora.",
      "Descrição dos testes e comissionamentos exigidos para cada instalação, bem como documentos a serem entregues pela instaladora ao final da obra.",
      "Apresentação de projeto As Built, prevendo o acompanhando das mudanças para validação do mesmo ao final da obra.",
      "Memória de cálculo para determinação da carga térmica",
      "Memória de cálculo para determinação do sistema de renovação de ar",
      "Memória de cálculo para determinação dos sistemas de ventilação e exaustão",
      "Memória de cálculo para determinação dos sistemas de pressurização de escada",
      "Memória de cálculo para determinação das bombas e redes de água gelada",
      "Memória de cálculo para dimensionamento dos dutos em geral",
      "Critérios para acústica e vibração das salas técnicas e tubulações",
      "Critérios para compartimentação de ambientes nos trechos de passagem das instalações e áreas técnicas",
      "Especificação técnicas de dos chiller´s, torres, bombas e outros  equipamentos da CAG.",
      "Especificação técnicas dos fancoíl´s, caixas de misturas e seus acessórios.",
      "Especificação técnica dos isolamentos térmicos e filtragens",
      "Especificação técnicas de dutos, damper´s, grelhas, difusores e acessórios para difusão de ar.",
      "Especificação técnicas de tubulações, conexões, válvulas, redutoras, registros, acabamentos, medidores, suportações e afins para as redes de água gelada.",
      "Especificações técnicas de ventiladores e exaustores.",
      "Especificação de pintura e sinalizações das tubulações",
      "Compatibilização dos equipamentos que possuirão interface com automação, determinando os protocolos utilizados e os dados disponíveis para gerenciamento.",
      "Lista de Fornecedores - VENDOR LIST",
      "Suportações e fixações"
    ]
  },
  {
    name: "Climatização - Expansão Indireta - Sistema de Água Gelada",
    items: [
      "Esquema vertical ou fluxograma de representação do sistema",
      "Validação das áreas climatizadas",
      "Apresentação em plantas baixas e detalhamento central de água gelada.",
      "Apresentação em plantas baixas e detalhamentos das redes de água gelada nos pavimentos",
      "Apresentação em plantas baixas e detalhamentos das casas de máquinas e fancoil´s",
      "Apresentação em plantas baixas e detalhamentos das redes de dutos, difusores e grelhas",
      "Representação dos pontos de força, pontos de drenos, ralos e torneiras para manutanção.",
      "Indicações de VAV´s, dampers e registros de regulagem, damper´s corta fogo, filtragem, sensores de temperatura, umidade e pressão.",
      "Indicação das vazões, fluxos e dimensionamentos de difusores, grelhas e dutos.",
      "Tabelas com as seleções dos equipamentos",
      "Arranjos dos shaft´s - Cortes e ampliações",
      "Indicação de válvulas, conexões, registros, medições, flanges, juntas e afins.",
      "Detalhamento de projeto - Conexões Hidráulicas e Componentes - Fan-Coils",
      "Detalhes Construtivos - Suportações, fixações e contruções de dutos",
      "Fornecimento de alimentação e diagramas elétricos, funcionais e de automação"
    ]
  },
  {
    name: "Renovação de Ar, Exaustão e Ventilação Mecânica",
    items: [
      "Fornecimento dos Sistemas de Exaustão - Casa de Máquinas Elevadores",
      "Fornecimento dos Sistemas de Exaustão - Cabine primária, subestações, sala de geradores e salas elétricas",
      "Fornecimento dos Sistemas de Exaustão - Estacionamentos",
      "Fornecimento dos Sistemas de Exaustão - Casas de bombas",
      "Fornecimento dos Sistema de Exaustão - Vestiários e Depósitos",
      "Fornecimento dos Sistemas de Exaustão - Sanitários",
      "Fornecimento dos Sistemas de Exaustão - Cozinha",
      "Fornecimento dos Sistemas de renovação de ar externo.",
      "Esquema vertical ou fluxograma de representação dos sistemas",
      "Apresentação em plantas baixas e detalhamento de casas de máquinas, exaustores e ventiladores",
      "Apresentação em plantas baixas e detalhamentos das redes de dutos, difuroes e grelhas",
      "Representação dos pontos de força dos equipamentos",
      "Indicações de sensores, filtragens, dampers de reguragem e corta forgo.",
      "Indicação das vazões, fluxos e dimensionamentos de difusores, grelhas e dutos.",
      "Tabelas com as seleções dos equipamentos",
      "Arranjos dos shaft´s - Cortes e ampliações",
      "Indicação de captação do ar externo e saidas de exaustão",
      "Detalhes Construtivos - Suportações, fixações e contruções de dutos",
      "Indicação dos comandos de acionamento dos motores",
      "Fornecimento de alimentação e diagramas elétricos, funcionais e de automação"
    ]
  },
  {
    name: "Pressurização de Escada",
    items: [
      "Indicação das escadas pressurizadas",
      "Esquema vertical ou fluxograma de representação do sistema",
      "Validação do ponto de captação do ar e seus respectivos afastamentos de vizinhos, área de circulação de veículos e aberturas na edificação",
      "Apresentação em plantas baixas e detalhamento de casas de máquinas e ventiladores, considerando ante-camara para as mesmas",
      "Apresentação em plantas baixas e detalhamentos das redes de dutos, difuroes e grelhas",
      "Tabelas com as seleções dos equipamentos",
      "Locação dos sensores de pressão para acionamento do sistema.",
      "Indicação das vazões, fluxos e dimensionamentos de difusores, grelhas e dutos.",
      "Arranjos dos shaft´s - Cortes e ampliações",
      "Detalhes Construtivos - Suportações, fixações e contruções de dutos",
      "Fornecimento de alimentação e diagramas elétricos, funcionais e de automação"
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
