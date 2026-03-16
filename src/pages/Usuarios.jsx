import React, { useState, useEffect, useContext } from "react";
import { Usuario, Equipe } from "@/entities/all";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Users } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ActivityTimerContext } from "../components/contexts/ActivityTimerContext";

import UsuarioCard from "../components/usuarios/UsuarioCard";
import UsuarioForm from "../components/usuarios/UsuarioForm";
import UsuarioFilters from "../components/usuarios/UsuarioFilters";

export default function Usuarios() {
  const { triggerUpdate } = useContext(ActivityTimerContext);
  const [usuarios, setUsuarios] = useState([]);
  const [equipes, setEquipes] = useState([]);
  const [filteredUsuarios, setFilteredUsuarios] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingUsuario, setEditingUsuario] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUsuarios();
    loadEquipes();
  }, []);

  const loadEquipes = async () => {
    try {
      const data = await Equipe.list();
      setEquipes(data || []);
    } catch (error) {
      console.error('Erro ao carregar equipes:', error);
    }
  };

  useEffect(() => {
    filterUsuarios();
  }, [usuarios, searchTerm, statusFilter]);

  const loadUsuarios = async () => {
    setIsLoading(true);
    const data = await Usuario.list("-created_date");

    // **CORRIGIDO**: Garantir que todos os usuários tenham o campo 'perfil' definido
    const usuariosNormalizados = (data || []).map(u => ({
      ...u,
      perfil: u.perfil || 'user', // Define 'user' como padrão se não houver perfil
      // Alguns registros antigos não tinham status; sem isso o badge fica vazio.
      status: (String(u.status || '').toLowerCase() === 'inativo') ? 'inativo' : 'ativo'
    }));

    setUsuarios(usuariosNormalizados);
    setIsLoading(false);
  };

  const filterUsuarios = () => {
    let filtered = usuarios;

    if (searchTerm) {
      filtered = filtered.filter(user => {
        const nome = user.nome || "";
        const email = user.email || "";
        const cargo = user.cargo || "";
        return nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
          email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          cargo.toLowerCase().includes(searchTerm.toLowerCase());
      });
    }

    if (statusFilter !== "todos") {
      filtered = filtered.filter(user => user.status === statusFilter);
    }

    filtered = filtered.sort((a, b) => {
      const nomeA = (a.nome || a.email || '').toLowerCase();
      const nomeB = (b.nome || b.email || '').toLowerCase();
      return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
    });

    setFilteredUsuarios(filtered);
  };

  const handleSubmit = async (data) => {
    console.log('💾 Salvando usuário com dados:', data);
    console.log('   - usuarios_permitidos_visualizar:', data.usuarios_permitidos_visualizar);

    try {
      if (editingUsuario) {
        await Usuario.update(editingUsuario.id, data);
        console.log('✅ Usuário atualizado:', editingUsuario.id);
      } else {
        await Usuario.create(data);
        console.log('✅ Novo usuário criado');
      }

      setShowForm(false);
      setEditingUsuario(null);
      await loadUsuarios();

      // Trigger update no contexto para recarregar userProfile
      if (triggerUpdate) {
        console.log('🔄 Disparando atualização do contexto...');
        triggerUpdate();
      }

      console.log('✅ Página de usuários recarregada com sucesso');
    } catch (error) {
      console.error('❌ Erro ao salvar usuário:', error);
      alert('Erro ao salvar usuário. Verifique o console.');
    }
  };

  const handleEdit = (usuario) => {
    setEditingUsuario(usuario);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Tem certeza que deseja excluir este usuário?")) {
      try {
        await Usuario.delete(id);
        loadUsuarios();
      } catch (error) {
        console.error("Erro ao excluir usuário:", error);
        alert("Ocorreu um erro ao excluir o usuário.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  Usuários
                </h1>
                <p className="text-gray-600">
                  Gerencie os usuários do sistema
                </p>
              </div>
            </div>
            <Button
              onClick={() => setShowForm(true)}
              className="bg-blue-600 hover:bg-blue-700 shadow-lg"
            >
              <Plus className="w-4 h-4 mr-2" />
              Novo Usuário
            </Button>
          </div>

          <div className="flex flex-col md:flex-row gap-4 mb-8">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Buscar por nome, email ou cargo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <UsuarioFilters
              statusFilter={statusFilter}
              onStatusChange={setStatusFilter}
            />
          </div>

          <AnimatePresence>
            {showForm && (
              <UsuarioForm
                usuario={editingUsuario}
                onSubmit={handleSubmit}
                onCancel={() => {
                  setShowForm(false);
                  setEditingUsuario(null);
                }}
                allUsers={usuarios}
                equipes={equipes}
              />
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {isLoading ? (
                Array(6).fill(0).map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="bg-white rounded-xl shadow-sm h-48"></div>
                  </div>
                ))
              ) : (
                filteredUsuarios.map((usuario) => (
                  <UsuarioCard
                    key={usuario.id}
                    usuario={usuario}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))
              )}
            </AnimatePresence>
          </div>

          {filteredUsuarios.length === 0 && !isLoading && (
            <div className="text-center py-12">
              <div className="w-24 h-24 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                <Users className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Nenhum usuário encontrado
              </h3>
              <p className="text-gray-500">
                {searchTerm || statusFilter !== "todos"
                  ? "Tente ajustar os filtros de busca"
                  : "Comece criando seu primeiro usuário"
                }
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}