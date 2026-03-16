import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { PlanejamentoDocumento } from '@/entities/all';
import { format, addDays, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';

export default function PlanejamentoDocumentoDataModal({
  isOpen,
  onClose,
  documento,
  documentos,
  planejamentosDoc,
  onSuccess
}) {
  const [novaData, setNovaData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sucessoras, setSucessoras] = useState([]);

  useEffect(() => {
    if (isOpen && documento?.inicio_planejado) {
      setNovaData(parseISO(documento.inicio_planejado));
      calcularSucessoras();
    }
  }, [isOpen, documento]);

  // Calcula quais documentos são sucessoras desta
  const calcularSucessoras = () => {
    const chain = [];
    let current = documento;

    // Encontra toda a cadeia de sucessoras
    const findSucessoras = (doc) => {
      const sucessoresIDs = documentos
        .filter(d => d.predecessora_id === doc.id)
        .map(d => d.id);

      sucessoresIDs.forEach(docId => {
        const nextDoc = documentos.find(d => d.id === docId);
        if (nextDoc) {
          chain.push(nextDoc);
          findSucessoras(nextDoc);
        }
      });
    };

    findSucessoras(documento);
    setSucessoras(chain);
  };

  const handleSalvar = async () => {
    if (!novaData) return;

    setIsLoading(true);
    try {
      // Calcula diferença de dias
      const dataOriginal = parseISO(documento.inicio_planejado);
      const diferenca = Math.floor((novaData - dataOriginal) / (1000 * 60 * 60 * 24));

      // Atualiza documento principal
      await PlanejamentoDocumento.update(documento.id, {
        inicio_planejado: format(novaData, 'yyyy-MM-dd')
      });

      // Atualiza todas as sucessoras
      for (const sucessora of sucessoras) {
        const dataAtualSucessora = parseISO(sucessora.inicio_planejado);
        const novaDataSucessora = addDays(dataAtualSucessora, diferenca);

        await PlanejamentoDocumento.update(sucessora.id, {
          inicio_planejado: format(novaDataSucessora, 'yyyy-MM-dd')
        });
      }

      alert(`✅ Data atualizada! ${sucessoras.length} documento(s) sucessor(es) também foi(foram) ajustado(s).`);
      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      console.error('Erro ao atualizar datas:', error);
      alert('Erro ao atualizar datas. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!documento) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5" />
            Alterar Data do Planejamento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label className="text-sm font-medium text-gray-700 mb-2 block">
              Documento: {documento.numero}
            </Label>
            <p className="text-xs text-gray-500">{documento.descritivo}</p>
          </div>

          <div>
            <Label htmlFor="data" className="text-sm font-medium text-gray-700 mb-2 block">
              Nova Data de Início
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {novaData ? format(novaData, 'dd/MM/yyyy', { locale: pt }) : 'Selecione a data'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={novaData}
                  onSelect={setNovaData}
                  locale={pt}
                />
              </PopoverContent>
            </Popover>
          </div>

          {sucessoras.length > 0 && (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <Label className="text-sm font-medium text-blue-900 mb-2 block">
                Documentos que serão ajustados automaticamente:
              </Label>
              <ul className="space-y-1">
                {sucessoras.map((suc, idx) => (
                  <li key={suc.id} className="text-xs text-blue-800">
                    <span className="font-medium">{suc.numero}</span> - {suc.descritivo}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-blue-700 mt-2 font-medium">
                Total: {sucessoras.length} documento(s) será(ão) ajustado(s)
              </p>
            </div>
          )}

          {sucessoras.length === 0 && (
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-600">
                Nenhum documento depende desta folha (sem sucessoras).
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={isLoading || !novaData}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}