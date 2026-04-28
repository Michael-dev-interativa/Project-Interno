import { useState, useEffect, useCallback } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Empreendimento } from '@/entities/all';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Calendar, BarChart3, Settings, AlertCircle } from 'lucide-react';
import { createPageUrl } from '@/utils';
import PlanejamentoTab from '../components/planejamento/PlanejamentoTab';
import SobrasTab from '../components/planejamento/SobrasTab';
import ConfiguracaoTab from '../components/planejamento/ConfiguracaoTab';
import EmpreendimentoHeader from '../components/empreendimento/EmpreendimentoHeader';

export default function PlanejamentoPage() {
    const location = useLocation();
    const [empreendimento, setEmpreendimento] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('planejamento');

    const empreendimentoId = new URLSearchParams(location.search).get("id");

    const loadEmpreendimento = useCallback(async () => {
        if (!empreendimentoId) {
            setError("ID do empreendimento não fornecido.");
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            const empData = await Empreendimento.get(empreendimentoId);
            if (empData) {
                setEmpreendimento(empData);
            } else {
                setError("Empreendimento não encontrado.");
            }
        } catch (err) {
            console.error("Erro ao carregar empreendimento:", err);
            setError("Falha ao carregar dados do empreendimento.");
        } finally {
            setIsLoading(false);
        }
    }, [empreendimentoId]);

    useEffect(() => {
        loadEmpreendimento();
    }, [loadEmpreendimento]);

    if (isLoading) {
        return (
            <div className="p-8 space-y-6">
                <Skeleton className="h-10 w-48 mb-4" />
                <Skeleton className="h-24 w-full mb-8" />
                <Skeleton className="h-12 w-full mb-4" />
                <Skeleton className="h-96 w-full" />
            </div>
        );
    }

    if (error || !empreendimento) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center p-8 bg-white rounded-lg shadow-md">
                  <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <h2 className="text-xl font-bold text-gray-800 mb-2">{error || "Empreendimento não encontrado."}</h2>
                  <p className="text-gray-600 mb-6">Não foi possível carregar os dados do planejamento.</p>
                  <Link to={createPageUrl("SeletorPlanejamento")}>
                      <Button variant="outline">
                          <ArrowLeft className="w-4 h-4 mr-2" />
                          Voltar para Seleção
                      </Button>
                  </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
            <div className="p-6 md:p-8 space-y-6">
                <div className="mb-4">
                    <Link to={createPageUrl("SeletorPlanejamento")}>
                        <Button variant="outline" size="sm">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Voltar para Seleção
                        </Button>
                    </Link>
                </div>

                <EmpreendimentoHeader empreendimento={empreendimento} />
                
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-3 bg-white shadow-sm">
                        <TabsTrigger value="planejamento">
                            <Calendar className="w-4 h-4 mr-2" />
                            Planejamento
                        </TabsTrigger>
                        <TabsTrigger value="sobras">
                            <BarChart3 className="w-4 h-4 mr-2" />
                            Sobras
                        </TabsTrigger>
                        <TabsTrigger value="configuracao">
                             <Settings className="w-4 h-4 mr-2" />
                             Configuração
                        </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="planejamento" className="mt-6">
                       <PlanejamentoTab empreendimentoId={empreendimentoId} />
                    </TabsContent>
                    
                    <TabsContent value="sobras" className="mt-6">
                        <SobrasTab empreendimentoId={empreendimentoId} />
                    </TabsContent>
                    
                    <TabsContent value="configuracao" className="mt-6">
                        <ConfiguracaoTab empreendimentoId={empreendimentoId} />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}