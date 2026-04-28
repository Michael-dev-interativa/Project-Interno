import React, { useState, useContext, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Save, Users } from "lucide-react";
import { motion } from "framer-motion";
import { ActivityTimerContext } from '../contexts/ActivityTimerContext';

export default function UsuarioForm({ usuario, onSubmit, onCancel, allUsers, equipes = [] }) {
  const { user } = useContext(ActivityTimerContext);
  const [formData, setFormData] = useState({
    nome: usuario?.nome || "",
    email: usuario?.email || "",
    cargo: usuario?.cargo || "",
    departamento: usuario?.departamento || "",
    equipe_id: usuario?.equipe_id || "",
    telefone: usuario?.telefone || "",
    data_admissao: usuario?.data_admissao || "",
    status: usuario?.status || "ativo",
    perfil: usuario?.perfil || "user",
    senha: "",
    confirmarSenha: "",
    datas_indisponiveis: Array.isArray(usuario?.datas_indisponiveis) ? usuario.datas_indisponiveis.filter(Boolean) : [],
    datas_indisponiveis_text: Array.isArray(usuario?.datas_indisponiveis) ? usuario.datas_indisponiveis.join('\n') : String(usuario?.datas_indisponiveis || ''),
    new_unavailable_date: "",
    usuarios_permitidos_visualizar: usuario?.usuarios_permitidos_visualizar || []
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const parseDateToISO = (value) => {
    if (!value) return null;
    const trimmed = String(value).trim();
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }
    const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (brMatch) {
      return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
    }
    const parsed = new Date(`${trimmed}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return null;
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDateDisplay = (dateValue) => {
    const iso = parseDateToISO(dateValue);
    if (!iso) return String(dateValue || '');
    const [year, month, day] = iso.split('-');
    return `${day}/${month}/${year}`;
  };

  const normalizeDateList = (values) => {
    const normalized = (values || [])
      .map((item) => parseDateToISO(item))
      .filter(Boolean);
    return Array.from(new Set(normalized));
  };

  const addUnavailableDate = () => {
    const isoDate = parseDateToISO(formData.new_unavailable_date);
    if (!isoDate) {
      alert('Informe uma data válida para adicionar.');
      return;
    }
    setFormData((prev) => ({
      ...prev,
      datas_indisponiveis: normalizeDateList([...prev.datas_indisponiveis, isoDate]),
      datas_indisponiveis_text: normalizeDateList([...prev.datas_indisponiveis, isoDate]).join('\n'),
      new_unavailable_date: '',
    }));
  };

  const removeUnavailableDate = (index) => {
    setFormData((prev) => {
      const updated = prev.datas_indisponiveis.filter((_, idx) => idx !== index);
      return {
        ...prev,
        datas_indisponiveis: updated,
        datas_indisponiveis_text: updated.join('\n'),
      };
    });
  };

  const importUnavailableDates = () => {
    const parsed = normalizeDateList(String(formData.datas_indisponiveis_text || '').split(/\r?\n|,/));
    setFormData((prev) => {
      const merged = normalizeDateList([...prev.datas_indisponiveis, ...parsed]);
      return {
        ...prev,
        datas_indisponiveis: merged,
        datas_indisponiveis_text: merged.join('\n'),
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const senhaInformada = !!formData.senha?.trim();
    const confirmarInformada = !!formData.confirmarSenha?.trim();

    if (!usuario && !senhaInformada) {
      alert('Informe uma senha para o novo usuário.');
      return;
    }

    if (senhaInformada && formData.senha.length < 6) {
      alert('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    if (!usuario && !confirmarInformada) {
      alert('Confirme a senha para o novo usuário.');
      return;
    }

    // Em edição, só valida confirmação se algum campo de senha foi preenchido.
    if (usuario && (senhaInformada || confirmarInformada) && !confirmarInformada) {
      alert('Confirme a nova senha para salvar a alteração.');
      return;
    }

    if ((senhaInformada || confirmarInformada) && formData.senha !== formData.confirmarSenha) {
      alert('A confirmação de senha não confere.');
      return;
    }

    setIsSubmitting(true);
    try {
      const typedDates = normalizeDateList([...(formData.datas_indisponiveis || []), formData.new_unavailable_date]);
      const pastedDates = normalizeDateList(String(formData.datas_indisponiveis_text || '').split(/\r?\n|,/));
      const datasIndisponiveis = normalizeDateList([...typedDates, ...pastedDates]);

      await onSubmit({
        ...formData,
        email: formData.email.trim().toLowerCase(),
        datas_indisponiveis: datasIndisponiveis.length > 0 ? datasIndisponiveis : undefined,
        senha: formData.senha || undefined,
        confirmarSenha: undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // **NOVO**: Determinar perfis disponíveis baseado no usuário logado
  const getAvailableProfiles = () => {
    // Admin e Direção têm acesso a todos os perfis
    if (user?.role === 'admin' || user?.perfil === 'direcao') {
      return [
        { value: 'user', label: 'Colaborador' },
        { value: 'coordenador', label: 'Coordenador' },
        { value: 'apoio', label: 'Apoio' },
        { value: 'gestao', label: 'Gestão' },
        { value: 'lider', label: 'Líder' },
        { value: 'direcao', label: 'Direção' },
        { value: 'admin', label: 'Administrador' },
      ];
    }
    
    // Líder pode criar apenas colaboradores, coordenadores, apoio e gestão
    if (user?.perfil === 'lider') {
      return [
        { value: 'user', label: 'Colaborador' },
        { value: 'coordenador', label: 'Coordenador' },
        { value: 'apoio', label: 'Apoio' },
        { value: 'gestao', label: 'Gestão' },
      ];
    }
    
    // Outros usuários (não deveriam chegar aqui, mas por segurança)
    return [
      { value: 'user', label: 'Colaborador' },
    ];
  };

  const availableProfiles = getAvailableProfiles();

  // Lista de usuários disponíveis para seleção (exceto o próprio usuário sendo editado)
  const availableUsers = useMemo(() => {
    return (allUsers || [])
      .filter(u => u.email !== formData.email && u.nome)
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  }, [allUsers, formData.email]);

  // Alternar seleção de usuário permitido
  const toggleUserPermission = (email) => {
    setFormData(prev => {
      const current = prev.usuarios_permitidos_visualizar || [];
      const updated = current.includes(email)
        ? current.filter(e => e !== email)
        : [...current, email];
      return { ...prev, usuarios_permitidos_visualizar: updated };
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-hidden"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        <Card className="bg-white shadow-2xl flex flex-col flex-1 overflow-hidden">
          <CardHeader className="border-b border-gray-100 flex-shrink-0 overflow-hidden">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-bold">
                {usuario ? "Editar Usuário" : "Novo Usuário"}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={onCancel}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          
          <CardContent className="p-6 overflow-y-auto flex-1 flex flex-col">
            <form onSubmit={handleSubmit} className="space-y-6 flex-1 flex flex-col">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome Completo *</Label>
                  <Input
                    id="nome"
                    value={formData.nome}
                    onChange={(e) => handleInputChange("nome", e.target.value)}
                    placeholder="Digite o nome completo"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    placeholder="email@exemplo.com"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cargo">Cargo</Label>
                  <Input
                    id="cargo"
                    value={formData.cargo}
                    onChange={(e) => handleInputChange("cargo", e.target.value)}
                    placeholder="Ex: Analista, Gerente"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="departamento">Departamento</Label>
                  <Input
                    id="departamento"
                    value={formData.departamento}
                    onChange={(e) => handleInputChange("departamento", e.target.value)}
                    placeholder="Ex: TI, RH, Financeiro"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="equipe">Equipe</Label>
                <Select
                  value={formData.equipe_id || "sem_equipe"}
                  onValueChange={(value) => handleInputChange("equipe_id", value === "sem_equipe" ? "" : value)}
                >
                  <SelectTrigger id="equipe">
                    <SelectValue placeholder="Selecione a equipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sem_equipe">Sem equipe</SelectItem>
                    {equipes.map(equipe => (
                      <SelectItem key={equipe.id} value={equipe.id}>
                        {equipe.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="telefone">Telefone</Label>
                  <Input
                    id="telefone"
                    value={formData.telefone}
                    onChange={(e) => handleInputChange("telefone", e.target.value)}
                    placeholder="(11) 99999-9999"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="data_admissao">Data de Admissão</Label>
                  <Input
                    id="data_admissao"
                    type="date"
                    value={formData.data_admissao}
                    onChange={(e) => handleInputChange("data_admissao", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="senha">{usuario ? 'Nova senha' : 'Senha'} {usuario ? '' : '*'}</Label>
                  <Input
                    id="senha"
                    type="password"
                    autoComplete="new-password"
                    value={formData.senha}
                    onChange={(e) => handleInputChange('senha', e.target.value)}
                    placeholder={usuario ? 'Preencha apenas para alterar' : 'Mínimo de 6 caracteres'}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmarSenha">Confirmar senha {usuario ? '' : '*'}</Label>
                  <Input
                    id="confirmarSenha"
                    type="password"
                    autoComplete="new-password"
                    value={formData.confirmarSenha}
                    onChange={(e) => handleInputChange('confirmarSenha', e.target.value)}
                    placeholder="Repita a senha"
                  />
                </div>
              </div>

              <p className="text-xs text-gray-500 -mt-2">
                {usuario ? 'Se deixar os campos de senha em branco, a senha atual será mantida.' : 'A senha será usada na tela de login do sistema.'}
              </p>

              {/* **MODIFICADO**: Perfil de Acesso Select - agora com opções filtradas */}
              <div className="space-y-2">
                <Label htmlFor="perfil">Perfil de Acesso</Label>
                <Select
                  value={formData.perfil}
                  onValueChange={(value) => handleInputChange("perfil", value)}
                >
                  <SelectTrigger id="perfil">
                    <SelectValue placeholder="Selecione o perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProfiles.map(profile => (
                      <SelectItem key={profile.value} value={profile.value}>
                        {profile.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(user?.role === 'admin' || user?.perfil === 'direcao') && (
                  <p className="text-xs text-gray-500">
                    <strong>Direção:</strong> Acesso completo incluindo aba de Gestão nos empreendimentos
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <Label htmlFor="new_unavailable_date">Datas de feriado / férias</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                  <div className="md:col-span-2">
                    <Input
                      id="new_unavailable_date"
                      type="date"
                      value={formData.new_unavailable_date}
                      onChange={(e) => handleInputChange('new_unavailable_date', e.target.value)}
                      placeholder="Selecione uma data"
                    />
                  </div>
                  <Button type="button" onClick={addUnavailableDate} className="w-full md:w-auto">
                    Adicionar data
                  </Button>
                </div>

                {formData.datas_indisponiveis?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.datas_indisponiveis.map((date, index) => (
                      <div key={`${date}-${index}`} className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm">
                        <span>{formatDateDisplay(date)}</span>
                        <button
                          type="button"
                          onClick={() => removeUnavailableDate(index)}
                          className="text-gray-500 hover:text-gray-700"
                          aria-label={`Remover ${formatDateDisplay(date)}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <Textarea
                  id="datas_indisponiveis_text"
                  value={formData.datas_indisponiveis_text}
                  onChange={(e) => handleInputChange('datas_indisponiveis_text', e.target.value)}
                  placeholder="Cole datas em linhas separadas ou separadas por vírgula (Ex: 2026-07-15 ou 15/07/2026)"
                  rows={3}
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-500">
                    Informe as datas de feriado e férias do usuário. Serão bloqueadas no planejamento.
                  </p>
                  <Button type="button" variant="outline" onClick={importUnavailableDates}>
                    Importar datas
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status} onValueChange={(value) => handleInputChange("status", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Seleção de usuários permitidos */}
              <div className="space-y-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  <Label className="text-sm font-semibold text-blue-900">
                    Usuários que este usuário pode visualizar no calendário
                  </Label>
                </div>
                <p className="text-xs text-gray-600">
                  Selecione os usuários cujos calendários este usuário poderá acessar
                </p>
                
                {availableUsers.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto space-y-2 mt-3">
                    {availableUsers.map(u => (
                      <div key={u.email} className="flex items-center space-x-2 p-2 bg-white rounded hover:bg-gray-50">
                        <input
                          type="checkbox"
                          id={`user-${u.email}`}
                          checked={formData.usuarios_permitidos_visualizar?.includes(u.email) || false}
                          onChange={() => toggleUserPermission(u.email)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <Label htmlFor={`user-${u.email}`} className="cursor-pointer text-sm flex-1">
                          {u.nome}
                          <span className="text-xs text-gray-500 ml-2">({u.email})</span>
                        </Label>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic">Nenhum outro usuário disponível</p>
                )}
                
                {formData.usuarios_permitidos_visualizar?.length > 0 && (
                  <p className="text-xs text-blue-700 font-medium mt-2">
                    ✓ {formData.usuarios_permitidos_visualizar.length} usuário(s) selecionado(s)
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-4 flex-shrink-0">
                <Button type="button" variant="outline" onClick={onCancel}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isSubmitting ? "Salvando..." : "Salvar"}
                </Button>
              </div>
              </form>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}