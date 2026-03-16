import { useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, AlertTriangle } from "lucide-react";
import { differenceInDays } from 'date-fns';

export default function AlertaAtividadesAtrasadas({ planejamentos }) {
  
  const atividadesAtrasadas = useMemo(() => {
    if (!planejamentos) return [];
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Comparar apenas a data

    return planejamentos.filter(plano => {
      if (plano.status === 'concluido' || !plano.termino_planejado) {
        return false;
      }
      const dataTermino = new Date(plano.termino_planejado);
      return dataTermino < today;
    });
  }, [planejamentos]);

  if (atividadesAtrasadas.length === 0) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="relative p-2 h-auto">
          <Bell className="w-5 h-5 text-yellow-600 animate-pulse" />
          <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-600 text-white">
            {atividadesAtrasadas.length}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-4">
          <h4 className="font-medium text-center">Atividades Atrasadas</h4>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {atividadesAtrasadas.map(plano => (
              <div key={plano.id} className="p-3 border rounded-md bg-red-50/50">
                <p className="font-semibold text-sm">{plano.atividade?.atividade || 'Atividade'}</p>
                <p className="text-xs text-gray-600 mb-1">{plano.empreendimento?.nome || 'Projeto'}</p>
                <div className="flex items-center gap-1 text-red-700">
                  <AlertTriangle className="w-3 h-3" />
                  <span className="text-xs font-bold">
                    {differenceInDays(new Date(), new Date(plano.termino_planejado))} dias de atraso
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}