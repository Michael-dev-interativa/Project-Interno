import { useState, useEffect } from 'react';
import { Analitico as AnaliticoEntity, Documento, Atividade } from '@/entities/all';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import AnaliticoList from '../components/analitico/AnaliticoList';

export default function Analitico() {
  const [documento, setDocumento] = useState(null);
  const [analiticoItens, setAnaliticoItens] = useState([]);
  const [atividades, setAtividades] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  const urlParams = new URLSearchParams(window.location.search);
  const docId = urlParams.get('docId');

  useEffect(() => {
    if (docId) {
      loadData();
    }
  }, [docId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [docData, analiticoData, atividadesData] = await Promise.all([
        Documento.get(docId),
        AnaliticoEntity.filter({ documento_id: docId }),
        Atividade.list()
      ]);
      
      setDocumento(docData);
      setAnaliticoItens(analiticoData);
      
      const atividadesMap = atividadesData.reduce((acc, ativ) => {
        acc[ativ.id] = ativ;
        return acc;
      }, {});
      setAtividades(atividadesMap);

    } catch (error) {
      console.error("Erro ao carregar dados analíticos:", error);
    }
    setIsLoading(false);
  };

  if (isLoading) {
    return <div className="p-8 text-center">Carregando análise...</div>;
  }
  
  if (!documento) {
    return <div className="p-8 text-center">Documento não encontrado.</div>;
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <Link to={createPageUrl(`Empreendimento?id=${documento.empreendimento_id}`)}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar para o Empreendimento
          </Button>
        </Link>
      </div>
      <h1 className="text-3xl font-bold">Análise do Documento: {documento.nome}</h1>
      <p className="text-gray-600">Número: {documento.numero} | Disciplina: {documento.disciplina}</p>
      
      <AnaliticoList 
        analiticoItens={analiticoItens}
        atividadesMap={atividades}
      />
    </div>
  );
}