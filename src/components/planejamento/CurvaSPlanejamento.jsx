import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Calendar, AlertTriangle } from "lucide-react";
import { format, parseISO, startOfWeek, endOfWeek, eachWeekOfInterval, isAfter, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function CurvaSPlanejamento({ planejamentos, empreendimentoId }) {
  const [dadosGrafico, setDadosGrafico] = useState([]);
  const [resumo, setResumo] = useState({
    totalPlanejado: 0,
    totalExecutado: 0,
    progresso: 0,
    semanasComAtraso: 0
  });

  const processarDadosParaGrafico = useMemo(() => {
    if (!planejamentos || planejamentos.length === 0) {
      return [];
    }

    try {
      console.log('Processando dados da Curva S...', planejamentos.length, 'planejamentos');
      
      // Filtrar apenas planejamentos válidos com datas
      const planejamentosValidos = planejamentos.filter(p => {
        // Verificar se as datas existem e não são null
        const temInicio = p.inicio_planejado && typeof p.inicio_planejado === 'string';
        const temTermino = p.termino_planejado && typeof p.termino_planejado === 'string';
        const temHoras = typeof p.tempo_planejado === 'number' && p.tempo_planejado > 0;
        
        return temInicio && temTermino && temHoras;
      });

      console.log('Planejamentos válidos para gráfico:', planejamentosValidos.length);

      if (planejamentosValidos.length === 0) {
        return [];
      }

      // Encontrar intervalo de datas
      let dataMinima = null;
      let dataMaxima = null;

      planejamentosValidos.forEach(p => {
        try {
          // Verificação adicional antes de fazer parse
          if (p.inicio_planejado && typeof p.inicio_planejado === 'string') {
            const inicio = parseISO(p.inicio_planejado);
            if (!dataMinima || isBefore(inicio, dataMinima)) {
              dataMinima = inicio;
            }
          }
          
          if (p.termino_planejado && typeof p.termino_planejado === 'string') {
            const termino = parseISO(p.termino_planejado);
            if (!dataMaxima || isAfter(termino, dataMaxima)) {
              dataMaxima = termino;
            }
          }
        } catch (error) {
          console.warn('Erro ao processar datas do planejamento:', p.id, error);
        }
      });

      if (!dataMinima || !dataMaxima) {
        console.warn('Não foi possível determinar intervalo de datas válido');
        return [];
      }

      // Gerar semanas no intervalo
      const semanas = eachWeekOfInterval({
        start: startOfWeek(dataMinima, { weekStartsOn: 1 }),
        end: endOfWeek(dataMaxima, { weekStartsOn: 1 })
      }, { weekStartsOn: 1 });

      console.log('Processando', semanas.length, 'semanas de', format(semanas[0], 'dd/MM/yyyy'), 'até', format(semanas[semanas.length - 1], 'dd/MM/yyyy'));

      let horasAcumuladasPlanejadas = 0;
      let horasAcumuladasReais = 0;

      const dadosSemanas = semanas.map(inicioSemana => {
        const fimSemana = endOfWeek(inicioSemana, { weekStartsOn: 1 });
        
        let horasSemanaPlanejas = 0;
        let horasSemanareais = 0;

        planejamentosValidos.forEach(p => {
          try {
            const inicioAtividade = parseISO(p.inicio_planejado);
            const terminoAtividade = parseISO(p.termino_planejado);
            
            // Verificar se a atividade tem sobreposição com a semana
            if (
              (inicioAtividade <= fimSemana && terminoAtividade >= inicioSemana)
            ) {
              // Distribuir proporcionalmente as horas da atividade na semana
              const duracaoAtividade = Math.max(1, Math.ceil((terminoAtividade - inicioAtividade) / (1000 * 60 * 60 * 24)));
              const inicioSobreposicao = inicioAtividade > inicioSemana ? inicioAtividade : inicioSemana;
              const fimSobreposicao = terminoAtividade < fimSemana ? terminoAtividade : fimSemana;
              const diasSobreposicao = Math.ceil((fimSobreposicao - inicioSobreposicao) / (1000 * 60 * 60 * 24)) + 1;
              
              const proporcao = Math.min(1, diasSobreposicao / duracaoAtividade);
              const horasProporcionais = (p.tempo_planejado || 0) * proporcao;
              
              horasSemanaPlanejas += horasProporcionais;
              
              // Para horas reais, usar tempo_real_executado se disponível
              const horasReaisAtividade = p.tempo_real_executado || 0;
              horasSemanareais += horasReaisAtividade * proporcao;
            }
          } catch (error) {
            console.warn('Erro ao processar planejamento na semana:', p.id, error);
          }
        });

        horasAcumuladasPlanejadas += horasSemanaPlanejas;
        horasAcumuladasReais += horasSemanareais;

        return {
          semana: format(inicioSemana, 'dd/MM', { locale: ptBR }),
          semanaCompleta: format(inicioSemana, 'dd/MM/yyyy', { locale: ptBR }),
          horasPlanejadasAcumuladas: Math.round(horasAcumuladasPlanejadas * 10) / 10,
          horasReaisAcumuladas: Math.round(horasAcumuladasReais * 10) / 10,
          horasSemana: Math.round(horasSemanaPlanejas * 10) / 10,
          horasReaisSemana: Math.round(horasSemanareais * 10) / 10
        };
      });

      // Calcular resumo
      const totalPlanejado = planejamentosValidos.reduce((sum, p) => sum + (p.tempo_planejado || 0), 0);
      const totalExecutado = planejamentosValidos.reduce((sum, p) => sum + (p.tempo_real_executado || 0), 0);
      
      setResumo({
        totalPlanejado: Math.round(totalPlanejado * 10) / 10,
        totalExecutado: Math.round(totalExecutado * 10) / 10,
        progresso: totalPlanejado > 0 ? Math.round((totalExecutado / totalPlanejado) * 100) : 0,
        semanasComAtraso: dadosSemanas.filter(s => s.horasPlanejadasAcumuladas > s.horasReaisAcumuladas).length
      });

      console.log('Dados processados com sucesso:', dadosSemanas.length, 'semanas');
      return dadosSemanas;
      
    } catch (error) {
      console.error('Erro ao processar dados para o gráfico de Curva S:', error);
      return [];
    }
  }, [planejamentos]);

  useEffect(() => {
    setDadosGrafico(processarDadosParaGrafico);
  }, [processarDadosParaGrafico]);

  if (!planejamentos || planejamentos.length === 0) {
    return (
      <Card className="bg-white border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            Curva S - Progresso do Planejamento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Nenhum dado de planejamento
            </h3>
            <p className="text-gray-500">
              Crie alguns planejamentos para visualizar a curva de progresso
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            Curva S - Progresso do Planejamento
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-blue-500 rounded"></div>
              <span>Planejado</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-500 rounded"></div>
              <span>Real</span>
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{resumo.totalPlanejado}h</div>
            <div className="text-sm text-blue-800">Total Planejado</div>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{resumo.totalExecutado}h</div>
            <div className="text-sm text-green-800">Total Executado</div>
          </div>
          <div className="text-center p-3 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">{resumo.progresso}%</div>
            <div className="text-sm text-purple-800">Progresso</div>
          </div>
          <div className="text-center p-3 bg-orange-50 rounded-lg">
            <div className="text-2xl font-bold text-orange-600">{resumo.semanasComAtraso}</div>
            <div className="text-sm text-orange-800">Semanas em Atraso</div>
          </div>
        </div>

        {/* Gráfico */}
        {dadosGrafico.length > 0 ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dadosGrafico} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="semana" 
                  tick={{ fontSize: 12 }}
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Horas Acumuladas', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip 
                  formatter={(value, name) => [`${value}h`, name === 'horasPlanejadasAcumuladas' ? 'Planejado' : 'Real']}
                  labelFormatter={(label) => `Semana: ${label}`}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="horasPlanejadasAcumuladas" 
                  stroke="#3B82F6" 
                  strokeWidth={3}
                  name="Horas Planejadas"
                  dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="horasReaisAcumuladas" 
                  stroke="#10B981" 
                  strokeWidth={3}
                  name="Horas Reais"
                  dot={{ fill: '#10B981', strokeWidth: 2, r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-center py-8">
            <AlertTriangle className="w-16 h-16 text-yellow-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Dados insuficientes para gráfico
            </h3>
            <p className="text-gray-500">
              Verifique se os planejamentos têm datas de início e término válidas
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}