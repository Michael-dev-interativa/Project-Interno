import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, MapPin, User, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";


const statusStyles = {
  ativo: "bg-green-100 text-green-800",
  em_planejamento: "bg-blue-100 text-blue-800",
  concluido: "bg-gray-100 text-gray-800",
  pausado: "bg-yellow-100 text-yellow-800"
};

const statusLabels = {
  ativo: "Ativo",
  em_planejamento: "Em Planejamento",
  concluido: "Concluído",
  pausado: "Pausado"
};

export default function ComercialCard({ empreendimento, canEdit, onEdit, onDelete }) {
  return (
    <Card className="bg-white shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
      {empreendimento.foto_url && (
        <div className="h-40 overflow-hidden">
          <img 
            src={empreendimento.foto_url} 
            alt={empreendimento.nome}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h3 className="font-semibold text-lg text-gray-900 line-clamp-1">
              {empreendimento.nome}
            </h3>
            <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
              <User className="w-3 h-3" />
              <span>{empreendimento.cliente}</span>
            </div>
          </div>
          <Badge className={statusStyles[empreendimento.status] || statusStyles.em_planejamento}>
            {statusLabels[empreendimento.status] || "Em Planejamento"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {empreendimento.endereco && (
          <div className="flex items-start gap-2 text-sm text-gray-600">
            <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span className="line-clamp-2">{empreendimento.endereco}</span>
          </div>
        )}

        <div className="flex justify-between gap-2 pt-2 border-t">
          <Link to={createPageUrl(`ComercialDetalhes?id=${empreendimento.id}`)}>
            <Button variant="default" size="sm" className="bg-purple-600 hover:bg-purple-700">
              <ExternalLink className="w-4 h-4 mr-1" />
              Abrir Projeto
            </Button>
          </Link>
          
          {canEdit && (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => onEdit(empreendimento)}>
                <Pencil className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onDelete(empreendimento.id)} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}