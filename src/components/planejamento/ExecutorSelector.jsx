import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Users, UserCheck, X } from "lucide-react";

export default function ExecutorSelector({ 
  usuarios = [], 
  selectedExecutores = [], 
  selectedPrincipal = '', 
  onChange 
}) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Garantir que temos arrays válidos
  const validExecutores = Array.isArray(selectedExecutores) ? selectedExecutores : [];
  const validUsuarios = Array.isArray(usuarios) ? usuarios : [];

  const handleExecutorToggle = (email, checked) => {
    let newExecutores;
    if (checked) {
      newExecutores = [...validExecutores, email];
    } else {
      newExecutores = validExecutores.filter(e => e !== email);
    }
    
    // Se removemos o principal, definir um novo ou limpar
    let newPrincipal = selectedPrincipal;
    if (!checked && email === selectedPrincipal) {
      newPrincipal = newExecutores.length > 0 ? newExecutores[0] : '';
    }
    
    // Se é o primeiro executor e não temos principal, torná-lo principal
    if (checked && !selectedPrincipal && newExecutores.length === 1) {
      newPrincipal = email;
    }
    
    onChange(newExecutores, newPrincipal);
  };

  const handlePrincipalChange = (email) => {
    // Garantir que o principal está na lista de executores
    let newExecutores = validExecutores;
    if (!validExecutores.includes(email)) {
      newExecutores = [...validExecutores, email];
    }
    onChange(newExecutores, email);
  };

  const removeExecutor = (email) => {
    const newExecutores = validExecutores.filter(e => e !== email);
    const newPrincipal = email === selectedPrincipal 
      ? (newExecutores.length > 0 ? newExecutores[0] : '') 
      : selectedPrincipal;
    onChange(newExecutores, newPrincipal);
  };

  const getUsuarioNome = (email) => {
    const usuario = validUsuarios.find(u => u.email === email);
    return usuario ? (usuario.nome || email) : email;
  };

  return (
    <div className="space-y-2">
      {/* Lista de executores selecionados */}
      <div className="flex flex-wrap gap-1 min-h-[32px] p-2 border rounded-md bg-gray-50">
        {validExecutores.length > 0 ? (
          validExecutores.map(email => (
            <Badge 
              key={email} 
              variant={email === selectedPrincipal ? "default" : "secondary"}
              className="flex items-center gap-1"
            >
              {email === selectedPrincipal && <UserCheck className="w-3 h-3" />}
              {getUsuarioNome(email)}
              <button
                onClick={() => removeExecutor(email)}
                className="ml-1 hover:bg-red-100 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))
        ) : (
          <span className="text-gray-500 text-sm">Nenhum executor selecionado</span>
        )}
      </div>

      {/* Seletor de executores */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start">
            <Users className="w-4 h-4 mr-2" />
            Adicionar Executores ({validExecutores.length})
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3">
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Selecionar Executores</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {validUsuarios.map(usuario => (
                <div key={usuario.email} className="flex items-center space-x-2">
                  <Checkbox
                    id={usuario.email}
                    checked={validExecutores.includes(usuario.email)}
                    onCheckedChange={(checked) => handleExecutorToggle(usuario.email, checked)}
                  />
                  <label htmlFor={usuario.email} className="text-sm flex-1 cursor-pointer">
                    {usuario.nome || usuario.email}
                  </label>
                </div>
              ))}
            </div>
            
            {validExecutores.length > 1 && (
              <div className="border-t pt-3">
                <h5 className="font-medium text-sm mb-2">Executor Principal</h5>
                <Select value={selectedPrincipal} onValueChange={handlePrincipalChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Escolha o principal" />
                  </SelectTrigger>
                  <SelectContent>
                    {validExecutores.map(email => (
                      <SelectItem key={email} value={email}>
                        {getUsuarioNome(email)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}