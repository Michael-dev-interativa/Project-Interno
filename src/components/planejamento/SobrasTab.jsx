
import { useState, useEffect, useContext } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Clock, User, Plus, Edit, Trash2, AlertTriangle, RefreshCw } from "lucide-react";
import { SobraUsuario, Usuario } from "@/entities/all";
import { ActivityTimerContext } from '../contexts/ActivityTimerContext';

export default function SobrasTab({ empreendimentoId }) {
  const [sobras, setSobras] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSobra, setEditingSobra] = useState(null);
  const [selectedUsuario, setSelectedUsuario] = useState("");
  const [horasSobra, setHorasSobra] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { refreshTrigger } = useContext(ActivityTimerContext);

  useEffect(() => {
    if (empreendimentoId) {
      fetchData();
    }
  }, [empreendimentoId, refreshTrigger]);

  const fetchData = async () => {
    setIsLoadingData(true);
    try {
      console.log("Carregando dados de sobras para empreendimento:", empreendimentoId);
      
      const [sobrasData, usuariosData] = await Promise.all([
        SobraUsuario.filter({ empreendimento_id: empreendimentoId }),
        Usuario.list() // Usar Usuario.list() diretamente
      ]);
      
      console.log("Sobras encontradas:", sobrasData.length);
      console.log("Sobras:", sobrasData);
      
      setSobras(sobrasData || []);
      setUsuarios(usuariosData || []);
    } catch (error) {
      console.error("Erro ao buscar dados de sobras:", error);
      alert("Erro ao buscar dados de sobras.");
    }
    setIsLoadingData(false);
  };

  const usuariosComSobra = usuarios.filter(u => 
    sobras.some(s => s.usuario === u.email && s.horas_sobra !== 0) // Incluir sobras negativas também
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUsuario || !horasSobra) return;

    setIsLoading(true);
    try {
      const sobraData = {
        usuario: selectedUsuario,
        empreendimento_id: empreendimentoId,
        horas_sobra: parseFloat(horasSobra)
      };

      if (editingSobra) {
        await SobraUsuario.update(editingSobra.id, sobraData);
        console.log("Sobra atualizada:", sobraData);
      } else {
        // Verificar se já existe uma sobra para este usuário
        const existingSobra = sobras.find(s => s.usuario === selectedUsuario);
        if (existingSobra) {
          const newTotal = existingSobra.horas_sobra + parseFloat(horasSobra);
          await SobraUsuario.update(existingSobra.id, {
            horas_sobra: newTotal
          });
          console.log(`Sobra ajustada para ${selectedUsuario}: ${existingSobra.horas_sobra} + ${horasSobra} = ${newTotal}`);
        } else {
          await SobraUsuario.create(sobraData);
          console.log("Nova sobra criada:", sobraData);
        }
      }

      setShowForm(false);
      setEditingSobra(null);
      setSelectedUsuario("");
      setHorasSobra("");
      fetchData(); // Recarregar dados
    } catch (error) {
      console.error("Erro ao salvar sobra:", error);
      alert("Erro ao salvar sobra. Tente novamente.");
    }
    setIsLoading(false);
  };

  const handleEdit = (sobra) => {
    setEditingSobra(sobra);
    setSelectedUsuario(sobra.usuario);
    setHorasSobra(sobra.horas_sobra.toString());
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Tem certeza que deseja excluir esta sobra?")) {
      try {
        await SobraUsuario.delete(id);
        console.log("Sobra deletada:", id);
        fetchData();
      } catch (error) {
        console.error("Erro ao excluir sobra:", error);
        alert("Erro ao excluir sobra. Tente novamente.");
      }
    }
  };

  const totalSobras = sobras.reduce((total, sobra) => total + (sobra.horas_sobra || 0), 0);
  const sobrasPositivas = sobras.filter(s => s.horas_sobra > 0);
  const usuariosComSobraPositiva = usuarios.filter(u => 
    sobrasPositivas.some(s => s.usuario === u.email)
  );
  
  if (isLoadingData) {
      return (
        <div className="flex justify-center items-center h-40">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <p className="text-gray-500">Carregando dados de sobras...</p>
            </div>
        </div>
      );
  }

  return (
    <div className="space-y-6">
      {/* Resumo das Sobras */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Clock className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-sm text-blue-600 font-medium">Total de Sobras</p>
                <p className={`text-2xl font-bold ${totalSobras >= 0 ? 'text-blue-800' : 'text-red-600'}`}>
                  {totalSobras.toFixed(1)}h
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-green-50 to-green-100 border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <User className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-sm text-green-600 font-medium">Usuários com Sobra</p>
                <p className="text-2xl font-bold text-green-800">{usuariosComSobraPositiva.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-orange-50 to-orange-100 border-orange-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-sm text-orange-600 font-medium">Média por Usuário</p>
                <p className="text-2xl font-bold text-orange-800">
                  {usuariosComSobraPositiva.length > 0 ? (totalSobras / usuariosComSobraPositiva.length).toFixed(1) : '0.0'}h
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Sobras */}
      <Card className="bg-white border-0 shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              Sobras Calculadas Automaticamente
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoadingData}>
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingData ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
              <Button onClick={() => setShowForm(true)} variant="outline" className="text-blue-600 border-blue-600 hover:bg-blue-50">
                <Plus className="w-4 h-4 mr-2" />
                Ajustar Sobras
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {sobras.length > 0 ? (
            <div className="space-y-4">
              {sobras.map((sobra) => {
                const usuario = usuarios.find(u => u.email === sobra.usuario);
                const isSobraNegativa = sobra.horas_sobra < 0;
                const isSobraZero = sobra.horas_sobra === 0;
                
                return (
                  <div key={sobra.id} className={`flex items-center justify-between p-4 border rounded-lg transition-colors ${
                    isSobraNegativa ? 'border-red-200 bg-red-50' : 
                    isSobraZero ? 'border-gray-200 bg-gray-50' :
                    'border-green-200 bg-green-50 hover:bg-green-100'
                  }`}>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {usuario?.nome || sobra.usuario}
                        </h3>
                        <p className="text-sm text-gray-500">{sobra.usuario}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <Badge className={`text-lg font-semibold px-3 py-1 ${
                        isSobraNegativa ? 'bg-red-100 text-red-800' :
                        isSobraZero ? 'bg-gray-100 text-gray-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {isSobraNegativa && '-'}{Math.abs(sobra.horas_sobra).toFixed(1)}h
                        {isSobraNegativa && ' (deficit)'}
                      </Badge>
                      
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(sobra)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(sobra.id)}
                          className="text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Nenhuma sobra calculada ainda
              </h3>
              <p className="text-gray-500">
                As sobras serão calculadas automaticamente quando as atividades forem concluídas
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Formulário */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingSobra ? 'Ajustar Sobra' : 'Adicionar Ajuste de Sobra'}
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="usuario">Usuário</Label>
              <select
                id="usuario"
                value={selectedUsuario}
                onChange={(e) => setSelectedUsuario(e.target.value)}
                required
                disabled={!!editingSobra}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="">Selecione um usuário</option>
                {usuarios.map(usuario => (
                  <option key={usuario.email} value={usuario.email}>
                    {usuario.nome} ({usuario.email})
                  </option>
                ))}
              </select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="horas">Ajuste de Horas (+ para adicionar, - para subtrair)</Label>
              <Input
                id="horas"
                type="number"
                step="0.1"
                value={horasSobra}
                onChange={(e) => setHorasSobra(e.target.value)}
                placeholder="0.0"
                required
              />
              <p className="text-xs text-gray-500">
                Use valores positivos para adicionar sobras ou negativos para subtrair
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setEditingSobra(null);
                  setSelectedUsuario("");
                  setHorasSobra("");
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Salvando..." : "Salvar Ajuste"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
