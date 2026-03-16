import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, User } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

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

export default function EmpreendimentoHeader({ empreendimento }) {
  return (
    <div>
      <div className="mb-4">
        <Link to={createPageUrl("Empreendimentos")}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar para Empreendimentos
          </Button>
        </Link>
      </div>
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-3xl font-bold text-gray-900">
              {empreendimento.nome}
            </h1>
            <Badge className={statusColors[empreendimento.status]}>
              {statusLabels[empreendimento.status]}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-600">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4" />
              <span>{empreendimento.cliente}</span>
            </div>
            {empreendimento.endereco && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span>{empreendimento.endereco}</span>
              </div>
            )}
          </div>
        </div>
        {empreendimento.foto_url && (
          <img 
            src={empreendimento.foto_url} 
            alt={empreendimento.nome} 
            className="w-full md:w-48 h-32 object-cover rounded-lg shadow-md"
          />
        )}
      </div>
    </div>
  );
}