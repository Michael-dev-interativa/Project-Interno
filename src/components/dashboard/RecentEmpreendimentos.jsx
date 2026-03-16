import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, MapPin, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Skeleton } from "@/components/ui/skeleton";

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

export default function RecentEmpreendimentos({ empreendimentos, isLoading }) {
  const recentEmpreendimentos = empreendimentos.slice(0, 5);

  return (
    <Card className="bg-white border-0 shadow-lg">
      <CardHeader className="border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            <CardTitle className="text-xl font-bold text-gray-900">
              Empreendimentos Recentes
            </CardTitle>
          </div>
          <Link to={createPageUrl("Empreendimentos")}>
            <Button variant="outline" size="sm">
              Ver Todos
              <ExternalLink className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          {isLoading ? (
            Array(3).fill(0).map((_, i) => (
              <div key={i} className="flex items-center space-x-4 p-4 rounded-lg border">
                <Skeleton className="w-12 h-12 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            ))
          ) : recentEmpreendimentos.length > 0 ? (
            recentEmpreendimentos.map((empreendimento) => (
              <div key={empreendimento.id} className="flex items-center space-x-4 p-4 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  {empreendimento.foto_url ? (
                    <img 
                      src={empreendimento.foto_url} 
                      alt={empreendimento.nome}
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    <Building2 className="w-6 h-6 text-blue-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">
                    {empreendimento.nome}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>{empreendimento.cliente}</span>
                    {empreendimento.endereco && (
                      <>
                        <span>•</span>
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate">{empreendimento.endereco}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <Badge className={statusColors[empreendimento.status]}>
                  {statusLabels[empreendimento.status]}
                </Badge>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Nenhum empreendimento cadastrado</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}