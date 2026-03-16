import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, Mail, Phone, Edit, Trash2, Shield } from "lucide-react";
import { motion } from "framer-motion";

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

export default function UsuarioCard({ usuario, onEdit, onDelete }) {
  // **CORRIGIDO**: Determinar o perfil correto
  const perfil = usuario.perfil || 'user';
  const perfilLabel = perfilLabels[perfil] || perfil;
  const perfilColor = perfilColors[perfil] || "bg-gray-100 text-gray-800";
  const status = String(usuario.status || '').toLowerCase() === 'inativo' ? 'inativo' : 'ativo';

  return (
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

          <div className="flex gap-2">
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
  );
}