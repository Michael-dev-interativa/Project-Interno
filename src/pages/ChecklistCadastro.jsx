// @ts-nocheck
import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useLayoutEffect,
  forwardRef
} from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Documento } from "@/entities/all";
import { retryWithBackoff } from "@/components/utils/apiUtils";

const normalizeComparable = (value) => {
  if (value == null) return "";
  let text = String(value).trim();
  if (!text) return "";
  text = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text;
};

const formatDocumentoLabel = (doc) => {
  if (!doc) return "";
  return (
    (doc.numero && String(doc.numero).trim()) ||
    (doc.arquivo && String(doc.arquivo).trim()) ||
    (doc.titulo && String(doc.titulo).trim()) ||
    `Documento ${doc.id || ""}`
  );
};

const MEMORIAL_DESCRITIVO_ITEMS = [
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
];
const ENTRADA_ENERGIA_ITEMS = [
  "Diretriz de fornecimento de energia emitido pela concessionária",
  "Validação do conceito estabelecido conforme padrões da concessionária local",
  "Cálculo de demanda global do empreendimento e dos transformadores (caso aplicável)",
  "Conceito de medição de energia",
  "Localização da entrada de energia e interligação com rede externa, respeitando os limites estabelecidos pela concessionária, e localização da cabine primária e subestações de transformação.",
  "Validação do conceito de alimentação dos equipamentos de incêndio",
  "Detalhamento da entrada de energia apresentando planta, cortes, vistas, conceito de ventilação, cotas, descrição dos equipamentos interligação com rede pública, sistemas de aterramento, notas e detalhes.",
  "Detalhamento das subestações de energia apresentando planta, cortes, vistas, conceito de ventilação, cotas, descrição dos equipamentos, sistemas de aterramento, notas e detalhes."
];
const GERACAO_ENERGIA_AUTO_ITEMS = [
  "Determinação das cargas a serem alimentadas pelo sistema de geração autônoma.",
  "Cálculo do sistema de geração autônoma",
  "Descrição da forma de funcionamento dos grupo geradores, sistema de partida, redundâncias e seleção de cargas na partida e em caso de falha.",
  "Definição do sistema de abastecimento de diesel, determinando o volume a armazenar devido ao tipo de operação e autonomia do sistema",
  "Detalhamento Sala Técnica do Grupo Gerador - Ampliação, Corte, Elevação",
  "Validação da tubulação de escape dos geradores",
  "Validação de acústica do sistema"
];
const SISTEMA_ENERGIA_CRITICA_ITEMS = [
  "Determinação das cargas a serem alimentadas pelo sistema de energia critica",
  "Cálculo do sistema de cargas criticas",
  "Determinação da Autonomia do Sistema Ininterrupto de Energia",
  "Detalhamento da Área Técnica das UPS e baterias - Ampliação, Corte, Detalhamento, Notas",
  "Descrição da forma de funcionamento das UPS´s e redundâncias em caso de falha.",
  "Indicação dos bancos de bateria e interligações."
];
const DIAGRAMAS_MT_ITEMS = [
  "Indicação dos alimentadores de entrada de energia e das subestações, validando corrente, bitola dos cabos e seletividade dos disjuntores",
  "Indicação dos relés de proteção, tc´s, tp´s",
  "Botoeira ou comando junto a central de alarme de incêndio para desligamento do sistema no caso de sinistro",
  "Definição do conceito de alimentação independente das cargas de incêndio",
  "Indicação das classes de tensões e corrente de curto circuito dos equipamentos - Cubículos, Chaves Seccionadoras e Proteções",
  "Intertravamentos entre proteções de MT/MT",
  "Validação dos dados técnicos dos transformadores (Tensões de entrada e saída, potência, isolação, classe de tensão, alarme e desligamento de energia, com ventilação ou não e IP)",
  "Indicação de No-Break, Retificadores para alimentações dos circuitos de comando",
  "Compatibilização dos pontos previstos para automação junto aos quadros elétricos, definindo limite de fornecimento"
];
const DIAGRAMAS_BT_ITEMS = [
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
];
const DIAGRAMAS_ILUMINACAO_ITENS = [
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
];
const DIAGRAMAS_BOMBAS_MOTORES_ITEMS = [
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
];
const DISTRIBUICAO_ALIMENTADORES_ITEMS = [
  "Dimensionamento da Infraestrutura de Alimentadores em Planta ( Eletrocalha, Leitos, Eletrodutos)",
  "Dimensionamento de Caixa de Passagem - Alimentadores",
  "Validação dos pontos de força de processo e Ar-Condicionado",
  "Validação dos pontos de força para sistemas especiais conforme projeto especifico",
  "Validação dos quadros de bombas conforme projeto hidráulico e de incêndio",
  "Validação dos pontos de força exigidos pelo cliente, detalhando as tomadas específicas solicitadas ou os pontos de força",
  "Indicações dos TAG´s de alimentadores em planta",
  "Representação do layout em planta e detalhe ampliado, apresentando cotas, furações em laje, cortes, vistas de todos os shaft´s diferentes",
  "Esquema vertical representando os quadros e alimentadores."
];
const DISTRIBUICAO_TOMADAS_ILUMINACAO_ITEMS = [
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
];
const TENSOES_ATERRAMENTOS_ITEMS = [
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
];
const DEFAULT_ELETRICA_ITEMS = [
  ...MEMORIAL_DESCRITIVO_ITEMS.map(desc => ({ secao: "Memorial Descritivo", descricao: desc })),
  ...ENTRADA_ENERGIA_ITEMS.map(desc => ({ secao: "Entrada de Energia", descricao: desc })),
  ...GERACAO_ENERGIA_AUTO_ITEMS.map(desc => ({ secao: "Sistema de Geração de Energia Autonoma", descricao: desc })),
  ...SISTEMA_ENERGIA_CRITICA_ITEMS.map(desc => ({ secao: "Sistema de Energia Ininterrupta (UPS) - Cargas Críticas", descricao: desc })),
  ...DIAGRAMAS_MT_ITEMS.map(desc => ({ secao: "Diagramas Gerais de Média Tensão", descricao: desc })),
  ...DIAGRAMAS_BT_ITEMS.map(desc => ({ secao: "Diagramas Gerais de Baixa Tensão", descricao: desc })),
  ...DIAGRAMAS_ILUMINACAO_ITENS.map(desc => ({ secao: "Diagramas de Iluminação e Tomadas", descricao: desc })),
  ...DIAGRAMAS_BOMBAS_MOTORES_ITEMS.map(desc => ({ secao: "Diagramas de Bombas e Motores", descricao: desc })),
  ...DISTRIBUICAO_ALIMENTADORES_ITEMS.map(desc => ({ secao: "Distribuição de Energia - Alimentadores", descricao: desc })),
  ...DISTRIBUICAO_TOMADAS_ILUMINACAO_ITEMS.map(desc => ({ secao: "Distribuição de Tomadas, iluminações Normais e Emergência", descricao: desc })),
  ...TENSOES_ATERRAMENTOS_ITEMS.map(desc => ({ secao: "Sistema de Proteção Contra Descarga Atmosférica e Aterramentos", descricao: desc }))
];
const INCENDIO_MEMORIAL_ITEMS = [
  "Descrição técnica dos conceitos e parametros utilizados na conceituação dos projetos para redes de hidrantes.",
  "Descrição técnica dos conceitos e parametros utilizados na conceituação dos projetos para chuveiros automáticos.",
  "Descrição técnica dos conceitos e parametros utilizados na conceituação dos projetos para redes de extintores.",
  "Validação do conceito de atendimento do projeto conforme legislação local, NFPA ou FM Global.",
  "Apresentação das normas técnicas.",
  "Apresentação das boas praticas de instalações a serem observadas pela instaladora.",
  "Indicação no memorial dos chuveiros sobressalentes em estoque e chave para retirada dos chuveiros",
  "Descrição dos testes e comissionamentos exigidos para cada instalação, bem como documentos a serem entregues pela instaladora ao final da obra.",
  "Apresentação de projeto As Built, prevendo o acompanhamento das mudanças para validação do mesmo ao final da obra.",
  "Nota de acompanhamento do processo junto ao corpo de bombeiros local pela instaladora até a ligação final da obra.",
  "Critérios para acústica e vibração nas salas técnicas e tubulações",
  "Critérios para compartimentação de ambientes nos trechos de passagem das instalações e áreas técnicas",
  "Validação dos cálculos de volume do reservatório de incêndio",
  "Especificação técnicas de tubulações, conexões, válvulas, redutoras, registros, suportações e afins para as redes de hidrantes",
  "Especificação técnicas de tubulações, conexões, válvulas, redutoras, registros, suportações e afins para as redes de chuveiros automáticos",
  "Especificação técnicas de extintores em geral",
  "Especificação para sistemas de bombeamento para hidrantes e chuveiros automáticos",
  "Especificação de pintura e sinalizações das tubulações",
  "Compatibilização dos equipamentos que possuirão interface com automação, determinando os protocolos utilizados e os dados disponíveis para gerenciamento.",
  "Lista de Fornecedores - VENDOR LIST",
  "Suportações e fixações"
];
const INCENDIO_INSTALACOES_HIDRANTES_ITEMS = [
  "Validação das áreas de cobertura por hidrantes bem como os tipos de hidrantes adotados",
  "Definição do posicionamento dos hidrantes nos pavimentos respeitando a distância mínima do acesso principal e do raio de cobertura de cada hidrante",
  "Definição do registro de recalque locado junto a implantação do empreendimento",
  "Definição das zonas de pressão para atendimento da rede de hidrantes",
  "Validação da pressão no ponto mais desfavorável e no ponto mais favorável.",
  "Detalhamento das casas de bombas indicando os tamanhos reais das bombas, bem como a indicação de todos os equipamentos, válvulas, registros, juntas antivibratórias, cabeçotes de teste e conjunto de automação.",
  "Detalhamento em planta ou corte das tubulações que compõem os reservatórios com indicação das alturas da conexões, para recalque, sucção, vasos comunicantes.",
  "Detalhamento em planta e corte dos shafts de distribuição, apresentando detalhamento da prumada, hidrante, VRP (quando aplicável) e pontos de inspeção para acesso ao shaft",
  "Validação das redes de distribuição em esquema vertical, indicando os diâmetros de cada trecho e as indicações de prumadas",
  "Consideração de proteção mecânica nos trechos de descida de tubulações aparentes",
  "Vista isométrica com o dimensionamento das tubulações",
  "Detalhes das suportações",
  "Validação com automação as interfaces entre válvulas de bloqueio e bombas que serão monitorados"
];
const INCENDIO_INSTALACOES_SPRINKLERS_ITEMS = [
  "Validação dos riscos adotados, áreas de cobertura dos chuveiros por risco e tipos de chuveiros adotados",
  "Definição do posicionamento dos chuveiros automáticos nos pavimentos, respeitando a distância mínima e máxima entre chuveiros e entre paredes.",
  "Análise de obstruções de chuveiros em ambientes sem forro",
  "Validação de necessidade de áreas com chuveiros no entreforro",
  "Definição do registro de recalque locado junto a implantação do empreendimento",
  "Definição das zonas de pressão para atendimento da rede de chuveiros automáticos",
  "Definição do conceito de VGA's e controles setoriais respeitando área máxima de cobertura por pavimento das VGA's",
  "Detalhamento das casas de bombas indicando os tamanhos reais das bombas, bem como a indicação de todos os equipamentos, válvulas, registros, juntas antivibratórias, cabeçotes de teste e conjunto de automação.",
  "Detalhamento da sucção do sistema de incêndio no reservatório, representando dispositivo anti vórtice ou poço de captação",
  "Detalhamento em planta ou corte das tubulações que compõem os reservatórios com indicação das alturas da conexões, para recalque, sucção, vasos comunicantes.",
  "Validação das redes de distribuição em esquema vertical, indicando os diâmetros de cada trecho e as indicações de prumadas",
  "Validação das redes de distribuição nas plantas, indicando os diâmetros e cotas de instalação",
  "Detalhes de instalações dos tipos de chuveiros propostos.",
  "Detalhes das suportações",
  "Validação com automação as interfaces entre válvulas de bloqueio e medidores que serão monitorados"
];
const INCENDIO_INSTALACOES_EXTINTORES_ITEMS = [
  "Validação de extintor a 5 metros do acesso principal dos pavimentos e áreas de risco, bem como área de cobertura individual.",
  "Instalação de no mínimo 2 unidades extintoras por pavimento, sendo 1 A e outra B ou C, ou duas ABC",
  "Instalação de extintores do tipo C em casa de caldeira, casa de bombas, casa de força elétrica, casa máquinas, elevador (casa de máquinas), ponte rolante, escada rolante (casa de máquinas), salas de telefonia, gases ou líquidos combustíveis ou inflamáveis e outros riscos semelhantes. Instalados do lado externo.",
  "Instalação de extintores sobre rodas para heliponto e área de tanque de óleo diesel",
  "Detalhamento de instalação dos extintores portáteis com altura máxima da alça de 160cm do piso e do fundo de no mínimo 10cm."
];
const DEFAULT_INCENDIO_ITEMS = [
  ...INCENDIO_MEMORIAL_ITEMS.map(desc => ({ secao: "Memorial Descritivo", descricao: desc })),
  ...INCENDIO_INSTALACOES_HIDRANTES_ITEMS.map(desc => ({ secao: "Instalações de Hidrantes", descricao: desc })),
  ...INCENDIO_INSTALACOES_SPRINKLERS_ITEMS.map(desc => ({ secao: "Instalações de Sprinklers", descricao: desc })),
  ...INCENDIO_INSTALACOES_EXTINTORES_ITEMS.map(desc => ({ secao: "Instalações de Extintores", descricao: desc }))
];
const CHECKLIST_TEMPLATES = [
  {
    key: "eletrica",
    label: "Check List - ELE C",
    disciplina: "Elétrica",
    section: "1",
    description: "Documentação técnica e memorial descritivo de Elétrica.",
    defaultItems: DEFAULT_ELETRICA_ITEMS
  },
  {
    key: "hidraulica",
    label: "Check List - HID C",
    disciplina: "Hidráulica",
    section: "2",
    description: "Checklist de cálculos, testes e layout hidrossanitário."
  },
  {
    key: "hvac",
    label: "Check List - HVAC C",
    disciplina: "HVAC",
    section: "3",
    description: "Coleta de dados de climatização e ventilação."
  },
  {
    key: "incendio",
    label: "Check List - INC C",
    disciplina: "Prevenção de Incêndio",
    section: "4",
    description: "Itens referentes à proteção contra incêndio.",
    defaultItems: DEFAULT_INCENDIO_ITEMS
  }
];
/**
 * @typedef {typeof CHECKLIST_TEMPLATES[number]} ChecklistTemplate
 */

/**
 * @typedef {Object} ChecklistItem
 * @property {string} descricao
 * @property {string} status
 * @property {string} conclusao
 * @property {string} tempo
 * @property {string[]} folhas
 * @property {string} observacao
 * @property {string} secao
 * @property {string} contribuicao
 * @property {string} numero_item
 * @property {number} [ordem]
 * @property {number|null} [id]
 */

/**
 * @typedef {ChecklistTemplate & {
 *   titulo: string;
 *   etapa: string;
 *   responsavel: string;
 *   referencia: string;
 *   data: string;
 *   itens: ChecklistItem[];
 *   observacoes: string;
 *   periodo_inicio: string;
 *   periodo_termino: string;
 *   status: string;
 *   savedChecklistId: number|null;
 *   hasSavedRecord: boolean;
 *   cliente?: string;
 *   numero?: string;
 *   periodos?: any[];
 *   responsavel_id?: number|null;
 *   responsavel_nome?: string;
 *   empreendimento_id?: number|null;
 * }} ChecklistState
 */

const STATUS_OPTIONS = [
  { value: "em_andamento", label: "Em andamento", shortLabel: "E" },
  { value: "aguardando", label: "Aguardando", shortLabel: "A" },
  { value: "documentacao", label: "Documentação", shortLabel: "D" },
  { value: "pendente", label: "Pendente", shortLabel: "P" },
  { value: "concluido", label: "Concluído", shortLabel: "C" }
];
const FOLHA_STATUS_OPTIONS = [
  { value: "em_andamento", label: "Executado", shortLabel: "E" },
  { value: "pendente", label: "Pendente", shortLabel: "P" },
  { value: "concluido", label: "Concluído", shortLabel: "C" }
];
const STATUS_COLUMNS = STATUS_OPTIONS.map((option) => option.value);
const TOTAL_COLUMNS = 4 + STATUS_COLUMNS.length + 3;
const STATUS_SHORT_LABELS = {
  em_andamento: "E",
  aguardando: "A",
  documentacao: "D",
  pendente: "P",
  concluido: "C"
};

const STATUS_ACTIVE_CLASSES = {
  pendente: "bg-white text-gray-900 border-gray-500 shadow-inner",
  em_andamento: "bg-white text-gray-900 border-gray-500 shadow-inner",
  concluido: "bg-white text-gray-900 border-gray-500 shadow-inner",
  aguardando: "bg-white text-gray-900 border-gray-500 shadow-inner",
  documentacao: "bg-white text-gray-900 border-gray-500 shadow-inner"
};

const createItem = (overrides = {}) => ({
  descricao: "",
  status: "pendente",
  conclusao: "",
  tempo: "",
  folhas: [],
  observacao: "",
  secao: "",
  contribuicao: "",
  numero_item: "",
  ...overrides
});

const FILTER_OPTIONS = CHECKLIST_TEMPLATES.map(({ key, label }) => ({ key, label }));


const DEFAULT_OUTER_CLASS = "min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6";
const DEFAULT_INNER_CLASS = "max-w-[1800px] mx-auto space-y-6";
const DEFAULT_CARD_CLASS = "border-gray-200 shadow-sm";

const SECTION_TITLES = [
  "Memorial Descritivo",
  "Entrada de Energia",
  "Sistema de Geração de Energia Autonoma",
  "Sistema de Energia Ininterrupta (UPS) - Cargas Críticas",
  "Diagramas Gerais de Média Tensão",
  "Diagramas Gerais de Baixa Tensão",
  "Diagramas de Iluminação e Tomadas",
  "Diagramas de Bombas e Motores",
  "Distribuição de Energia - Alimentadores",
  "Distribuição de Tomadas, iluminações Normais e Emergência",
  "Sistema de Proteção Contra Descarga Atmosférica e Aterramentos"
];
const SECTION_PRIORITY = new Map(SECTION_TITLES.map((label, index) => [label, index]));

const AutoResizeTextarea = forwardRef(({ className, value, ...props }, ref) => {
  const textareaRef = useRef(null);

  const setRefs = useCallback(
    (node) => {
      textareaRef.current = node;
      if (!ref) return;
      if (typeof ref === "function") {
        ref(node);
      } else {
        ref.current = node;
      }
    },
    [ref]
  );

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  return (
    <Textarea
      {...props}
      value={value}
      ref={setRefs}
      className={cn("resize-none overflow-hidden", className)}
    />
  );
});
AutoResizeTextarea.displayName = "AutoResizeTextarea";

/** @type {ChecklistState[]} */
const TEMPLATE_BASE = CHECKLIST_TEMPLATES.map((template) => ({
  ...template,
  titulo: template.label,
  etapa: "",
  responsavel: "",
  referencia: "",
  data: "",
  itens: Array.isArray(template.defaultItems)
    ? template.defaultItems.map((item) => createItem(item))
    : [],
  observacoes: "",
  periodo_inicio: "",
  periodo_termino: "",
  status: "em andamento",
  savedChecklistId: null,
  hasSavedRecord: false
}));

/** @type {Map<string, ChecklistState>} */
const TEMPLATE_BASE_BY_KEY = new Map(TEMPLATE_BASE.map((template) => [template.key, template]));

const API_BASE = import.meta.env.VITE_API_URL || '';

function ChecklistCadastroContent({
  outerClassName = DEFAULT_OUTER_CLASS,
  innerClassName = DEFAULT_INNER_CLASS,
  cardClassName = DEFAULT_CARD_CLASS,
  empreendimentoId = null,
  empreendimentoNome = ""
}) {
  const [checklists, setChecklists] = useState(() => TEMPLATE_BASE);
  const [empreendimentosById, setEmpreendimentosById] = useState({});
  const [activeChecklistKey, setActiveChecklistKey] = useState(FILTER_OPTIONS[0]?.key || CHECKLIST_TEMPLATES[0]?.key);
  const [documentos, setDocumentos] = useState([]);
  const uniqueDocumentos = useMemo(() => {
    const seen = new Set();
    return (documentos || []).filter((doc) => {
      if (!doc) return false;
      const label = normalizeComparable(formatDocumentoLabel(doc));
      const key = label || "unknown";
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [documentos]);

  /**
   * @param {any} item
   * @returns {ChecklistItem}
   */
  const mapSavedItemToForm = useCallback((item) => {
    const normalizedFolhas = (() => {
      if (Array.isArray(item.folhas)) return item.folhas;
      if (item.folhas && typeof item.folhas === "object") {
        return Object.values(item.folhas);
      }
      return [];
    })();

    return {
      descricao: item.descricao || "",
      status: item.status || (item.concluido ? "concluido" : "pendente"),
      conclusao: item.conclusao || "",
      tempo: item.tempo || "",
      observacao: item.observacoes || "",
      contribuicao: item.contribuicao || "",
      folhas: normalizedFolhas,
      numero_item: item.numero_item || "",
      secao: item.secao || "",
      id: item.id || null
    };
  }, []);

  const loadSavedChecklists = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/checklists`);
      if (!response.ok) {
        console.error('Falha ao carregar checklists salvos', await response.text());
        return;
      }
      const data = await response.json();
      const savedItemsByTemplate = new Map();
    await Promise.all(
      (data || []).map(async (checklist) => {
        const template = CHECKLIST_TEMPLATES.find(t => t.label === checklist.tipo);
        const templateKey = template?.key || checklist.section || "eletrica";
        if (savedItemsByTemplate.has(templateKey)) return;
        const itemsRes = await fetch(`${API_BASE}/api/checklist_items?checklist_id=${checklist.id}`);
        const itensRaw = itemsRes.ok ? await itemsRes.json() : [];
        const fallbackTemplate = TEMPLATE_BASE_BY_KEY.get(templateKey);
        const savedItems = Array.isArray(itensRaw) ? itensRaw.map(mapSavedItemToForm) : [];
        savedItemsByTemplate.set(templateKey, {
          ...(fallbackTemplate || {}),
          key: templateKey,
          savedChecklistId: checklist.id,
          titulo: checklist.tipo || fallbackTemplate?.titulo || checklist.titulo || "",
          responsavel: checklist.tecnico_responsavel || fallbackTemplate?.responsavel || "",
          etapa: checklist.etapa || fallbackTemplate?.etapa || "",
          referencia: checklist.numero_os || fallbackTemplate?.referencia || "",
          empreendimento_id: checklist.empreendimento_id || fallbackTemplate?.empreendimento_id || empreendimentoId || null,
          status: checklist.status || fallbackTemplate?.status || "",
          data: checklist.data_entrega || fallbackTemplate?.data || "",
          observacoes: checklist.observacoes || fallbackTemplate?.observacoes || "",
          periodo_inicio: checklist.periodo_inicio || fallbackTemplate?.periodo_inicio || "",
          periodo_termino: checklist.periodo_termino || fallbackTemplate?.periodo_termino || "",
          itens: savedItems,
          hasSavedRecord: savedItems.length > 0
        });
      })
    );
    const finalList = CHECKLIST_TEMPLATES.map(template => {
      if (savedItemsByTemplate.has(template.key)) {
        return savedItemsByTemplate.get(template.key);
      }
      return TEMPLATE_BASE_BY_KEY.get(template.key) || template;
    });
    setChecklists(finalList);
    } catch (err) {
      console.error('Erro ao carregar checklists salvos', err);
    }
  }, [mapSavedItemToForm, empreendimentoId]);

  useEffect(() => {
    loadSavedChecklists();
  }, [loadSavedChecklists]);

  useEffect(() => {
    if (!empreendimentoId) return;
    setChecklists((prev) =>
      prev.map((checklist) =>
        checklist.empreendimento_id ? checklist : { ...checklist, empreendimento_id: empreendimentoId }
      )
    );
  }, [empreendimentoId]);

  useEffect(() => {
    if (!empreendimentoNome) return;
    setChecklists((prev) =>
      prev.map((checklist) =>
        checklist.referencia
          ? checklist
          : { ...checklist, referencia: empreendimentoNome }
      )
    );
  }, [empreendimentoNome]);

  useEffect(() => {
    const needsCliente = checklists.some((checklist) => !checklist.referencia && checklist.cliente);
    if (!needsCliente) return;
    setChecklists((prev) =>
      prev.map((checklist) => {
        if (checklist.referencia || !checklist.cliente) return checklist;
        return { ...checklist, referencia: checklist.cliente };
      })
    );
  }, [checklists]);

  useEffect(() => {
    let cancelled = false;
    const loadEmpreendimentos = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/empreendimentos`);
        if (!response.ok) {
          console.error('Falha ao carregar empreendimentos', await response.text());
          return;
        }
        const data = await response.json();
        if (cancelled) return;
        const map = {};
        (data || []).forEach((empreendimento) => {
          if (!empreendimento || empreendimento.id == null) return;
          map[String(empreendimento.id)] = empreendimento;
        });
        setEmpreendimentosById(map);
      } catch (err) {
        console.error('Falha ao carregar empreendimentos', err);
      }
    };

    loadEmpreendimentos();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!Object.keys(empreendimentosById).length) return;
    const needsUpdate = checklists.some((checklist) => {
      if (checklist.referencia) return false;
      const key = checklist.empreendimento_id == null ? null : String(checklist.empreendimento_id);
      return key && empreendimentosById[key]?.nome;
    });
    if (!needsUpdate) return;
    setChecklists((prev) =>
      prev.map((checklist) => {
        if (checklist.referencia) return checklist;
        const key = checklist.empreendimento_id == null ? null : String(checklist.empreendimento_id);
        const emp = key ? empreendimentosById[key] : null;
        if (!emp?.nome) return checklist;
        return { ...checklist, referencia: emp.nome };
      })
    );
  }, [checklists, empreendimentosById]);

  useEffect(() => {
    if (!empreendimentoId) {
      setDocumentos([]);
      return;
    }
    let cancelled = false;
    retryWithBackoff(
      () => Documento.filter({ empreendimento_id: empreendimentoId }),
      3,
      1000,
      'loadChecklistDocumentos'
    )
      .then((docs) => {
        if (cancelled) return;
        const sorted = (docs || []).slice().sort((a, b) => {
          const keyA = normalizeComparable(a.numero || a.arquivo || a.titulo || "");
          const keyB = normalizeComparable(b.numero || b.arquivo || b.titulo || "");
          if (keyA === keyB) {
            return Number(a.id || 0) - Number(b.id || 0);
          }
          return keyA.localeCompare(keyB, "pt-BR", { numeric: true, sensitivity: "base" });
        });
        setDocumentos(sorted);
      })
      .catch((err) => {
        console.error("Erro ao carregar documentos do checklist", err);
      });
    return () => {
      cancelled = true;
    };
  }, [empreendimentoId]);

  const ensureFolhasLength = (folhas = [], length = 0) => {
    const arr = Array.isArray(folhas) ? [...folhas] : [];
    while (arr.length < length) {
      arr.push("");
    }
    return arr;
  };

  const handleFieldChange = (key, field, value) => {
    setChecklists((prev) =>
      prev.map((checklist) =>
        checklist.key === key
          ? { ...checklist, [field]: value }
          : checklist
      )
    );
  };

  const handleItemChange = (key, index, field, value) => {
    setChecklists((prev) =>
      prev.map((checklist) => {
        if (checklist.key !== key) return checklist;
        const itens = [...checklist.itens];
        itens[index] = { ...itens[index], [field]: value };
        return { ...checklist, itens };
      })
    );
  };

  const FOLHA_STATUS_ORDER = ["", "em_andamento", "pendente", "concluido"];
  const getNextFolhaStatus = (current) => {
    const idx = FOLHA_STATUS_ORDER.indexOf(current);
    const nextIdx = idx === -1 ? 1 : (idx + 1) % FOLHA_STATUS_ORDER.length;
    return FOLHA_STATUS_ORDER[nextIdx];
  };

  const handleFolhaStatusToggle = (key, index, folhaIndex, totalFolhas = 0) => {
    setChecklists((prev) =>
      prev.map((checklist) => {
        if (checklist.key !== key) return checklist;
        const itens = [...checklist.itens];
        const folhas = ensureFolhasLength(itens[index].folhas, totalFolhas);
        folhas[folhaIndex] = getNextFolhaStatus(folhas[folhaIndex]);
        itens[index] = { ...itens[index], folhas };
        return { ...checklist, itens };
      })
    );
  };

  const handleAddItem = (key) => {
    setChecklists((prev) =>
      prev.map((checklist) =>
        checklist.key === key
          ? {
              ...checklist,
              itens: [
                ...checklist.itens,
                createItem({
                  numero_item: `${checklist.section || checklist.key}.${checklist.itens.length + 1}`
                })
              ]
            }
          : checklist
      )
    );
  };

  const handleRemoveItem = async (key, index) => {
    /** @type {ChecklistItem|null} */
    let removedItem = null;
    setChecklists((prev) =>
      prev.map((checklist) => {
        if (checklist.key !== key) return checklist;
        if (checklist.itens.length === 1) return checklist;
        removedItem = checklist.itens[index];
        const itens = checklist.itens.filter((_, idx) => idx !== index);
        return { ...checklist, itens };
      })
    );
    if (removedItem?.id) {
      try {
        await fetch(`${API_BASE}/api/checklist_items/${removedItem.id}`, { method: "DELETE" });
      } catch (err) {
        console.error("Erro ao excluir item do checklist", err);
      }
    }
  };

  const [isSavingChecklist, setIsSavingChecklist] = useState(false);

  const deleteExistingItems = async (checklistId) => {
    const response = await fetch(`${API_BASE}/api/checklist_items?checklist_id=${checklistId}`);
    if (!response.ok) return;
    const items = await response.json();
    await Promise.all(
      (items || []).map((item) =>
        fetch(`${API_BASE}/api/checklist_items/${item.id}`, {
          method: 'DELETE'
        })
      )
    );
  };

  const handleSubmit = async (key) => {
    const checklist = checklists.find((item) => item.key === key);
    if (!checklist) return;

    if (isSavingChecklist) return;
    setIsSavingChecklist(true);
    try {
      const response = await fetch(`${API_BASE}/api/checklists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: checklist.titulo,
          cliente: checklist.cliente || '',
          numero_os: checklist.numero || '',
          tecnico_responsavel: checklist.responsavel || '',
          data_entrega: checklist.data || null,
          periodo_inicio: checklist.periodo_inicio || null,
          periodo_termino: checklist.periodo_termino || null,
          status: checklist.status || 'em_andamento',
          etapa: checklist.etapa || '',
          referencia: checklist.referencia || '',
          periodos: checklist.periodos || [],
          observacoes: checklist.observacoes || '',
          responsavel_id: checklist.responsavel_id || null,
          responsavel_nome: checklist.responsavel || '',
          empreendimento_id: checklist.empreendimento_id || null
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Erro ao salvar checklist');
      }

      const savedChecklist = await response.json();

      if (Array.isArray(checklist.itens) && checklist.itens.length > 0) {
        await deleteExistingItems(savedChecklist.id);
        await Promise.all(
          checklist.itens.map((item, index) =>
            fetch(`${API_BASE}/api/checklist_items`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                checklist_id: savedChecklist.id,
                secao: checklist.section,
                numero_item: `${checklist.section || '0'}.${index + 1}`,
                descricao: item.descricao,
                tempo: item.tempo,
                observacoes: item.observacao,
                contribuicao: item.contribuicao || '',
                ordem: index + 1,
                concluido: item.status === 'concluido',
                status: item.status || 'pendente',
                conclusao: item.conclusao || '',
                folhas: item.folhas || [],
                responsavel_nome: checklist.responsavel || ''
              })
            })
          )
        );
      }

      await loadSavedChecklists();
      alert(`Checklist "${checklist.titulo}" salvo no banco.`);
    } catch (error) {
      console.error('Erro ao salvar checklist', error);
      alert('Não foi possível salvar o checklist: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setIsSavingChecklist(false);
    }
  };

  return (
    <div className={outerClassName}>
      <div className={innerClassName}>
        <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-semibold text-gray-900">Check-List</h1>
        </div>
          <p className="text-gray-600 max-w-3xl">
            Preencha as informações de cadastro relacionadas aos templates de Check List
            que você carrega via planilhas (ELE C, HID C, HVAC C e INC C). Você pode manter várias
            etapas, responsáveis e itens documentados por disciplina.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FILTER_OPTIONS.map(option => (
            <button
              key={option.key}
              type="button"
              onClick={() => setActiveChecklistKey(option.key)}
              className={`px-4 py-2 text-sm font-medium rounded-full border transition ${
                activeChecklistKey === option.key
                  ? "bg-white text-blue-600 border-blue-500 shadow"
                  : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div
          className={`grid gap-6 ${
            activeChecklistKey === "todos" ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-1"
          }`}
        >
          {checklists
            .filter((checklist) => checklist.key === activeChecklistKey)
            .map((checklist) => (
            <Card key={checklist.key} className={cardClassName}>
            <CardHeader className="gap-2">
              <div className="flex flex-col">
                <CardTitle className="text-lg flex items-center gap-2">
                  {checklist.titulo}
                  <Badge variant="outline">{checklist.disciplina}</Badge>
                </CardTitle>
                <p className="text-sm text-gray-500">{checklist.description}</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    placeholder="Título do Checklist"
                    value={checklist.titulo}
                    onChange={(e) =>
                      handleFieldChange(checklist.key, "titulo", e.target.value)
                    }
                  />
                  <Input
                    placeholder="Etapa ou fase"
                    value={checklist.etapa}
                    onChange={(e) =>
                      handleFieldChange(checklist.key, "etapa", e.target.value)
                    }
                  />
                  <Input
                    placeholder="Responsável"
                    value={checklist.responsavel}
                    onChange={(e) =>
                      handleFieldChange(checklist.key, "responsavel", e.target.value)
                    }
                  />
                  <Input
                    placeholder="Referência (ex: OS / Projeto)"
                    value={checklist.referencia}
                    onChange={(e) =>
                      handleFieldChange(checklist.key, "referencia", e.target.value)
                    }
                  />
                  <Input
                    type="date"
                    placeholder="Data prevista"
                    value={checklist.data}
                    onChange={(e) =>
                      handleFieldChange(checklist.key, "data", e.target.value)
                    }
                  />
                </div>

                <div className="overflow-auto border rounded-lg border-gray-200 bg-white">
                  <table className="min-w-full text-sm divide-y divide-gray-200">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="px-3 py-3 text-left font-semibold">Item</th>
                        <th className="px-3 py-3 text-left font-semibold">Descrição</th>
                        <th className="px-3 py-3 text-left font-semibold">Conclusão (%)</th>
                        <th className="px-3 py-3 text-left font-semibold">Tempo (dias)</th>
                        <th
                          className="px-3 py-3 text-left font-semibold"
                          colSpan={STATUS_COLUMNS.length}
                        >
                          Status
                        </th>
                        <th className="px-3 py-3 text-left font-semibold">Folhas</th>
                        <th className="px-3 py-3 text-left font-semibold">Observação</th>
                        <th className="px-3 py-3 text-left font-semibold"></th>
                      </tr>
                      <tr className="bg-gray-50">
                        <th colSpan="4" className="border"></th>
                        {STATUS_OPTIONS.map((option) => (
                          <th
                            key={option.value}
                            className="px-2 py-2 border text-center text-xs font-semibold uppercase tracking-wide text-gray-500"
                          >
                            {STATUS_SHORT_LABELS[option.value] || option.label.charAt(0)}
                          </th>
                        ))}
                        <th className="border"></th>
                        <th className="border"></th>
                        <th className="border"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(() => {
                        const fallbackTemplate = TEMPLATE_BASE.find(base => base.key === checklist.key);
                        const displayItems = (checklist.itens && checklist.itens.length > 0)
                          ? checklist.itens
                          : (!checklist.hasSavedRecord ? (fallbackTemplate?.itens || []) : []);
                        const itemsWithIndexes = displayItems.map((item, idx) => ({ item, originalIndex: idx }));
                        const rows = [];
                        const sorted = [...itemsWithIndexes].sort((a, b) => {
                          const sectionA = String(a.item.secao || checklist.disciplina || checklist.section || "").trim();
                          const sectionB = String(b.item.secao || checklist.disciplina || checklist.section || "").trim();
                          const priorityA = SECTION_PRIORITY.has(sectionA) ? SECTION_PRIORITY.get(sectionA) : Number.MAX_SAFE_INTEGER;
                          const priorityB = SECTION_PRIORITY.has(sectionB) ? SECTION_PRIORITY.get(sectionB) : Number.MAX_SAFE_INTEGER;
                          if (priorityA !== priorityB) return priorityA - priorityB;
                          const ordemA = Number.isFinite(Number(a.item.ordem)) ? Number(a.item.ordem) : Number.MAX_SAFE_INTEGER;
                          const ordemB = Number.isFinite(Number(b.item.ordem)) ? Number(b.item.ordem) : Number.MAX_SAFE_INTEGER;
                          if (ordemA !== ordemB) return ordemA - ordemB;
                          if (a.item.numero_item && b.item.numero_item) {
                            return a.item.numero_item.localeCompare(b.item.numero_item, undefined, { numeric: true });
                          }
                          return 0;
                        });
                        const sectionsAdded = new Set();
                        sorted.forEach((rowItem, index) => {
                          const item = rowItem.item;
                           const section = String(item.secao || checklist.disciplina || checklist.section || "Geral").trim();
                          if (section && !sectionsAdded.has(section)) {
                            sectionsAdded.add(section);
                            rows.push({ type: "section", section, key: `${checklist.key}-section-${section}` });
                          }
                          rows.push({ type: "item", item, index, originalIndex: rowItem.originalIndex });
                        });
                        return rows.map((row) => {
                          if (row.type === "section") {
                            return (
                              <tr key={row.key}>
                                <td
                                  colSpan={TOTAL_COLUMNS}
                                  className="bg-gray-100 px-3 py-2 text-xs font-semibold uppercase text-gray-500"
                                >
                                  {row.section}
                                </td>
                              </tr>
                            );
                          }
                      const { item, index } = row;
                      const visibleDocumentos = uniqueDocumentos;
                          const itemLabel = `${checklist.section || checklist.key}.${index + 1}`;
                          return (
                          <tr key={`${checklist.key}-${item.numero_item || index}`}>
                            <td className="px-3 py-2 text-xs font-medium text-gray-600">
                              {item.numero_item || itemLabel}
                            </td>
                            <td className="px-3 py-2">
                              <AutoResizeTextarea
                                className="min-h-[120px]"
                                placeholder="Descrição da verificação"
                                value={item.descricao}
                                onChange={(e) =>
                                    handleItemChange(
                                      checklist.key,
                                      row.originalIndex,
                                      "descricao",
                                      e.target.value
                                    )
                                }
                              />
                            </td>
                            <td className="px-3 py-2 w-24">
                              <Input
                                className="h-10 text-right"
                                type="number"
                                min="0"
                                max="100"
                                placeholder="%"
                                value={item.conclusao}
                                onChange={(e) =>
                                      handleItemChange(
                                        checklist.key,
                                        row.originalIndex,
                                        "conclusao",
                                        e.target.value
                                  )
                                }
                              />
                            </td>
                            <td className="px-3 py-2 w-24">
                              <Input
                                className="h-10 text-right"
                                type="number"
                                min="0"
                                placeholder="dias"
                                value={item.tempo}
                                onChange={(e) =>
                                    handleItemChange(checklist.key, row.originalIndex, "tempo", e.target.value)
                                }
                              />
                            </td>
                            {STATUS_OPTIONS.map((option) => {
                              const isActiveStatus = item.status === option.value;
                              const activeClasses =
                                STATUS_ACTIVE_CLASSES[option.value] ||
                                "bg-blue-600 text-white border-blue-600";
                              return (
                                <td key={option.value} className="px-1 py-2 text-center">
                                  <button
                                    type="button"
                                    className={`px-2 py-1 rounded-md text-xs font-semibold border transition ${
                                      isActiveStatus
                                        ? activeClasses
                                        : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
                                    }`}
                                    onClick={() =>
                                      handleItemChange(
                                        checklist.key,
                                        row.originalIndex,
                                        "status",
                                        option.value
                                      )
                                    }
                                    title={option.label}
                                  >
                                    {STATUS_SHORT_LABELS[option.value] || option.label.charAt(0)}
                                  </button>
                                </td>
                              );
                            })}
                            <td className="px-3 py-2 align-top">
                              {visibleDocumentos.length === 0 ? (
                                <div className="text-xs text-gray-500">
                                  Nenhum documento disponível para esta disciplina.
                                </div>
                              ) : (
                                <div
                                  className="grid gap-1"
                                  style={{
                                    gridTemplateColumns: "repeat(auto-fit, minmax(72px, 1fr))",
                                    maxHeight: "220px",
                                    overflowY: "auto",
                                    paddingRight: "4px"
                                  }}
                                >
                                  {(() => {
                                    const folhasArray = ensureFolhasLength(
                                      item.folhas,
                                      visibleDocumentos.length
                                    );
                                    return visibleDocumentos.map((doc, folhaIndex) => {
                                      const status = folhasArray[folhaIndex] || "";
                                      const statusOption = FOLHA_STATUS_OPTIONS.find(
                                        (option) => option.value === status
                                      );
                                      const statusLabel =
                                        statusOption?.shortLabel ||
                                        STATUS_SHORT_LABELS[statusOption?.value] ||
                                        statusOption?.label?.charAt(0) ||
                                        "";
                                      const activeClasses =
                                        STATUS_ACTIVE_CLASSES[status] ||
                                        "bg-white text-gray-900 border-gray-300 shadow-inner";
                                      return (
                                        <div
                                          key={doc.id || folhaIndex}
                                          className="flex flex-col items-center gap-1"
                                        >
                                          <button
                                            type="button"
                                            className={`min-h-[40px] w-full rounded-md border px-3 py-2 text-center text-xs font-semibold transition ${activeClasses}`}
                                            onClick={() =>
                                              handleFolhaStatusToggle(
                                                checklist.key,
                                                row.originalIndex,
                                                folhaIndex,
                                                visibleDocumentos.length
                                              )
                                            }
                                            title={doc.arquivo || doc.titulo || formatDocumentoLabel(doc)}
                                          >
                                            {statusLabel || "—"}
                                          </button>
                                          <span className="text-[10px] text-gray-500 text-center">
                                            {formatDocumentoLabel(doc)}
                                          </span>
                                        </div>
                                      );
                                    });
                                  })()}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <AutoResizeTextarea
                                className="min-h-[100px]"
                                placeholder="Observações (opcional)"
                                value={item.observacao}
                                onChange={(e) =>
                                      handleItemChange(
                                        checklist.key,
                                        row.originalIndex,
                                        "observacao",
                                        e.target.value
                                      )
                                }
                              />
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                className="text-red-500 hover:text-red-700 focus-visible:outline-none"
                                onClick={() => handleRemoveItem(checklist.key, row.originalIndex)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                    </tbody>
                  </table>
                  <div className="flex justify-end p-3">
                    <Button
                      variant="outline"
                      className="flex items-center gap-2 mr-2"
                      onClick={() => handleAddItem(checklist.key)}
                    >
                      <Plus className="w-4 h-4" />
                      Adicionar item
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        handleFieldChange(checklist.key, "itens", [createItem()])
                      }
                    >
                      Limpar itens
                    </Button>
                  </div>
                </div>

                <AutoResizeTextarea
                  className="mt-3 min-h-[110px]"
                  placeholder="Observações complementares sobre o checklist"
                  value={checklist.observacoes}
                  onChange={(e) =>
                    handleFieldChange(checklist.key, "observacoes", e.target.value)
                  }
                />

                <div className="flex justify-end gap-2 mt-3">
                  <Button
                    variant="secondary"
                    onClick={() => handleFieldChange(checklist.key, "itens", [createItem()])}
                  >
                    Limpar itens
                  </Button>
                  <Button onClick={() => handleSubmit(checklist.key)}>
                    Salvar formulário
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ChecklistCadastroTab({ empreendimento }) {
  return (
    <ChecklistCadastroContent
      outerClassName="space-y-6"
      innerClassName="space-y-6"
      cardClassName="border border-gray-200 shadow-sm"
      empreendimentoId={empreendimento?.id || null}
      empreendimentoNome={empreendimento?.nome || ""}
    />
  );
}

export default function ChecklistCadastroPage() {
  return <ChecklistCadastroContent />;
}
