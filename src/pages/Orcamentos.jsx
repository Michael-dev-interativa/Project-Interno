import React, { useState, useEffect } from "react";
import { Calculator, Loader2, TrendingUp } from "lucide-react";
import { Comercial } from "@/entities/all";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { retryWithBackoff } from "@/components/utils/apiUtils";
import { format, parseISO } from "date-fns";

export default function OrcamentosPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [orcamentosPorMes, setOrcamentosPorMes] = useState([]);

  useEffect(() => {
    loadOrcamentos();
  }, []);

  const loadOrcamentos = async () => {
    setIsLoading(true);
    try {
      const data = await retryWithBackoff(
        () => Comercial.list(),
        3, 2000, 'loadOrcamentos'
      );

      const grouped = {};
      
      data.forEach(proposta => {
        // Agrupa por mês de solicitação
        if (proposta.data_solicitacao) {
          const date = parseISO(proposta.data_solicitacao);
          const mesAno = format(date, 'yyyy-MM');
          const mesAnoDisplay = format(date, 'MM/yyyy');
          
          if (!grouped[mesAno]) {
            grouped[mesAno] = {
              mesAno,
              mesAnoDisplay,
              quantidade: 0,
              valorBimTotal: 0,
              valorCadTotal: 0,
              valorBimAprovado: 0,
              valorCadAprovado: 0,
              quantidadeAprovada: 0
            };
          }
          
          grouped[mesAno].quantidade++;
          grouped[mesAno].valorBimTotal += Number(proposta.valor_bim || 0);
          grouped[mesAno].valorCadTotal += Number(proposta.valor_cad || 0);
        }
        
        // Agrupa por mês de aprovação
        if (proposta.data_aprovacao && proposta.status === 'aprovado') {
          const dateAprovacao = parseISO(proposta.data_aprovacao);
          const mesAnoAprovacao = format(dateAprovacao, 'yyyy-MM');
          const mesAnoAprovacaoDisplay = format(dateAprovacao, 'MM/yyyy');
          
          if (!grouped[mesAnoAprovacao]) {
            grouped[mesAnoAprovacao] = {
              mesAno: mesAnoAprovacao,
              mesAnoDisplay: mesAnoAprovacaoDisplay,
              quantidade: 0,
              valorBimTotal: 0,
              valorCadTotal: 0,
              valorBimAprovado: 0,
              valorCadAprovado: 0,
              quantidadeAprovada: 0
            };
          }
          
          grouped[mesAnoAprovacao].valorBimAprovado += Number(proposta.valor_bim || 0);
          grouped[mesAnoAprovacao].valorCadAprovado += Number(proposta.valor_cad || 0);
          grouped[mesAnoAprovacao].quantidadeAprovada++;
        }
      });

      const sorted = Object.values(grouped).sort((a, b) => b.mesAno.localeCompare(a.mesAno));
      setOrcamentosPorMes(sorted);
    } catch (error) {
      console.error('Erro ao carregar orçamentos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const totalGeral = orcamentosPorMes.reduce((acc, mes) => ({
    quantidade: acc.quantidade + mes.quantidade,
    valorBim: acc.valorBim + mes.valorBimTotal,
    valorCad: acc.valorCad + mes.valorCadTotal,
    valorBimAprovado: acc.valorBimAprovado + mes.valorBimAprovado,
    valorCadAprovado: acc.valorCadAprovado + mes.valorCadAprovado,
    quantidadeAprovada: acc.quantidadeAprovada + mes.quantidadeAprovada
  }), { quantidade: 0, valorBim: 0, valorCad: 0, valorBimAprovado: 0, valorCadAprovado: 0, quantidadeAprovada: 0 });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="p-6 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <Calculator className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Orçamentos por Mês</h1>
              <p className="text-gray-600">Resumo de orçamentos realizados ({totalGeral.quantidade} propostas)</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Total de Propostas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-gray-900">{totalGeral.quantidade}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Valor Total BIM</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  R$ {totalGeral.valorBim.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Valor Total CAD</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">
                  R$ {totalGeral.valorCad.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Orçamentos por Mês
              </CardTitle>
            </CardHeader>
            <CardContent>
              {orcamentosPorMes.length === 0 ? (
                <div className="text-center py-12">
                  <Calculator className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">Nenhum orçamento encontrado</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mês/Ano</TableHead>
                        <TableHead className="text-center">Quantidade</TableHead>
                        <TableHead className="text-right">Valor BIM</TableHead>
                        <TableHead className="text-right">Valor CAD</TableHead>
                        <TableHead className="text-right">Valor Total (BIM + CAD)</TableHead>
                        <TableHead className="text-center">Qtd. Aprovada</TableHead>
                        <TableHead className="text-right bg-green-50">Valor Aprovado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orcamentosPorMes.map((mes) => (
                        <TableRow key={mes.mesAno} className="hover:bg-gray-50">
                          <TableCell className="font-medium">{mes.mesAnoDisplay}</TableCell>
                          <TableCell className="text-center">{mes.quantidade}</TableCell>
                          <TableCell className="text-right">
                            R$ {mes.valorBimTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right">
                            R$ {mes.valorCadTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-gray-700">
                            R$ {(mes.valorBimTotal + mes.valorCadTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-center">
                            {mes.quantidadeAprovada > 0 ? mes.quantidadeAprovada : '-'}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-600 bg-green-50">
                            {mes.valorBimAprovado + mes.valorCadAprovado > 0 
                              ? `R$ ${(mes.valorBimAprovado + mes.valorCadAprovado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                              : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-gray-50 font-semibold">
                        <TableCell>TOTAL GERAL</TableCell>
                        <TableCell className="text-center">{totalGeral.quantidade}</TableCell>
                        <TableCell className="text-right">
                          R$ {totalGeral.valorBim.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right">
                          R$ {totalGeral.valorCad.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-gray-700">
                          R$ {(totalGeral.valorBim + totalGeral.valorCad).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-center">{totalGeral.quantidadeAprovada}</TableCell>
                        <TableCell className="text-right text-green-600 bg-green-50">
                          R$ {(totalGeral.valorBimAprovado + totalGeral.valorCadAprovado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}