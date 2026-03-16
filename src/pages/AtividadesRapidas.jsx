import React, { useState, useEffect, useContext } from 'react';
import { base44 } from '@/api/base44Client';
import { AtividadeGenerica, Usuario, Execucao, Empreendimento } from '@/entities/all';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Zap, Clock, Play, Users, CheckCircle2, XCircle, History, Edit2, RotateCcw } from 'lucide-react';
import { ActivityTimerContext } from '@/components/contexts/ActivityTimerContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function AtividadesRapidasPage() {
  const { user, startExecution, userProfile } = useContext(ActivityTimerContext);
  const [atividadesGenericas, setAtividadesGenericas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [empreendimentos, setEmpreendimentos] = useState([]);
  const [execucoes, setExecucoes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  
  // Estados do modal
  const [showModal, setShowModal] = useState(false);
  const [selectedAtividade, setSelectedAtividade] = useState(null);
  const [modalData, setModalData] = useState({
    usuario_ajudado: '',
    empreendimento_id: ''
  });

  // Estados para editar descrição
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedExecucao, setSelectedExecucao] = useState(null);
  const [editDescricao, setEditDescricao] = useState('');

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    
    setIsLoadingData(true);
    try {
      const [atividadesData, usuariosData, empreendimentosData, execucoesData] = await Promise.all([
        AtividadeGenerica.list(),
        Usuario.list(),
        Empreendimento.list(),
        Execucao.filter({ usuario: user.email, planejamento_id: null }, '-inicio', 50)
      ]);

      setAtividadesGenericas(atividadesData || []);
      setUsuarios(usuariosData || []);
      setEmpreendimentos(empreendimentosData || []);
      setExecucoes(execucoesData || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      alert('Erro ao carregar dados. Recarregue a página.');
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleOpenModal = (atividade) => {
    setSelectedAtividade(atividade);
    setModalData({
      usuario_ajudado: '',
      empreendimento_id: ''
    });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedAtividade(null);
    setModalData({
      usuario_ajudado: '',
      empreendimento_id: ''
    });
  };

  const handleOpenEditModal = (execucao) => {
    if (execucao.status !== 'Finalizado') {
      alert('Apenas atividades finalizadas podem ser editadas');
      return;
    }
    setSelectedExecucao(execucao);
    setEditDescricao(execucao.descritivo);
    setShowEditModal(true);
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setSelectedExecucao(null);
    setEditDescricao('');
  };

  const handleRetryExecution = async (execucao) => {
    setIsLoading(true);
    try {
      await startExecution({
        descritivo: execucao.descritivo,
        base_descritivo: execucao.descritivo.split(' - ')[1] || execucao.descritivo,
        empreendimento_id: execucao.empreendimento_id || null,
        usuario_ajudado: execucao.usuario_ajudado || null
      });

      alert('✅ Atividade retomada com sucesso!');
      await loadData();
    } catch (error) {
      console.error('Erro ao retomar atividade:', error);
      alert('Erro ao retomar atividade: ' + (error.message || 'Tente novamente.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveDescricao = async () => {
    if (!selectedExecucao || !editDescricao.trim()) {
      alert('Descrição não pode estar vazia');
      return;
    }

    setIsLoading(true);
    try {
      await Execucao.update(selectedExecucao.id, {
        descritivo: editDescricao.trim()
      });
      
      alert('✅ Descrição atualizada com sucesso!');
      await loadData();
      handleCloseEditModal();
    } catch (error) {
      console.error('Erro ao salvar descrição:', error);
      alert('Erro ao atualizar descrição: ' + (error.message || 'Tente novamente.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmStart = async () => {
    if (!selectedAtividade) return;

    setIsLoading(true);

    try {
      let descritivo = selectedAtividade.nome;
      
      // Adicionar contexto de ajuda ao descritivo
      if (modalData.usuario_ajudado) {
        const usuarioAjudado = usuarios.find(u => u.email === modalData.usuario_ajudado);
        descritivo = `Ajudando ${usuarioAjudado?.nome || modalData.usuario_ajudado} - ${descritivo}`;
      }

      await startExecution({
        descritivo: descritivo,
        base_descritivo: selectedAtividade.nome,
        empreendimento_id: modalData.empreendimento_id || null,
        usuario_ajudado: modalData.usuario_ajudado || null
      });

      alert('✅ Atividade iniciada com sucesso!');
      
      // Recarregar execuções
      await loadData();
      
      // Fechar modal
      handleCloseModal();

      // **REMOVIDO**: Redirecionamento automático para o dashboard

    } catch (error) {
      console.error('❌ Erro ao iniciar atividade:', error);
      alert('Erro ao iniciar atividade: ' + (error.message || 'Tente novamente.'));
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      'Finalizado': <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="w-3 h-3 mr-1" />Finalizado</Badge>,
      'Em andamento': <Badge className="bg-blue-100 text-blue-800"><Play className="w-3 h-3 mr-1" />Em andamento</Badge>,
      'Paralisado': <Badge className="bg-yellow-100 text-yellow-800"><XCircle className="w-3 h-3 mr-1" />Pausado</Badge>,
    };
    return badges[status] || <Badge variant="outline">{status}</Badge>;
  };

  const formatTempo = (tempo) => {
    const sanitize = (value) => {
      if (value === undefined || value === null || value === '') return 0;
      if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
      const text = String(value).replace(',', '.');
      const sanitized = text.replace(/[^0-9.-]/g, '');
      const parsed = Number(sanitized);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const numericTempo = sanitize(tempo);
    return `${numericTempo.toFixed(1)}h`;
  };

  const formatData = (dataString) => {
    if (!dataString) return 'N/A';
    try {
      return format(new Date(dataString), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return 'Data inválida';
    }
  };

  // Bloquear acesso para perfil consultor
  if (userProfile?.perfil === 'consultor') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-12">
              <XCircle className="w-16 h-16 text-red-400 mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Acesso Restrito</h2>
              <p className="text-gray-600 text-center">
                Seu perfil de Consultor não possui permissão para criar atividades rápidas.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isLoadingData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          <Card>
            <CardContent className="flex items-center justify-center p-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <span className="ml-3 text-gray-600">Carregando...</span>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-2">
            <Zap className="w-8 h-8 text-yellow-500" />
            Atividades Rápidas
          </h1>
          <p className="text-gray-600">
            Inicie atividades rapidamente sem precisar planejar.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Coluna Esquerda: Atividades Disponíveis */}
          <Card className="shadow-lg">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-lg">Atividades Disponíveis</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-2">
                  {atividadesGenericas.map(atividade => (
                    <div
                      key={atividade.id}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200"
                    >
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 truncate">
                          {atividade.nome}
                        </h4>
                      </div>
                      <Button
                        onClick={() => handleOpenModal(atividade)}
                        disabled={isLoading}
                        size="sm"
                        className="ml-3 bg-blue-600 hover:bg-blue-700"
                      >
                        <Play className="w-4 h-4 mr-1" />
                        Iniciar
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Coluna Direita: Histórico de Execuções */}
          <Card className="shadow-lg">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="w-5 h-5 text-gray-500" />
                Seu Histórico de Atividades Rápidas
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {execucoes.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">Nenhuma atividade rápida executada ainda.</p>
                  <p className="text-sm text-gray-400 mt-1">Inicie uma atividade para vê-la aqui!</p>
                </div>
              ) : (
                <ScrollArea className="h-[600px] pr-4">
                  <div className="space-y-3">
                    {execucoes.map(exec => (
                      <div
                        key={exec.id}
                        className="p-4 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-all"
                      >
                        <div className="flex items-start justify-between mb-2">
                           <h4 className="font-medium text-gray-900 flex-1 mr-2">
                             {exec.descritivo}
                           </h4>
                           <div className="flex items-center gap-2">
                             {exec.status === 'Finalizado' && (
                               <Button
                                 onClick={() => handleOpenEditModal(exec)}
                                 variant="ghost"
                                 size="sm"
                                 disabled={isLoading}
                               >
                                 <Edit2 className="w-4 h-4 text-blue-600" />
                               </Button>
                             )}
                             {exec.status === 'Paralisado' && (
                               <Button
                                 onClick={() => handleRetryExecution(exec)}
                                 variant="ghost"
                                 size="sm"
                                 disabled={isLoading}
                               >
                                 <RotateCcw className="w-4 h-4 text-orange-600" />
                               </Button>
                             )}
                             {getStatusBadge(exec.status)}
                           </div>
                         </div>
                        
                        {exec.usuario_ajudado && (
                          <p className="text-sm text-purple-600 mb-2">
                            <Users className="w-3 h-3 inline mr-1" />
                            Ajudando {usuarios.find(u => u.email === exec.usuario_ajudado)?.nome || exec.usuario_ajudado}
                          </p>
                        )}
                        
                        <div className="flex items-center justify-between text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatData(exec.inicio)}
                          </span>
                          {exec.tempo_total && (
                            <span className="font-semibold text-blue-600">
                              {formatTempo(exec.tempo_total)}
                            </span>
                          )}
                        </div>
                        
                        {exec.observacao && (
                          <p className="text-xs text-gray-600 mt-2 italic">
                            {exec.observacao}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal de Configuração */}
      <Dialog open={showModal} onOpenChange={handleCloseModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" />
              Iniciar: {selectedAtividade?.nome}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="usuario_ajudado">Ajudando alguém? (Opcional)</Label>
              <Select
                value={modalData.usuario_ajudado}
                onValueChange={(value) => setModalData(prev => ({ ...prev, usuario_ajudado: value }))}
              >
                <SelectTrigger id="usuario_ajudado">
                  <SelectValue placeholder="Nenhum (atividade pessoal)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Nenhum (atividade pessoal)</SelectItem>
                  {usuarios
                    .filter(u => u.email !== user?.email)
                    .sort((a, b) => {
                      const nomeA = a.nome || a.email || '';
                      const nomeB = b.nome || b.email || '';
                      return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
                    })
                    .map(usuario => (
                      <SelectItem key={usuario.id} value={usuario.email}>
                        {usuario.nome || usuario.email}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="empreendimento_id">Empreendimento (Opcional)</Label>
              <Select
                value={modalData.empreendimento_id}
                onValueChange={(value) => setModalData(prev => ({ ...prev, empreendimento_id: value }))}
              >
                <SelectTrigger id="empreendimento_id">
                  <SelectValue placeholder="Nenhum empreendimento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Nenhum empreendimento</SelectItem>
                  {empreendimentos.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseModal} disabled={isLoading}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmStart} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Iniciando...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Iniciar Atividade
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para Editar Descrição */}
      <Dialog open={showEditModal} onOpenChange={handleCloseEditModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-blue-600" />
              Editar Descrição
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="descricao">Descrição da Atividade</Label>
              <Textarea
                id="descricao"
                value={editDescricao}
                onChange={(e) => setEditDescricao(e.target.value)}
                placeholder="Digite a descrição da atividade"
                className="min-h-[120px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseEditModal} disabled={isLoading}>
              Cancelar
            </Button>
            <Button onClick={handleSaveDescricao} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Salvar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
