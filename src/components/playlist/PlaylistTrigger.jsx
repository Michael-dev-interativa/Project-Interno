import React, { useState, useContext, useMemo, useEffect } from 'react';
import { ActivityTimerContext } from '../contexts/ActivityTimerContext';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Zap, Play, X, ChevronDown, ChevronUp, Users, List, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlanejamentoAtividade, PlanejamentoDocumento } from '@/entities/all';
import { retryWithBackoff } from '../utils/apiUtils';

export default function PlaylistTrigger() {
  const {
    startExecution,
    playlist,
    addToPlaylist,
    removeFromPlaylist,
    startFromPlaylist,
    allPlanejamentos,
    isLoadingPlanejamentos,
    atividadesGenericas,
    allEmpreendimentos,
    allUsers,
    user,
    isStarting,
    updateKey
  } = useContext(ActivityTimerContext);

  const [isExpanded, setIsExpanded] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [playlistData, setPlaylistData] = useState([]);
  
  // Form states
  const [selectedAtividade, setSelectedAtividade] = useState('');
  const [selectedEmpreendimento, setSelectedEmpreendimento] = useState('none');
  const [selectedUsuarioAjuda, setSelectedUsuarioAjuda] = useState('');

  // **NOVO**: Carregar dados atualizados da playlist quando updateKey mudar
  useEffect(() => {
    const loadPlaylistData = async () => {
      if (!playlist || playlist.length === 0) {
        setPlaylistData([]);
        return;
      }

      try {
        
        const loadedData = await Promise.all(
          playlist.map(async (id) => {
            try {
              // Tentar buscar em PlanejamentoAtividade
              let results = await retryWithBackoff(
                () => PlanejamentoAtividade.filter({ id }, null, 1),
                2, 500, 'playlistLoad.atividade'
              );
              
              if (results && results.length > 0) {
                return { ...results[0], tipo_planejamento: 'atividade' };
              }
              
              // Se não encontrou, tentar PlanejamentoDocumento
              results = await retryWithBackoff(
                () => PlanejamentoDocumento.filter({ id }, null, 1),
                2, 500, 'playlistLoad.documento'
              );
              
              if (results && results.length > 0) {
                return { ...results[0], tipo_planejamento: 'documento' };
              }
              
              return null;
            } catch (error) {
              console.error(`Erro ao carregar planejamento ${id}:`, error);
              return null;
            }
          })
        );
        
        const validData = loadedData.filter(Boolean);
        setPlaylistData(validData);
        
      } catch (error) {
        console.error('❌ Erro ao carregar dados da playlist:', error);
        setPlaylistData([]);
      }
    };

    loadPlaylistData();
  }, [playlist, updateKey]);

  // Buscar nome da atividade selecionada
  const atividadeNome = useMemo(() => {
    const ativ = atividadesGenericas.find(a => a.id === selectedAtividade);
    return ativ?.nome || '';
  }, [selectedAtividade, atividadesGenericas]);

  // Handlers
  const handleQuickStart = async () => {
    if (!selectedAtividade) return;

    const atividade = atividadesGenericas.find(a => a.id === selectedAtividade);
    if (!atividade) return;

    const empreendimentoId = selectedEmpreendimento === 'none' ? null : selectedEmpreendimento;

    await startExecution({
      descritivo: atividade.nome,
      base_descritivo: atividade.nome,
      empreendimento_id: empreendimentoId,
      usuario_ajudado: null
    });

    // Resetar
    setSelectedAtividade('');
    setSelectedEmpreendimento('none');
    setIsExpanded(false);
  };

  const handleHelpStart = async () => {
    if (!selectedAtividade || !selectedUsuarioAjuda) return;

    const atividade = atividadesGenericas.find(a => a.id === selectedAtividade);
    if (!atividade) return;

    const empreendimentoId = selectedEmpreendimento === 'none' ? null : selectedEmpreendimento;
    const usuarioAjudadoObj = allUsers.find(u => u.email === selectedUsuarioAjuda);

    await startExecution({
      descritivo: `Ajudando ${usuarioAjudadoObj?.nome || usuarioAjudadoObj?.full_name || selectedUsuarioAjuda} - ${atividade.nome}`,
      base_descritivo: atividade.nome,
      empreendimento_id: empreendimentoId,
      usuario_ajudado: selectedUsuarioAjuda
    });

    // Resetar
    setSelectedAtividade('');
    setSelectedEmpreendimento('none');
    setSelectedUsuarioAjuda('');
    setShowHelp(false);
    setIsExpanded(false);
  };

  const handlePlaylistStart = async (plano) => {
    await startFromPlaylist(plano);
    setShowPlaylist(false);
    setIsExpanded(false);
  };

  return (
    <>
      {/* Botão Principal Flutuante */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="fixed bottom-6 right-6 z-40"
      >
        <Button
          onClick={() => setIsExpanded(!isExpanded)}
          className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-full w-14 h-14 shadow-2xl relative"
          size="icon"
        >
          <Zap className="w-6 h-6" />
          {playlistData.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {playlistData.length}
            </span>
          )}
        </Button>
      </motion.div>

      {/* Card Flutuante Expandido */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-6 z-40 w-96"
          >
            <Card className="bg-white shadow-2xl border-2 border-purple-200 overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  <h3 className="font-bold text-lg">Acesso Rápido</h3>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsExpanded(false)}
                  className="text-white hover:bg-white/20 h-8 w-8"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Content */}
              <div className="p-4 space-y-3">
                {/* Botões de Modo */}
                <div className="flex gap-2">
                  <Button
                    variant={!showPlaylist && !showHelp ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setShowPlaylist(false); setShowHelp(false); }}
                    className="flex-1"
                  >
                    <Play className="w-4 h-4 mr-1" />
                    Iniciar
                  </Button>
                  <Button
                    variant={showPlaylist ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setShowPlaylist(!showPlaylist); setShowHelp(false); }}
                    className="flex-1 relative"
                  >
                    <List className="w-4 h-4 mr-1" />
                    Playlist
                    {playlistData.length > 0 && (
                      <Badge variant="secondary" className="ml-1 text-xs">{playlistData.length}</Badge>
                    )}
                  </Button>
                  <Button
                    variant={showHelp ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setShowHelp(!showHelp); setShowPlaylist(false); }}
                    className="flex-1"
                  >
                    <Users className="w-4 h-4 mr-1" />
                    Ajudar
                  </Button>
                </div>

                {/* Modo: Iniciar Atividade */}
                {!showPlaylist && !showHelp && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3"
                  >
                    <Select value={selectedAtividade} onValueChange={setSelectedAtividade}>
                      <SelectTrigger>
                        <SelectValue placeholder="🔍 Selecione uma atividade..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {atividadesGenericas.map(ag => (
                          <SelectItem key={ag.id} value={ag.id}>{ag.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={selectedEmpreendimento} onValueChange={setSelectedEmpreendimento}>
                      <SelectTrigger>
                        <SelectValue placeholder="Empreendimento (opcional)" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        <SelectItem value="none">Nenhum empreendimento</SelectItem>
                        {allEmpreendimentos.map(emp => (
                          <SelectItem key={emp.id} value={emp.id}>{emp.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      onClick={handleQuickStart}
                      disabled={!selectedAtividade || isStarting !== null}
                      className="w-full bg-purple-600 hover:bg-purple-700"
                    >
                      {isStarting ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Iniciando...</>
                      ) : (
                        <><Play className="w-4 h-4 mr-2" /> Iniciar Agora</>
                      )}
                    </Button>
                  </motion.div>
                )}

                {/* Modo: Playlist */}
                {showPlaylist && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-2 max-h-80 overflow-y-auto"
                  >
                    {playlistData.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <List className="w-12 h-12 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Sua playlist está vazia</p>
                      </div>
                    ) : (
                      playlistData.map(plano => {
                        const tempoExecutado = plano.tempo_executado || 0;
                        const tempoPlanejado = plano.tempo_planejado || 0;
                        const status = plano.status || 'nao_iniciado';
                        
                        const getStatusColor = () => {
                          if (status === 'concluido') return 'bg-green-100 text-green-800';
                          if (status === 'em_andamento') return 'bg-blue-100 text-blue-800';
                          if (status === 'pausado') return 'bg-yellow-100 text-yellow-800';
                          return 'bg-gray-100 text-gray-800';
                        };
                        
                        return (
                          <div key={plano.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{plano.descritivo}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <p className="text-xs text-gray-600 font-mono">
                                  {tempoExecutado.toFixed(1)}h / {tempoPlanejado.toFixed(1)}h
                                </p>
                                <Badge className={`text-xs px-1.5 py-0.5 ${getStatusColor()}`}>
                                  {status === 'concluido' ? 'Concluído' : 
                                   status === 'em_andamento' ? 'Em andamento' :
                                   status === 'pausado' ? 'Pausado' : 'Não iniciado'}
                                </Badge>
                              </div>
                            </div>
                            {status !== 'concluido' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handlePlaylistStart(plano)}
                                disabled={isStarting !== null}
                                className="shrink-0"
                              >
                                <Play className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeFromPlaylist(plano.id)}
                              className="shrink-0 text-red-600 hover:text-red-700"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </motion.div>
                )}

                {/* Modo: Ajudar Usuário */}
                {showHelp && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3"
                  >
                    <Select value={selectedUsuarioAjuda} onValueChange={setSelectedUsuarioAjuda}>
                      <SelectTrigger>
                        <SelectValue placeholder="👤 Quem você está ajudando?" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {allUsers
                          .filter(u => u.email !== user?.email)
                          .sort((a, b) => {
                            const nomeA = a.nome || a.full_name || a.email || '';
                            const nomeB = b.nome || b.full_name || b.email || '';
                            return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
                          })
                          .map(u => (
                            <SelectItem key={u.id} value={u.email}>{u.nome || u.full_name || u.email}</SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>

                    <Select value={selectedAtividade} onValueChange={setSelectedAtividade}>
                      <SelectTrigger>
                        <SelectValue placeholder="🔍 Tipo de ajuda..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {atividadesGenericas.map(ag => (
                          <SelectItem key={ag.id} value={ag.id}>{ag.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={selectedEmpreendimento} onValueChange={setSelectedEmpreendimento}>
                      <SelectTrigger>
                        <SelectValue placeholder="Empreendimento (opcional)" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        <SelectItem value="none">Nenhum empreendimento</SelectItem>
                        {allEmpreendimentos.map(emp => (
                          <SelectItem key={emp.id} value={emp.id}>{emp.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      onClick={handleHelpStart}
                      disabled={!selectedAtividade || !selectedUsuarioAjuda || isStarting !== null}
                      className="w-full bg-amber-600 hover:bg-amber-700"
                    >
                      {isStarting ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Iniciando...</>
                      ) : (
                        <><Users className="w-4 h-4 mr-2" /> Iniciar Ajuda</>
                      )}
                    </Button>
                  </motion.div>
                )}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}