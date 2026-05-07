import { useState, useContext } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Mail, Phone, Edit, Trash2, Shield, KeyRound, X, Save } from "lucide-react";
import { motion } from "framer-motion";
import { Usuario } from "@/entities/all";
import { ActivityTimerContext } from "../contexts/ActivityTimerContext";

const statusColors = {
  ativo: "bg-green-100 text-green-800",
  inativo: "bg-gray-100 text-gray-800"
};

const statusLabels = {
  ativo: "Ativo",
  inativo: "Inativo"
};

const perfilLabels = {
  admin: "Administrador",
  lider: "Líder",
  coordenador: "Coordenador",
  gestao: "Gestão",
  apoio: "Apoio",
  direcao: "Direção",
  user: "Colaborador"
};

const perfilColors = {
  admin: "bg-purple-100 text-purple-800",
  lider: "bg-blue-100 text-blue-800",
  coordenador: "bg-indigo-100 text-indigo-800",
  gestao: "bg-cyan-100 text-cyan-800",
  apoio: "bg-teal-100 text-teal-800",
  direcao: "bg-pink-100 text-pink-800",
  user: "bg-gray-100 text-gray-800"
};

const ALL_PROFILES = [
  { value: 'user', label: 'Colaborador' },
  { value: 'coordenador', label: 'Coordenador' },
  { value: 'apoio', label: 'Apoio' },
  { value: 'gestao', label: 'Gestão' },
  { value: 'lider', label: 'Líder' },
  { value: 'direcao', label: 'Direção' },
  { value: 'admin', label: 'Administrador' },
];

const LIDER_PROFILES = [
  { value: 'user', label: 'Colaborador' },
  { value: 'coordenador', label: 'Coordenador' },
  { value: 'apoio', label: 'Apoio' },
  { value: 'gestao', label: 'Gestão' },
];

export default function UsuarioCard({ usuario, onEdit, onDelete, onRefresh }) {
  const { user } = useContext(ActivityTimerContext);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [accessForm, setAccessForm] = useState({
    email: usuario.email || "",
    perfil: usuario.perfil || "user",
    senha: "",
    confirmarSenha: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const perfil = usuario.perfil || 'user';
  const perfilLabel = perfilLabels[perfil] || perfil;
  const perfilColor = perfilColors[perfil] || "bg-gray-100 text-gray-800";
  const status = String(usuario.status || '').toLowerCase() === 'inativo' ? 'inativo' : 'ativo';

  const availableProfiles =
    user?.role === 'admin' || user?.perfil === 'direcao'
      ? ALL_PROFILES
      : user?.perfil === 'lider'
      ? LIDER_PROFILES
      : [{ value: 'user', label: 'Colaborador' }];

  const openAccessModal = () => {
    setAccessForm({
      email: usuario.email || "",
      perfil: usuario.perfil || "user",
      senha: "",
      confirmarSenha: "",
    });
    setShowAccessModal(true);
  };

  const handleAccessSubmit = async (e) => {
    e.preventDefault();

    if (accessForm.senha && accessForm.senha.length < 6) {
      alert('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    if (accessForm.senha && accessForm.senha !== accessForm.confirmarSenha) {
      alert('A confirmação de senha não confere.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        email: accessForm.email.trim().toLowerCase(),
        perfil: accessForm.perfil,
      };
      if (accessForm.senha) {
        payload.senha = accessForm.senha;
      }
      await Usuario.update(usuario.id, payload);
      setShowAccessModal(false);
      if (onRefresh) onRefresh();
    } catch (error) {
      alert('Erro ao atualizar acesso do usuário.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        whileHover={{ y: -5 }}
        transition={{ duration: 0.2 }}
      >
        <Card className="bg-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <User className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-gray-900">
                    {usuario.nome || usuario.full_name || usuario.email}
                  </h3>
                  {usuario.cargo && (
                    <p className="text-sm text-gray-500">{usuario.cargo}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge className={statusColors[status]}>
                  {statusLabels[status]}
                </Badge>
                <Badge className={perfilColor}>
                  <Shield className="w-3 h-3 mr-1" />
                  {perfilLabel}
                </Badge>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2 text-gray-600">
                <Mail className="w-4 h-4" />
                <span className="text-sm">{usuario.email}</span>
              </div>

              {usuario.telefone && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Phone className="w-4 h-4" />
                  <span className="text-sm">{usuario.telefone}</span>
                </div>
              )}

              {usuario.departamento && (
                <div className="text-sm text-gray-500">
                  Depto: {usuario.departamento}
                </div>
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onEdit(usuario)}
                className="flex-1"
              >
                <Edit className="w-4 h-4 mr-1" />
                Editar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={openAccessModal}
                className="flex-1 border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                <KeyRound className="w-4 h-4 mr-1" />
                Acesso
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onDelete(usuario.id)}
                className="flex-1"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Excluir
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {showAccessModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                Configurar Acesso — {usuario.nome || usuario.email}
              </h2>
              <button
                onClick={() => setShowAccessModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAccessSubmit} className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="access-email">Email</Label>
                <Input
                  id="access-email"
                  type="email"
                  value={accessForm.email}
                  onChange={(e) => setAccessForm(prev => ({ ...prev, email: e.target.value }))}
                  required
                />
                <p className="text-xs text-gray-500">
                  Defina ou ajuste o email de login deste usuário.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="access-perfil">Perfil do Usuário</Label>
                <Select
                  value={accessForm.perfil}
                  onValueChange={(value) => setAccessForm(prev => ({ ...prev, perfil: value }))}
                >
                  <SelectTrigger id="access-perfil">
                    <SelectValue placeholder="Selecione o perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProfiles.map(p => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="access-senha">Nova Senha</Label>
                <Input
                  id="access-senha"
                  type="password"
                  autoComplete="new-password"
                  value={accessForm.senha}
                  onChange={(e) => setAccessForm(prev => ({ ...prev, senha: e.target.value }))}
                  placeholder="Deixe em branco para manter a atual"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="access-confirmar">Confirmar Nova Senha</Label>
                <Input
                  id="access-confirmar"
                  type="password"
                  autoComplete="new-password"
                  value={accessForm.confirmarSenha}
                  onChange={(e) => setAccessForm(prev => ({ ...prev, confirmarSenha: e.target.value }))}
                  placeholder="Repita a nova senha"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAccessModal(false)}
                >
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
          </div>
        </div>
      )}
    </>
  );
}
