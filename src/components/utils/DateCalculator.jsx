import { addDays, isWeekend, format, parseISO, isValid, startOfDay } from 'date-fns';

export const normalizeUnavailableDates = (dates) => {
  const normalized = new Set();
  if (!dates) return normalized;
  const dateValues = Array.isArray(dates) ? dates : [dates];

  dateValues.forEach((item) => {
    if (!item) return;
    if (item instanceof Date) {
      if (isValid(item)) {
        normalized.add(format(item, 'yyyy-MM-dd'));
      }
      return;
    }

    let text = String(item).trim();
    if (!text) return;

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
      const [day, month, year] = text.split('/');
      text = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    const parsed = parseISO(text);
    if (isValid(parsed)) {
      normalized.add(format(parsed, 'yyyy-MM-dd'));
    }
  });

  return normalized;
};

export const isUnavailableDay = (date, unavailableDates = new Set()) => {
  if (!date || !isValid(date) || unavailableDates.size === 0) return false;
  const dayKey = format(date, 'yyyy-MM-dd');
  return unavailableDates.has(dayKey);
};

export const isWorkingDay = (date, unavailableDates = new Set()) => {
  return !isWeekend(date) && !isUnavailableDay(date, unavailableDates);
};

export const getNextWorkingDay = (date, unavailableDates = new Set()) => {
  let nextDay = addDays(date, 1);
  while (!isWorkingDay(nextDay, unavailableDates)) {
    nextDay = addDays(nextDay, 1);
  }
  return nextDay;
};

export const ensureWorkingDay = (date, unavailableDates = new Set()) => {
  let currentDay = new Date(date);
  while (!isWorkingDay(currentDay, unavailableDates)) {
    currentDay = addDays(currentDay, 1);
  }
  return currentDay;
};

export const getNextAvailableDay = (startDate, cargaDiariaExistente = {}, limiteDiario = 8, unavailableDates = new Set()) => {
  let currentDay = ensureWorkingDay(startDate, unavailableDates);
  const maxTentativas = 365;
  let tentativas = 0;

  while (tentativas < maxTentativas) {
    if (isWorkingDay(currentDay, unavailableDates)) {
      const diaKey = format(currentDay, 'yyyy-MM-dd');
      const cargaAtual = cargaDiariaExistente[diaKey] || 0;
      const espacoDisponivel = Math.max(0, limiteDiario - cargaAtual);

      if (espacoDisponivel > 0.01) {
        return currentDay;
      }
    }

    currentDay = addDays(currentDay, 1);
    tentativas++;
  }

  return ensureWorkingDay(startDate, unavailableDates);
};

export const calculateEndDate = (startDate, horasTotais, horasPorDia = 8, unavailableDates = new Set()) => {
  if (!startDate || !isValid(startDate) || horasTotais <= 0) {
    return startDate;
  }

  let dataAtual = new Date(startDate);
  let horasRestantes = horasTotais;

  while (horasRestantes > 0) {
    if (isWorkingDay(dataAtual, unavailableDates)) {
      const horasNoDia = Math.min(horasRestantes, horasPorDia);
      horasRestantes -= horasNoDia;
    }
    
    if (horasRestantes > 0) {
      dataAtual = addDays(dataAtual, 1);
    }
  }

  return dataAtual;
};

export const calcularDataInicioPorPredecessora = (
  predecessorDoc,
  planejamentos = [],
  cargaPrincipalExecutor = {},
  limiteDiario = 8
) => {
  if (!predecessorDoc) {
    return getNextWorkingDay(new Date(), new Set());
  }

  const parseTermino = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    const parsed = parseISO(String(value));
    return isValid(parsed) ? parsed : null;
  };

  let termino = parseTermino(predecessorDoc.termino_planejado);

  if (!termino) {
    const predecessores = (planejamentos || [])
      .filter(p => p.documento_id === predecessorDoc.id && p.termino_planejado)
      .map(p => parseTermino(p.termino_planejado))
      .filter(isValid)
      .sort((a, b) => b.getTime() - a.getTime());

    if (predecessores.length > 0) {
      termino = predecessores[0];
    }
  }

  const unavailableDates = normalizeUnavailableDates(
    predecessorDoc.datas_indisponiveis || predecessorDoc.unavailable_dates || predecessorDoc.feriados || predecessorDoc.ferias || []
  );

  if (!termino) {
    return getNextWorkingDay(new Date(), unavailableDates);
  }

  return getNextWorkingDay(termino, unavailableDates);
};

export const isActivityOverdue = (plano, hoje = new Date()) => {
  try {
    if (!plano || plano.status === 'concluido') {
      return false;
    }

    if (plano.isVirtual) {
      return false;
    }

    const dataTermino = plano.termino_ajustado || plano.termino_planejado;
    
    if (!dataTermino) {
      return false;
    }

    let dataTerminoObj;
    if (typeof dataTermino === 'string') {
      dataTerminoObj = parseISO(dataTermino);
    } else if (dataTermino instanceof Date) {
      dataTerminoObj = dataTermino;
    } else {
      return false;
    }

    if (!isValid(dataTerminoObj)) {
      return false;
    }

    const terminoMidnight = startOfDay(dataTerminoObj);
    const hojeMidnight = startOfDay(hoje);

    return terminoMidnight < hojeMidnight;
  } catch (error) {
    console.error('Erro ao verificar atraso:', error);
    return false;
  }
};

export const distribuirHorasPorDias = (dataInicio, horasTotais, limiteDiario = 8, cargaDiariaExistente = {}, isStrictStartDate = false, unavailableDates = new Set()) => {
  const distribuicao = {};
  const novaCargaDiaria = { ...cargaDiariaExistente };
  
  let dataAtual = ensureWorkingDay(dataInicio, unavailableDates);
  let horasRestantes = Number(horasTotais) || 0;
  horasTotais = horasRestantes;
  let tentativas = 0;
  const maxTentativas = 365;

  if (unavailableDates && unavailableDates.size > 0) {
  }

  while (horasRestantes > 0.01 && tentativas < maxTentativas) {
    tentativas++;
    const diaKey = format(dataAtual, 'yyyy-MM-dd');
    
    if (isWorkingDay(dataAtual, unavailableDates)) {
      const cargaAtual = novaCargaDiaria[diaKey] || 0;
      const espacoDisponivel = Math.max(0, limiteDiario - cargaAtual);


      // Alocar o que couber no dia, respeitando sempre o limite de 8h
      if (espacoDisponivel > 0.01) {
        const horasParaAlocar = Math.min(espacoDisponivel, horasRestantes);
        
        distribuicao[diaKey] = horasParaAlocar;
        novaCargaDiaria[diaKey] = cargaAtual + horasParaAlocar;
        horasRestantes -= horasParaAlocar;
        
      }
    }
    
    dataAtual = addDays(dataAtual, 1);
  }

  if (horasRestantes > 0.01) {
    throw new Error(
      `Não foi possível alocar ${horasRestantes.toFixed(1)}h. ` +
      `Agenda muito carregada nos próximos ${tentativas} dias.`
    );
  }

  const diasDistribuidos = Object.keys(distribuicao).sort();
  const lastDayStr = diasDistribuidos[diasDistribuidos.length - 1];
  const [dyear, dmonth, dday] = lastDayStr.split('-').map(Number);
  const dataTermino = new Date(dyear, dmonth - 1, dday); // local midnight — avoids UTC timezone shift


  return {
    distribuicao,
    dataTermino,
    novaCargaDiaria
  };
};

export const distribuirHorasSimples = (dataInicio, horasTotais, horasPorDia = 8) => {
  const distribuicao = {};
  let dataAtual = typeof dataInicio === 'string' ? parseISO(dataInicio) : new Date(dataInicio);
  let horasRestantes = horasTotais;

  while (horasRestantes > 0) {
    if (isWorkingDay(dataAtual)) {
      const horasNoDia = Math.min(horasRestantes, horasPorDia);
      const diaKey = format(dataAtual, 'yyyy-MM-dd');
      distribuicao[diaKey] = horasNoDia;
      horasRestantes -= horasNoDia;
    }
    
    if (horasRestantes > 0) {
      dataAtual = addDays(dataAtual, 1);
    }
  }

  return {
    distribuicao,
    dataTermino: dataAtual
  };
};