const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool } = require('../db/pool');

const ELECTRIC_SECTIONS = {
  'Memorial Descritivo': [
    "Descrição dos conceitos e parametros utilizados nos projetos.",
    "Descrição técnica e parâmetros utilizados na conceituação dos projetos para Distribuição em Média Tensão",
    "Descrição técnica e parâmetros utilizados na conceituação dos projetos para Sistema de Geração;",
    "Descrição técnica e parâmetros utilizados na conceituação dos projetos para Sistema de Energia Critica através de UPS",
    "Descrição técnica e parâmetros utilizados na conceituação dos projetos para Quadros de distribuição e quadros terminais",
    "Descrição da distribuição de baixa tensão",
    "Descrição técnica dos parâmetros utilizados para Critérios de Dimensionamento;",
    "Descrição técnica dos parâmetros utilizados na conceituação dos projetos para Iluminação normal e emergência",
    "Descrição técnica dos parâmetros utilizados na conceituação dos projetos para Tomadas",
    "Descrição técnica dos parâmetros utilizados na conceituação dos projetos para os pontos de força",
    "Descrição técnica dos conceitos e parâmetros utilizados na conceituação dos projetos para Sistemas de Proteção Contra Descarga Atmosférica;",
    "Descrição técnica dos conceitos e parâmetros utilizados na conceituação dos projetos para Sistemas de Aterramento.",
    "Apresentação das normas técnicas, bem como das boas praticas de instalações a serem observadas pela instaladora.",
    "Verificação da existência de linhas elétricas em rotas de fuga, caso positivo verificar se a linha esta especificada para suportar o tempo de resistência a fogo aplicável ou 2 horas.",
    "Compatibilização dos equipamentos que possuirão interface com automação, determinando os protocolos utilizados e os dados disponíveis para gerenciamento. (Multimedidores, Gerador, Disjuntor, etc.)",
    "Descrição dos testes, comissionamentos, relatórios, start-up´s, treinamentos, as built e data-book para rececimento das instalações",
    "Critérios de sinalização, suportações e fixações",
    "Comentários gerais",
    "Especificação técnica de paineis de média tensão",
    "Especificação técnica de transformadores",
    "Especificação técnicas de grupo geradores",
    "Especificação técnicas de UPS´s",
    "Especificação técnica de sistema fotovoltáico.",
    "Especificação técnica de quadros gerais",
    "Especificação ténica de quadro de força e comando de motores e bombas",
    "Especificação de quadros terminais",
    "Especificação técnica de eletrodutos (Embutidos, Aparentes, Enterrados).",
    "Especificação técnicas de caixas de passagem",
    "Especificação técnicas de eletrocalhas",
    "Especificação técnicas de leitos",
    "Especificação técnicas de perfilados",
    "Especificação técnicas de barramentos blindados",
    "Especificação técnicas de condutores de média e baixa tensão",
    "Especificações de componentes elétricos - Iluminação, Tomadas, Sensores e interruptores.",
    "Especificações de componentes elétricos - Iluminação, Tomadas, Sensores e interruptores.",
    "Especificação de pintura e sinalizações das tubulações"
  ],
  'Entrada de Energia': [
    "Diretriz de fornecimento de energia emitido pela concessionária",
    "Validação do conceito estabelecido conforme padrões da concessionária local",
    "Cálculo de demanda global do empreendimento e dos transformadores (caso aplicável)",
    "Conceito de medição de energia",
    "Localização da entrada de energia e interligação com rede externa, respeitando os limites estabelecidos pela concessionária, e localização da cabine primária e subestações de transformação.",
    "Validação do conceito de alimentação dos equipamentos de incêndio",
    "Detalhamento da entrada de energia apresentando planta, cortes, vistas, conceito de ventilação, cotas, descrição dos equipamentos interligação com rede pública, sistemas de aterramento, notas e detalhes.",
    "Detalhamento das subestações de energia apresentando planta, cortes, vistas, conceito de ventilação, cotas, descrição dos equipamentos, sistemas de aterramento, notas e detalhes."
  ],
  'Sistema de Geração de Energia Autonoma': [
    "Determinação das cargas a serem alimentadas pelo sistema de geração autônoma.",
    "Cálculo do sistema de geração autônoma",
    "Descrição da forma de funcionamento dos grupo geradores, sistema de partida, redundâncias e seleção de cargas na partida e em caso de falha.",
    "Definição do sistema de abastecimento de diesel, determinando o volume a armazenar devido ao tipo de operação e autonomia do sistema",
    "Detalhamento Sala Técnica do Grupo Gerador - Ampliação, Corte, Elevação",
    "Validação da tubulação de escape dos geradores",
    "Validação de acústica do sistema"
  ],
  'Sistema de Energia Ininterrupta (UPS) - Cargas Criticas': [
    "Determinação das cargas a serem alimentadas pelo sistema de energia critica",
    "Cálculo do sistema de cargas criticas",
    "Determinação da Autonomia do Sistema Ininterrupto de Energia",
    "Detalhamento da Área Técnica das UPS e baterias - Ampliação, Corte, Detalhamento, Notas",
    "Descrição da forma de funcionamento das UPS´s e redundâncias em caso de falha.",
    "Indicação dos bancos de bateria e interligações."
  ],
  'Diagramas Gerais de Média Tensão': [
    "Indicação dos alimentadores de entrada de energia e das subestações, validando corrente, bitola dos cabos e seletividade dos disjuntores",
    "Indicação dos relés de proteção, tc´s, tp´s",
    "Botoeira ou comando junto a central de alarme de incêndio para desligamento do sistema no caso de sinistro",
    "Definição do conceito de alimentação independente das cargas de incêndio",
    "Indicação das classes de tensões e corrente de curto circuito dos equipamentos - Cubículos, Chaves Seccionadoras e Proteções",
    "Intertravamentos entre proteções de MT/MT",
    "Validação dos dados técnicos dos transformadores (Tensões de entrada e saída, potência, isolação, classe de tensão, alarme e desligamento de energia, com ventilação ou não e IP)",
    "Indicação de No-Break, Retificadores para alimentações dos circuitos de comando",
    "Compatibilização dos pontos previstos para automação junto aos quadros elétricos, definindo limite de fornecimento"
  ],
  'Diagramas Gerais de Baixa Tensão': [
    "Validação das proteções dos Quadros Gerais x Corrente Nominal",
    "Validação das Proteções dos Quadros Gerais x Bitola dos Cabos",
    "Seletividade dos Disjuntores dos Quadro Gerais de Distribuição",
    "Indicação dos Multimedidores, Transformadores de Corrente",
    "Indicação das Sinalizações de Intertravamento Elétrico / Kirk -  Bobina de Abertura, Fechamento",
    "Indicação das Sinalização de Alarme de Temperatura do Trafo - Relé de Temperatura / 1ºEstágio - Alarme / 2ºEstágio - Desarme",
    "Indicação de TVSS´s (DPS) com a especificação da classe de proteção",
    "Indicação de Tipo, Forma Construtiva, Ensaio, Icc  dos Quadros Gerais de Distribuição",
    "Validação das correntes dos tc´s utilizados",
    "Validar conceito de utilização dos bancos de capacitores, fixos e automáticos",
    "Indicação da tensão de operação e das correntes de curto circuito dos quadros gerais de distribuição",
    "Barramento Blindado - Indicação do diagrama de distribuição.",
    "Barramento Blindado - Indicação das Correntes (A) dos Plugins.",
    "Barramento Blindado - Apresentação do Cálculo de Dimensionamento.",
    "Barramento Blindado - Apresentação do Cálculo de Queda de Tensão - TRECHO a TRECHO",
    "Barramento Blindado - Especificação - Tipo, Grau de proteção, material conduto",
    "Compatibilização dos pontos previstos para automação junto aos quadros elétricos, definindo limite de fornecimento"
  ],
  'Diagramas de Iluminação e Tomadas': [
    "Validação da potência instalada, demandada e reservas estabelecidas",
    "Indicação da Tensão de Operação, Corrente de Curto Circuito, Barra de Neutro e Terra",
    "Validação das proteções e alimentadores gerais dos quadros",
    "Indicação de DPS e especificação técnica",
    "Indicação da Curva de Disparo dos Mini-Disjuntor",
    "Indicação dos comandos de iluminação",
    "Indicação dos transformadores isoladoras para alimentação dos comandos funcionais",
    "Representação da Régua de Bornes e Contatos disponíveis para o Sistema de Automação Predial - Chave Seletora, Status Contator, Comando",
    "Identificação dos Circuitos e Descritivo das Cargas Alimentadas",
    "Indicação dos DR´s para tomadas as áreas molhadas, iluminação externas e chuveiros, bem como validação das correntes indicadas",
    "Indicação do balanceamento das fases e validação das correntes de forma individual",
    "Previsão de reserva de 25% nos quadros"
  ],
  'Diagramas de Bombas e Motores': [
    "Validação dos quadros apresentados com indicação dos diagramas unifilares, funcional.",
    "Indicação de tensão de operação, corrente de curto circuito, barra de terra, grau de proteção do quadro",
    "Validação das potências das bombas e motores",
    "Validação das partidas dos motores, abaixo de 7,5CV partida direta, acima partida indireta",
    "Validação das proteções e alimentadores gerais dos quadros",
    "Indicação dos transformadores isoladoras para alimentação dos comandos funcionais",
    "Indicação das proteções térmicas para as bombas, exceto bomba principal de incêndio",
    "Validação dos diagramas funcionais dos quadros de bombas, validando as numerações de cada dispositivo",
    "Indicação dos bornes para interligação com automação",
    "Indicação dos circuitos de iluminação e comando nos quadros dos elevadores"
  ],
  'Distribuição de Energia - Alimentadores': [
    "Dimensionamento da Infraestrutura de Alimentadores em Planta ( Eletrocalha, Leitos, Eletrodutos)",
    "Dimensionamento de Caixa de Passagem - Alimentadores",
    "Validação dos pontos de força de processo e Ar-Condicionado",
    "Validação dos pontos de força para sistemas especiais conforme projeto especifico",
    "Validação dos quadros de bombas conforme projeto hidráulico e de incêndio",
    "Validação dos pontos de força exigidos pelo cliente, detalhando as tomadas específicas solicitadas ou os pontos de força",
    "Indicações dos TAG´s de alimentadores em planta",
    "Representação do layout em planta e detalhe ampliado, apresentando cotas, furações em laje, cortes, vistas de todos os shaft´s diferentes",
    "Esquema vertical representando os quadros e alimentadores."
  ],
  'Distribuição de Tomadas, iluminações Normais e Emergência': [
    "Áreas consideradas conforme projeto luminotécnico e áreas determinadas em projeto de instalações",
    "Sistema de Iluminação de Emergência - Blocos Autonomos , Módulos Autonomos, etc",
    "Sistema de Iluminação Funcional - Escadas e Poço do Elevador",
    "Áreas que serão comandadas através de sistema de automação, comandos nos quadros, interruptores e sensores",
    "Validação dos cálculos luminotécnicos",
    "Distribuição de tomadas de Uso Especifíco",
    "Distribuição de Tomdas de Uso Geral",
    "Distribuição de Tomdas para Poço do Elevador",
    "Distribuição de Tomdas para áreas técnicas",
    "Tomadas especificas para copas, vending machines, totens e equipamentos específicos determinados por layout arquitetônico",
    "Tomadas para portões elétricos, portas automáticas, catracas, cancelas e afins",
    "Indicação de cotas e alturas dos Interruptores e demais acionamentos - PNE",
    "Divisão dos quadros e setorização da circuitação e comandos adotados nos pavimentos para sistema de iluminação",
    "Localização dos quadros de iluminação e tomadas preferencialmente em áreas técnicas ou áreas de serviço",
    "Validação das bitolas das tubulações e enfiações conforme diagramas terminais"
  ],
  'Sistema de Proteção Contra Descarga Atmosférica e Aterramentos': [
    "Apresentação do cálculo de gerenciamento de risco conforme NBR-5419-2 2015.",
    "Validar classificação da edificação",
    "Sistema de Captação de cobertura seguindo os requisitos da NBR-5419",
    "Validação da quantidade de descidas conforme requisitos NBR-5419",
    "Detalhamento de fixação da malha de cobertura e/ou mastro",
    "Detalhamento de conexão entre malha de cobertura e descidas de para-raios",
    "Detalhes de conexão entre descidas de para raios e malha de piso",
    "Detalhamento de aterramento dos elementos metálicos da edificação, bem como detalhes de conexão destes ponto",
    "Detalhamento de aterramento do trilho dos elevadores",
    "Detalhamento de aterramento de tubulações metálicas e dutos",
    "Detalhamento de aterramento de elementos metálicos - Fachadas e Caixilhos",
    "Pontos de medição do sistema de aterramento",
    "Sistema de aterramento para energia, representando interligação com neutro dos transformadores, painéis de MT, BT e terra geral. Verificar cálculo do sistema ou nota de aplicação",
    "Sistema de aterramento para telecomunicações. Verificar cálculo do sistema ou nota de aplicação",
    "Detalhamento de aterramento do piso elevado."
  ]
};

async function seedChecklistDefaults() {
  const CHECKLIST_TYPE = 'Check List - ELE C';
  const FOLHAS_PLACEHOLDER = JSON.stringify(['', '', '', '', '', '']);
  try {
    console.log('Seeding default checklist and items...');
    await pool.query('BEGIN');
    await pool.query(
      'DELETE FROM checklist_items WHERE checklist_id IN (SELECT id FROM checklists WHERE tipo = $1)',
      [CHECKLIST_TYPE]
    );
    await pool.query('DELETE FROM checklists WHERE tipo = $1', [CHECKLIST_TYPE]);
    const checklistRes = await pool.query(
      'INSERT INTO checklists (tipo, status) VALUES ($1, $2) RETURNING id',
      [CHECKLIST_TYPE, 'pendente']
    );
    const checklistId = checklistRes.rows[0].id;

    let ordem = 0;
    let sectionIndex = 0;
    for (const [section, descriptions] of Object.entries(ELECTRIC_SECTIONS)) {
      sectionIndex += 1;
      for (let idx = 0; idx < descriptions.length; idx += 1) {
        const numero_item = `${sectionIndex}.${idx + 1}`;
        ordem += 1;
        await pool.query(
          `INSERT INTO checklist_items (checklist_id, secao, numero_item, descricao, status, folhas, ordem)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [checklistId, section, numero_item, descriptions[idx], 'pendente', FOLHAS_PLACEHOLDER, ordem]
        );
      }
    }
    await pool.query('COMMIT');
    console.log(`Default checklist seeded with ${ordem} items.`);
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Seed failed:', err);
  } finally {
    await pool.end();
  }
}

seedChecklistDefaults();
