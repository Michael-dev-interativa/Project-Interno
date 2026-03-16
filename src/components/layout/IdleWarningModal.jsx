import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock } from "lucide-react";

export default function IdleWarningModal({ isOpen, timeUntilIdle, onExtendSession }) {
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-600">
            <AlertTriangle className="w-5 h-5" />
            Atividade será pausada por inatividade
          </DialogTitle>
        </DialogHeader>
        
        <div className="text-center py-6">
          <div className="w-20 h-20 mx-auto mb-4 bg-orange-100 rounded-full flex items-center justify-center">
            <Clock className="w-10 h-10 text-orange-600" />
          </div>
          
          <p className="text-gray-600 mb-4">
            Detectamos que você está inativo há alguns segundos.
          </p>
          
          <div className="text-2xl font-bold text-orange-600 mb-2">
            {formatTime(timeUntilIdle)}
          </div>
          
          <p className="text-sm text-gray-500">
            A atividade atual será pausada automaticamente se não houver interação.
          </p>
        </div>
        
        <DialogFooter>
          <Button onClick={onExtendSession} className="w-full bg-blue-600 hover:bg-blue-700">
            Continuar Trabalhando
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}