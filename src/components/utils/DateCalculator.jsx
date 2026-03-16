import { addDays, isWeekend, format, parseISO, isValid, startOfDay } from 'date-fns';

export const isWorkingDay = (date) => {
  return !isWeekend(date);
};

export const getNextWorkingDay = (date) => {
  let nextDay = addDays(date, 1);
  while (!isWorkingDay(nextDay)) {
    nextDay = addDays(nextDay, 1);
  }
  return nextDay;
};

export const ensureWorkingDay = (date) => {
  let currentDay = new Date(date);
  while (!isWorkingDay(currentDay)) {
    currentDay = addDays(currentDay, 1);
  }
  return currentDay;
};

export const getNextAvailableDay = (startDate, cargaDiariaExistente = {}, limiteDiario = 8) => {
  let currentDay = ensureWorkingDay(startDate);
  const maxTentativas = 365;
  let tentativas = 0;

  while (tentativas < maxTentativas) {
    if (isWorkingDay(currentDay)) {
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

  return ensureWorkingDay(startDate);
};

export const calculateEndDate = (startDate, horasTotais, horasPorDia = 8) => {
  if (!startDate || !isValid(startDate) || horasTotais <= 0) {
    return startDate;
  }

  let dataAtual = new Date(startDate);
  let horasRestantes = horasTotais;

  while (horasRestantes > 0) {
    if (isWorkingDay(dataAtual)) {
      const horasNoDia = Math.min(horasRestantes, horasPorDia);
      horasRestantes -= horasNoDia;
    }
    
    if (horasRestantes > 0) {
      dataAtual = addDays(dataAtual, 1);
    }
  }

  return dataAtual;
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

export const distribuirHorasPorDias = (dataInicio, horasTotais, limiteDiario = 8, cargaDiariaExistente = {}, isStrictStartDate = false) => {
  const distribuicao = {};
  const novaCargaDiaria = { ...cargaDiariaExistente };
  
  let dataAtual = ensureWorkingDay(dataInicio);
  let horasRestantes = Number(horasTotais) || 0;
  horasTotais = horasRestantes;
  let tentativas = 0;
  const maxTentativas = 365;

  console.log(`\n🔄 [distribuirHorasPorDias] Iniciando distribuição:`);
  console.log(`   Total de horas: ${horasTotais.toFixed(1)}h`);
  console.log(`   Data de início: ${format(dataAtual, 'yyyy-MM-dd')}`);
  console.log(`   Limite diário: ${limiteDiario}h`);
  console.log(`   Modo estrito (manual): ${isStrictStartDate ? 'SIM' : 'NÃO'}`);

  while (horasRestantes > 0.01 && tentativas < maxTentativas) {
    tentativas++;
    const diaKey = format(dataAtual, 'yyyy-MM-dd');
    
    if (isWorkingDay(dataAtual)) {
      const cargaAtual = novaCargaDiaria[diaKey] || 0;
      const espacoDisponivel = Math.max(0, limiteDiario - cargaAtual);

      console.log(`   📅 ${diaKey}: Carga atual ${cargaAtual.toFixed(1)}h, Espaço ${espacoDisponivel.toFixed(1)}h`);

      // Alocar o que couber no dia, respeitando sempre o limite de 8h
      if (espacoDisponivel > 0.01) {
        const horasParaAlocar = Math.min(espacoDisponivel, horasRestantes);
        
        distribuicao[diaKey] = horasParaAlocar;
        novaCargaDiaria[diaKey] = cargaAtual + horasParaAlocar;
        horasRestantes -= horasParaAlocar;
        
        console.log(`   ✅ Alocado: ${horasParaAlocar.toFixed(1)}h → Nova carga: ${(cargaAtual + horasParaAlocar).toFixed(1)}h → Restante: ${horasRestantes.toFixed(1)}h`);
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
  const dataTermino = parseISO(diasDistribuidos[diasDistribuidos.length - 1]); 

  console.log(`\n✅ Distribuição concluída:`);
  console.log(`   Dias utilizados: ${diasDistribuidos.length}`);
  console.log(`   Data término: ${format(dataTermino, 'yyyy-MM-dd')}`);
  console.log(`   Total alocado: ${Object.values(distribuicao).reduce((sum, h) => sum + h, 0).toFixed(1)}h\n`);

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