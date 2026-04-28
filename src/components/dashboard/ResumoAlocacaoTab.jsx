// @ts-nocheck
import React, { useMemo, useState } from 'react';
import { format, addDays, startOfWeek } from "date-fns";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Retorna o identificador curto do empreendimento (número da OS)
// Prioriza: número puro de num_proposta > número extraído do nome > num_proposta > 4 chars do nome
const getOsLabel = (emp) => {
  if (!emp) return null;
  if (emp.num_proposta && /^\d+$/.test(emp.num_proposta.trim())) return emp.num_proposta.trim();
  const match = (emp.nome || '').match(/^(\d+)/);
  if (match) return match[1];
  return emp.num_proposta || (emp.nome || '').substring(0, 4).toUpperCase();
};

const LINHAS = [
  { key: 'previsto',    label: 'Previsto',    bg: 'bg-blue-50',   text: 'text-blue-700',   dot: '#3B82F6' },
  { key: 'programado',  label: 'Programado',  bg: 'bg-green-50',  text: 'text-green-700',  dot: '#10B981' },
  { key: 'realizado',   label: 'Realizado',   bg: 'bg-orange-50', text: 'text-orange-700', dot: '#F97316' },
];

export default function ResumoAlocacaoTab({
  planejamentos = [],
  empreendimentos = [],
  usuarios = [],
  equipes = [],
  osManuais = {},
  weekOffset = 0
}) {
  const [filtroEquipe, setFiltroEquipe] = useState('todas');
  const [filtroUsuario, setFiltroUsuario] = useState('todos');
  const [filtroOS, setFiltroOS] = useState('');
  // Quais linhas mostrar: previsto, programado, realizado
  const [linhasVisiveis, setLinhasVisiveis] = useState({ previsto: true, programado: true, realizado: true });

  const toggleLinha = (key) => setLinhasVisiveis(prev => ({ ...prev, [key]: !prev[key] }));

  const diasExibidos = useMemo(() => {
    const hoje = new Date();
    const inicioSemana = startOfWeek(addDays(hoje, weekOffset * 7), { weekStartsOn: 1 });
    const dias = [];
    for (let i = 0; i < 21; i++) dias.push(addDays(inicioSemana, i));
    return dias;
  }, [weekOffset]);

  const empreendimentosMap = useMemo(() => {
    const map = {};
    empreendimentos.forEach(emp => { map[emp.id] = emp; });
    return map;
  }, [empreendimentos]);

  const equipesMap = useMemo(() => {
    const map = {};
    equipes.forEach(eq => { map[eq.id] = eq; });
    return map;
  }, [equipes]);

  const coresEmpreendimentos = useMemo(() => {
    const cores = ['#3B82F6','#EF4444','#10B981','#F59E0B','#8B5CF6','#EC4899','#06B6D4','#84CC16','#F97316','#6366F1','#14B8A6','#A855F7','#0EA5E9','#22C55E','#E11D48'];
    const map = {};
    empreendimentos.forEach((emp, idx) => { map[emp.id] = cores[idx % cores.length]; });
    return map;
  }, [empreendimentos]);

  // Mapa separado por tipo: email -> { [dataStr]: [{ label, cor, empNome }] }
  const osPorUsuarioDia = useMemo(() => {
    const programado = {};
    const realizado = {};

    planejamentos.forEach(plan => {
      const executor = plan.executor_principal;
      if (!executor) return;

      const emp = empreendimentosMap[plan.empreendimento_id];
      const empNome = emp?.nome || 'Sem Emp.';
      const empCor = coresEmpreendimentos[plan.empreendimento_id] || '#6B7280';
      const label = getOsLabel(emp) || empNome.substring(0, 4).toUpperCase();

      const addTo = (store, dataStr) => {
        if (!store[executor]) store[executor] = {};
        if (!store[executor][dataStr]) store[executor][dataStr] = [];
        if (!store[executor][dataStr].find(i => i.label === label)) {
          store[executor][dataStr].push({ label, cor: empCor, empNome });
        }
      };

      if (plan.horas_por_dia && typeof plan.horas_por_dia === 'object') {
        Object.entries(plan.horas_por_dia).forEach(([dataStr, horas]) => {
          if (Number(horas) > 0) addTo(programado, dataStr);
        });
      }
      if (plan.horas_executadas_por_dia && typeof plan.horas_executadas_por_dia === 'object') {
        Object.entries(plan.horas_executadas_por_dia).forEach(([dataStr, horas]) => {
          if (Number(horas) > 0) addTo(realizado, dataStr);
        });
      }
    });

    // Previsto = OS manuais
    const previsto = {};
    Object.entries(osManuais).forEach(([email, diasMap]) => {
      if (!previsto[email]) previsto[email] = {};
      Object.entries(diasMap).forEach(([dataStr, items]) => {
        if (!previsto[email][dataStr]) previsto[email][dataStr] = [];
        items.forEach(item => {
          if (!previsto[email][dataStr].find(i => i.label === item.label)) {
            previsto[email][dataStr].push({ label: item.label, cor: item.cor || '#6B7280', empNome: item.empNome });
          }
        });
      });
    });

    return { previsto, programado, realizado };
  }, [planejamentos, empreendimentosMap, coresEmpreendimentos, osManuais]);

  const usuariosPorEquipe = useMemo(() => {
    const grupos = {};
    usuarios.forEach(user => {
      if (!user.nome && !user.full_name) return;
      if (user.status === 'inativo') return;
      let nomeEquipe = 'Sem Equipe';
      if (user.equipe_id && equipesMap[user.equipe_id]) nomeEquipe = equipesMap[user.equipe_id].nome;
      else if (user.departamento) nomeEquipe = user.departamento;
      if (!grupos[nomeEquipe]) grupos[nomeEquipe] = [];
      grupos[nomeEquipe].push(user);
    });
    Object.keys(grupos).forEach(eq => {
      grupos[eq].sort((a, b) => (a.nome || a.full_name || '').localeCompare(b.nome || b.full_name || '', 'pt-BR'));
    });
    return grupos;
  }, [usuarios, equipesMap]);

  const usuariosPorEquipeFiltrado = useMemo(() => {
    const result = {};
    Object.entries(usuariosPorEquipe).forEach(([equipe, usrs]) => {
      if (filtroEquipe !== 'todas' && equipe !== filtroEquipe) return;
      const filtrados = usrs.filter(u => {
        if (filtroUsuario !== 'todos' && u.email !== filtroUsuario) return false;
        if (filtroOS.trim()) {
          const osLower = filtroOS.trim().toLowerCase();
          const allStores = [osPorUsuarioDia.previsto, osPorUsuarioDia.programado, osPorUsuarioDia.realizado];
          const temOS = allStores.some(store => {
            const diasUser = store[u.email] || {};
            return Object.values(diasUser).some(items =>
              items.some(i => i.label.toLowerCase().includes(osLower) || i.empNome.toLowerCase().includes(osLower))
            );
          });
          if (!temOS) return false;
        }
        return true;
      });
      if (filtrados.length > 0) result[equipe] = filtrados;
    });
    return result;
  }, [usuariosPorEquipe, filtroEquipe, filtroUsuario, filtroOS, osPorUsuarioDia]);

  const temFiltros = filtroEquipe !== 'todas' || filtroUsuario !== 'todos' || filtroOS.trim();
  const totalLinhas = Object.values(usuariosPorEquipeFiltrado).reduce((a, b) => a + b.length, 0);
  const linhasAtivas = LINHAS.filter(l => linhasVisiveis[l.key]);

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center p-2 bg-gray-50 rounded-lg border text-sm">
        <Filter className="w-4 h-4 text-gray-400 shrink-0" />
        <Input
          placeholder="Filtrar por OS..."
          value={filtroOS}
          onChange={e => setFiltroOS(e.target.value)}
          className="h-8 w-48 text-xs"
        />
        <Select value={filtroEquipe} onValueChange={setFiltroEquipe}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="Todas as equipes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as equipes</SelectItem>
            {equipes.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(eq => (
              <SelectItem key={eq.id} value={eq.nome}>{eq.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroUsuario} onValueChange={setFiltroUsuario}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Todos os usuários" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os usuários</SelectItem>
            {usuarios.filter(u => u.nome || u.full_name).sort((a, b) => (a.nome || a.full_name || '').localeCompare(b.nome || b.full_name || '')).map(u => (
              <SelectItem key={u.id} value={u.email}>{u.nome || u.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Toggle linhas */}
        <div className="flex items-center gap-1 ml-1 border-l pl-2">
          {LINHAS.map(l => (
            <button
              key={l.key}
              onClick={() => toggleLinha(l.key)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs border transition-all ${
                linhasVisiveis[l.key]
                  ? `${l.bg} ${l.text} border-current font-semibold`
                  : 'bg-white text-gray-400 border-gray-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: linhasVisiveis[l.key] ? l.dot : '#D1D5DB' }} />
              {l.label}
            </button>
          ))}
        </div>

        {temFiltros && (
          <Button variant="ghost" size="sm" onClick={() => { setFiltroOS(''); setFiltroEquipe('todas'); setFiltroUsuario('todos'); }} className="h-8 text-red-500 hover:text-red-700 text-xs">
            <X className="w-3 h-3 mr-1" />Limpar
          </Button>
        )}
        <span className="text-xs text-gray-500 ml-auto">{totalLinhas} colaboradores</span>
      </div>

      {/* Tabela */}
      <div className="overflow-auto max-h-[calc(100vh-300px)]">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-20">
            <tr className="bg-gray-800 text-white">
              <th className="border border-gray-600 p-1 text-left sticky left-0 bg-gray-800 z-30 min-w-[130px]">Nome</th>
              {diasExibidos.map(dia => (
                <th
                  key={format(dia, 'yyyy-MM-dd')}
                  className={`border border-gray-600 p-1 text-center min-w-[40px] ${dia.getDay() === 0 || dia.getDay() === 6 ? 'bg-gray-700' : ''}`}
                >
                  {format(dia, 'd/MM')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(usuariosPorEquipeFiltrado).map(([equipe, usrs]) => (
              <React.Fragment key={equipe}>
                <tr className="bg-gray-900 text-white font-bold">
                  <td colSpan={1 + diasExibidos.length} className="border border-gray-600 p-1">
                    {equipe.toUpperCase()}
                  </td>
                </tr>
                {usrs.map((usuario, idx) => {
                  const email = usuario.email;
                  const osLower = filtroOS.trim().toLowerCase();

                  const getItems = (store) => {
                    const diasUser = store[email] || {};
                    return (dataStr) => {
                      const all = diasUser[dataStr] || [];
                      return osLower
                        ? all.filter(i => i.label.toLowerCase().includes(osLower) || i.empNome.toLowerCase().includes(osLower))
                        : all;
                    };
                  };

                  const getterPrevisto = getItems(osPorUsuarioDia.previsto);
                  const getterProgramado = getItems(osPorUsuarioDia.programado);
                  const getterRealizado = getItems(osPorUsuarioDia.realizado);

                  const baseBg = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';

                  return (
                    <tr key={usuario.id} className={baseBg}>
                      <td className={`border border-gray-300 p-1 sticky left-0 z-10 ${baseBg}`}>
                        <div className="font-medium">{usuario.nome || usuario.full_name}</div>
                        <div className="text-gray-400 text-[10px]">{usuario.cargo || ''}</div>
                      </td>
                      {diasExibidos.map(dia => {
                        const dataStr = format(dia, 'yyyy-MM-dd');
                        const isWeekend = dia.getDay() === 0 || dia.getDay() === 6;
                        const itemsPrev = linhasVisiveis.previsto ? getterPrevisto(dataStr) : [];
                        const itemsProg = linhasVisiveis.programado ? getterProgramado(dataStr) : [];
                        const itemsReal = linhasVisiveis.realizado ? getterRealizado(dataStr) : [];

                        // Deduplica: cada OS aparece apenas na sub-linha de maior prioridade
                        // Realizado > Programado > Previsto
                        const realLabels = new Set(itemsReal.map(i => i.label));
                        const progLabels = new Set(itemsProg.map(i => i.label));
                        const itemsProgFilt = itemsProg.filter(i => !realLabels.has(i.label));
                        const itemsPrevFilt = itemsPrev.filter(i => !realLabels.has(i.label) && !progLabels.has(i.label));

                        return (
                          <td
                            key={dataStr}
                            className={`border border-gray-300 p-0 align-top ${isWeekend ? 'bg-gray-100' : ''}`}
                          >
                            {linhasAtivas.map(l => {
                              const items = l.key === 'previsto' ? itemsPrevFilt : l.key === 'programado' ? itemsProgFilt : itemsReal;
                              if (!linhasVisiveis[l.key]) return null;
                              return (
                                <div
                                  key={l.key}
                                  className={`flex flex-wrap gap-0.5 justify-center p-0.5 min-h-[18px] ${items.length === 0 ? '' : l.bg}`}
                                  title={`${l.label}: ${items.map(i => `${i.label} (${i.empNome})`).join(', ')}`}
                                >
                                  {items.map((item, i) => (
                                    <span key={i} className="px-1 rounded text-white text-[10px] font-medium leading-tight" style={{ backgroundColor: item.cor }}>
                                      {item.label}
                                    </span>
                                  ))}
                                </div>
                              );
                            })}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
            {Object.keys(usuariosPorEquipeFiltrado).length === 0 && (
              <tr>
                <td colSpan={1 + diasExibidos.length} className="text-center py-8 text-gray-400">
                  Nenhum resultado encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}