import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Save, X, Search, Clock, User, Settings, Check, Pencil, Building, BookCopy, FileText, Loader2 } from "lucide-react";
import { Atividade, AlteracaoEtapa, User as Usuario } from "@/entities/all";
import { motion, AnimatePresence } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { ordenarAtividades, agruparAtividadesPorEtapa, ORDEM_ETAPAS } from '../utils/AtividadeOrdering';
import { base44 } from '@/api/base44Client';
import PDFListaDesenvolvimento from './PDFListaDesenvolvimento';

export default function AtividadesManager({ atividades, disciplinas, onUpdate, isLoading }) {
  const [showForm, setShowForm] = useState(false);
  const [editingAtividade, setEditingAtividade] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const searchRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const handleSearchChange = useCallback((value) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setSearchTerm(value), 250);
  }, []);
  const [filtroDisciplina, setFiltroDisciplina] = useState("todas");
  const [filtroEtapa, setFiltroEtapa] = useState("todas");
  const [formData, setFormData] = useState({
    etapa: "",
    disciplina: "",
    subdisciplina: "",
    atividade: "",
    funcao: "",
    predecessora: "",
    tempo: 0
  });
  const [editingIdAtividade, setEditingIdAtividade] = useState(null);
  const [tempIdValue, setTempIdValue] = useState("");

  // Estados para rastreamento de alterações
  const [alteracoesEtapa, setAlteracoesEtapa] = useState([]);
  const [isLoadingAlteracoes, setIsLoadingAlteracoes] = useState(false);

  // Carregar alterações de etapa ao montar
  useEffect(() => {
    const loadAlteracoes = async () => {
      setIsLoadingAlteracoes(true);
      try {
        const user = await Usuario.me() || { email: 'dev@local', nome: 'Dev' };
        // Buscar alterações das últimas 24h
        const dataLimite = new Date();
        dataLimite.setHours(dataLimite.getHours() - 24);

        const alteracoes = await AlteracaoEtapa.filter({
          data_alteracao: { $gte: dataLimite.toISOString() }
        });

        setAlteracoesEtapa(alteracoes || []);
      } catch (error) {
        console.error("Erro ao carregar alterações:", error);
        setAlteracoesEtapa([]);
      } finally {
        setIsLoadingAlteracoes(false);
      }
    };

    loadAlteracoes();
  }, []);

  const limparAlteracoes = async () => {
    if (!confirm("Deseja limpar o registro de alterações? Esta ação não pode ser desfeita.")) {
      return;
    }

    try {
      await Promise.all(alteracoesEtapa.map(alt => AlteracaoEtapa.delete(alt.id)));
      setAlteracoesEtapa([]);
      alert("✅ Registro de alterações limpo com sucesso!");
    } catch (error) {
      console.error("Erro ao limpar alterações:", error);
      alert("Erro ao limpar alterações: " + error.message);
    }
  };

  // CORREÇÃO: Normalizar atividades para garantir que campos sejam strings
  // Filtrar apenas atividades do catálogo (sem empreendimento_id)
  const atividadesNormalizadas = useMemo(() => {
    return (atividades || [])
      .filter(atividade => !atividade.empreendimento_id)
      .map(atividade => ({
        ...atividade,
        atividade: typeof atividade.atividade === 'string' ? atividade.atividade : '',
        disciplina: typeof atividade.disciplina === 'string' ? atividade.disciplina : '',
        subdisciplina: typeof atividade.subdisciplina === 'string' ? atividade.subdisciplina : '',
        etapa: typeof atividade.etapa === 'string' ? atividade.etapa : ''
      }));
  }, [atividades]);

  // CORREÇÃO: Usar função utilitária para ordenar
  const atividadesOrdenadas = useMemo(() => {
    return ordenarAtividades(atividadesNormalizadas);
  }, [atividadesNormalizadas]);

  // CORREÇÃO: Aplicar filtros às atividades ordenadas
  const atividadesFiltradas = useMemo(() => {
    let filtered = atividadesOrdenadas;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(atividade =>
        (atividade.atividade || '').toLowerCase().includes(term) ||
        (atividade.disciplina || '').toLowerCase().includes(term) ||
        (atividade.subdisciplina || '').toLowerCase().includes(term) ||
        (atividade.etapa || '').toLowerCase().includes(term) ||
        (atividade.id_atividade || '').toLowerCase().includes(term)
      );
    }

    if (filtroEtapa && filtroEtapa !== 'todas') {
      filtered = filtered.filter(atividade => atividade.etapa === filtroEtapa);
    }

    if (filtroDisciplina && filtroDisciplina !== 'todas') {
      filtered = filtered.filter(atividade => atividade.disciplina === filtroDisciplina);
    }

    return filtered;
  }, [atividadesOrdenadas, searchTerm, filtroEtapa, filtroDisciplina]);

  // CORREÇÃO: Usar função utilitária para agrupar
  const atividadesPorEtapa = useMemo(() => {
    return agruparAtividadesPorEtapa(atividadesFiltradas);
  }, [atividadesFiltradas]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const dataToSave = { ...formData, tempo: Number(formData.tempo) };

    try {
      if (editingAtividade) {
        // Preserve existing id_atividade if editing an existing one
        if (editingAtividade.id_atividade) {
          dataToSave.id_atividade = editingAtividade.id_atividade;
        }

        // Verificar se a etapa foi alterada
        if (editingAtividade.etapa !== dataToSave.etapa) {
          const user = await Usuario.me() || { email: 'dev@local', nome: 'Dev' };

          // Registrar alteração
          await AlteracaoEtapa.create({
            atividade_id: editingAtividade.id,
            id_atividade: editingAtividade.id_atividade || "",
            nome_atividade: editingAtividade.atividade,
            disciplina: editingAtividade.disciplina,
            subdisciplina: editingAtividade.subdisciplina || "",
            etapa_anterior: editingAtividade.etapa,
            etapa_nova: dataToSave.etapa,
            empreendimento_id: editingAtividade.empreendimento_id || null,
            empreendimento_nome: editingAtividade.empreendimento_nome || "",
            data_alteracao: new Date().toISOString(),
            usuario_email: user.email,
            usuario_nome: user.full_name || user.nome || user.email
          });

          // Recarregar alterações
          const alteracoes = await AlteracaoEtapa.list();
          setAlteracoesEtapa(alteracoes || []);
        }

        await Atividade.update(editingAtividade.id, dataToSave);
      } else {
        await Atividade.create(dataToSave);
      }

      resetForm();
      onUpdate();
    } catch (error) {
      console.error("Erro ao salvar atividade:", error);
      alert("Erro ao salvar atividade: " + error.message);
    }
  };

  const handleEdit = (atividade) => {
    setEditingAtividade(atividade);
    setFormData({
      etapa: atividade.etapa || "",
      disciplina: atividade.disciplina || "",
      subdisciplina: atividade.subdisciplina || "",
      atividade: atividade.atividade || "",
      funcao: atividade.funcao || "",
      predecessora: atividade.predecessora || "",
      tempo: atividade.tempo || 0
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (confirm("Tem certeza que deseja excluir esta atividade?")) {
      await Atividade.delete(id);
      onUpdate();
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingAtividade(null);
    setFormData({
      etapa: "",
      disciplina: "",
      subdisciplina: "",
      atividade: "",
      funcao: "",
      predecessora: "",
      tempo: 0
    });
  };

  // gerarIdAtividades function removed as per the request

  const handleEditId = (atividade) => {
    setEditingIdAtividade(atividade.id);
    setTempIdValue(atividade.id_atividade || "");
  };

  const handleSaveId = async (atividadeId) => {
    try {
      const atividade = atividades.find(a => a.id === atividadeId);
      if (!atividade) return;

      await Atividade.update(atividadeId, {
        ...atividade,
        id_atividade: tempIdValue.trim()
      });

      setEditingIdAtividade(null);
      setTempIdValue("");
      onUpdate();
    } catch (error) {
      console.error("Erro ao salvar ID:", error);
      alert("Erro ao salvar o ID da atividade.");
    }
  };

  const handleCancelEditId = () => {
    setEditingIdAtividade(null);
    setTempIdValue("");
  };

  return (
    <div className="space-y-6">
      <Card className="bg-white border-0 shadow-lg">
        <CardHeader className="border-b border-gray-100">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex-1">
              <CardTitle className="text-xl font-bold">Gerenciar Atividades</CardTitle>
              {alteracoesEtapa.length > 0 && (
                <p className="text-sm text-gray-600 mt-1">
                  {alteracoesEtapa.length} alteração(ões) de etapa registrada(s) nas últimas 24h
                </p>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <PDFListaDesenvolvimento alteracoes={alteracoesEtapa} />
              {alteracoesEtapa.length > 0 && (
                <Button
                  variant="outline"
                  onClick={limparAlteracoes}
                  className="border-red-500 text-red-600 hover:bg-red-50"
                >
                  Limpar Registro
                </Button>
              )}
              <Button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Nova Atividade
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <AnimatePresence>
            {showForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50"
              >
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="etapa">Etapa *</Label>
                      <Select value={formData.etapa} onValueChange={(value) => setFormData({ ...formData, etapa: value })} required>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a etapa" />
                        </SelectTrigger>
                        <SelectContent>
                          {ORDEM_ETAPAS.map((etapa) => (
                            <SelectItem key={etapa} value={etapa}>
                              {etapa}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="disciplina">Disciplina *</Label>
                      <Select value={formData.disciplina} onValueChange={(value) => setFormData({ ...formData, disciplina: value })} required>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a disciplina" />
                        </SelectTrigger>
                        <SelectContent>
                          {(disciplinas || []).sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).map((disciplina) => (
                            <SelectItem key={disciplina.id} value={disciplina.nome}>
                              {disciplina.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="atividade">Descrição da Atividade *</Label>
                    <Input
                      id="atividade"
                      value={formData.atividade}
                      onChange={(e) => setFormData({ ...formData, atividade: e.target.value })}
                      placeholder="Descrição detalhada da atividade"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="subdisciplina">Subdisciplina *</Label>
                      <Input
                        id="subdisciplina"
                        value={formData.subdisciplina}
                        onChange={(e) => setFormData({ ...formData, subdisciplina: e.target.value })}
                        placeholder="Ex: Instalação, Manutenção"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="funcao">Função</Label>
                      <Select value={formData.funcao} onValueChange={(value) => setFormData({ ...formData, funcao: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a função" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Projetista">Projetista</SelectItem>
                          <SelectItem value="Coordenador">Coordenador</SelectItem>
                          <SelectItem value="Supervisor">Supervisor</SelectItem>
                          <SelectItem value="Analista">Analista</SelectItem>
                          <SelectItem value="Especialista">Especialista</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="predecessora">Predecessora</Label>
                      <Input
                        id="predecessora"
                        value={formData.predecessora}
                        onChange={(e) => setFormData({ ...formData, predecessora: e.target.value })}
                        placeholder="ID da atividade anterior"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tempo">Tempo (horas)</Label>
                      <Input
                        id="tempo"
                        type="number"
                        step="0.1"
                        value={formData.tempo}
                        onChange={(e) => setFormData({ ...formData, tempo: e.target.value })}
                        placeholder="0.0"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={resetForm}>
                      <X className="w-4 h-4 mr-2" />
                      Cancelar
                    </Button>
                    <Button type="submit" className="bg-green-600 hover:bg-green-700">
                      <Save className="w-4 h-4 mr-2" />
                      Salvar
                    </Button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Filtros */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                ref={searchRef}
                placeholder="Buscar por nome, disciplina, etapa..."
                defaultValue=""
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filtroEtapa} onValueChange={setFiltroEtapa}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filtrar por etapa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as Etapas</SelectItem>
                {ORDEM_ETAPAS.map((etapa) => (
                  <SelectItem key={etapa} value={etapa}>
                    {etapa}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroDisciplina} onValueChange={setFiltroDisciplina}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filtrar por disciplina" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as Disciplinas</SelectItem>
                {(disciplinas || []).sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).map((disciplina) => (
                  <SelectItem key={disciplina.id} value={disciplina.nome}>
                    {disciplina.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {Array(5).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : Object.keys(atividadesPorEtapa).length > 0 ? (
            <div className="space-y-6">
              {Object.entries(atividadesPorEtapa).map(([etapa, atividadesDaEtapa]) => (
                <motion.div
                  key={etapa}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-2"
                >
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    <h3 className="text-lg font-semibold text-gray-800">
                      {etapa} ({atividadesDaEtapa.length})
                    </h3>
                  </div>

                  <div className="grid gap-3">
                    {atividadesDaEtapa.map(atividade => (
                      <motion.div
                        key={atividade.id}
                        whileHover={{ scale: 1.01 }}
                        className="p-4 border border-gray-200 rounded-lg bg-gray-50 hover:bg-white transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                              <h4 className="font-medium text-gray-900">
                                {typeof atividade.atividade === 'string' ? atividade.atividade : 'Sem descrição'}
                              </h4>

                              {/* NOVO: Campo de edição inline para ID */}
                              {editingIdAtividade === atividade.id ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    value={tempIdValue}
                                    onChange={(e) => setTempIdValue(e.target.value)}
                                    className="w-24 h-7 text-xs"
                                    placeholder="ID..."
                                    onKeyPress={(e) => {
                                      if (e.key === 'Enter') {
                                        handleSaveId(atividade.id);
                                      } else if (e.key === 'Escape') {
                                        handleCancelEditId();
                                      }
                                    }}
                                    autoFocus
                                  />
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleSaveId(atividade.id)}
                                    className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                                  >
                                    <Check className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleCancelEditId}
                                    className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  {atividade.id_atividade ? (
                                    <Badge
                                      variant="outline"
                                      className="text-xs bg-purple-50 text-purple-700 cursor-pointer hover:bg-purple-100"
                                      onClick={() => handleEditId(atividade)}
                                    >
                                      ID: {atividade.id_atividade}
                                      <Pencil className="w-2 h-2 ml-1" />
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="text-xs bg-gray-50 text-gray-500 cursor-pointer hover:bg-gray-100"
                                      onClick={() => handleEditId(atividade)}
                                    >
                                      Sem ID
                                      <Pencil className="w-2 h-2 ml-1" />
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap">
                              {/* NOVO: Indicador de tipo de atividade (Catálogo vs Projeto) */}
                              <span className="flex items-center gap-1.5 text-xs font-medium">
                                {atividade.empreendimento_id ? (
                                  <>
                                    <Building className="w-3.5 h-3.5 text-orange-500" />
                                    <span className="text-orange-600">Projeto</span>
                                  </>
                                ) : (
                                  <>
                                    <BookCopy className="w-3.5 h-3.5 text-indigo-500" />
                                    <span className="text-indigo-600">Catálogo</span>
                                  </>
                                )}
                              </span>

                              <span className="flex items-center gap-1">
                                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                                {atividade.disciplina}
                              </span>
                              {atividade.subdisciplina && (
                                <span className="flex items-center gap-1">
                                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                  {atividade.subdisciplina}
                                </span>
                              )}
                              {atividade.tempo > 0 && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-gray-500" />
                                  {atividade.tempo}h
                                </span>
                              )}
                              {atividade.funcao && (
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3 text-gray-500" />
                                  {atividade.funcao}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(atividade)}
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(atividade.id)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Settings className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">
                {searchTerm || filtroEtapa !== 'todas' || filtroDisciplina !== 'todas'
                  ? 'Nenhuma atividade encontrada com os filtros aplicados.'
                  : 'Nenhuma atividade cadastrada ainda.'
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}