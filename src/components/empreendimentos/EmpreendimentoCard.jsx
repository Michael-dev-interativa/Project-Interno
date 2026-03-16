
import { memo } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, MapPin, User, Edit, ExternalLink, Trash2, MoreVertical, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


const statusColors = {
  ativo: "bg-green-100 text-green-800",
  em_planejamento: "bg-yellow-100 text-yellow-800",
  concluido: "bg-blue-100 text-blue-800",
  pausado: "bg-gray-100 text-gray-800"
};

const statusLabels = {
  ativo: "Ativo",
  em_planejamento: "Em Planejamento",
  concluido: "Concluído",
  pausado: "Pausado"
};

function EmpreendimentoCard({ empreendimento, user, onEdit, onDelete }) {
  const status = statusLabels[empreendimento?.status] ? empreendimento.status : 'ativo';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      whileHover={{ y: -5 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="bg-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col">
        <div className="relative">
          {empreendimento.foto_url ? (
            <img
              src={empreendimento.foto_url}
              alt={empreendimento.nome}
              className="w-full h-48 object-cover"
            />
          ) : (
            <div className="w-full h-48 bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center">
              <Building2 className="w-16 h-16 text-blue-500" />
            </div>
          )}
          <div className="absolute top-4 right-4">
            <Badge className={statusColors[status]}>
              {statusLabels[status]}
            </Badge>
          </div>
          <div className="absolute top-3 left-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 bg-white/70 hover:bg-white backdrop-blur-sm rounded-full">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {user && (user.role === 'admin' || user.role === 'lider') && (
                  <DropdownMenuItem onClick={() => onEdit(empreendimento)}>
                    <Edit className="w-4 h-4 mr-2" />
                    Editar
                  </DropdownMenuItem>
                )}
                {user && user.role === 'admin' && (
                  <DropdownMenuItem onClick={() => onDelete(empreendimento.id)} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Excluir
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <CardContent className="p-6 flex-grow flex flex-col">
          <div className="flex-grow">
            <h3 className="font-bold text-xl text-gray-900 mb-2 line-clamp-1">
              {empreendimento.nome}
            </h3>

            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2 text-gray-600">
                <User className="w-4 h-4" />
                <span className="text-sm">{empreendimento.cliente}</span>
              </div>

              {empreendimento.endereco && (
                <div className="flex items-center gap-2 text-gray-600">
                  <MapPin className="w-4 h-4" />
                  <span className="text-sm line-clamp-1">{empreendimento.endereco}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 mt-auto pt-4">
            <Link to={createPageUrl(`Empreendimento?id=${empreendimento.id}`)} className="flex-1">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 w-full">
                <ExternalLink className="w-4 h-4 mr-2" />
                Abrir Projeto
              </Button>
            </Link>
            <Link to={createPageUrl(`Planejamento?id=${empreendimento.id}`)}>
              <Button size="sm" variant="outline" className="border-green-600 text-green-600 hover:bg-green-50">
                <Calendar className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default memo(EmpreendimentoCard);
