import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";
import { Atividade, Empreendimento } from "@/entities/all";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import jsPDF from 'jspdf';

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/577f93874_logo_Interativa_versao_final_sem_fundo_0002.png";

export default function PDFListaDesenvolvimento({ empreendimentoId = null }) {
  const [isGenerating, setIsGenerating] = useState(false);

  const buscarDadosCompletos = async () => {
    try {
      const [empreendimentos, atividadesEmp, todasAtividades] = await Promise.all([
        Empreendimento.filter({ id: empreendimentoId }),
        Atividade.filter({ empreendimento_id: empreendimentoId, limit: 5000 }),
        Atividade.list()
      ]);

      const emp = empreendimentos?.[0] || {};
      const dadosCliente = {
        construtora: emp.cliente || "",
        empreendimento: emp.nome || ""
      };

      // IDs excluídos globalmente via override com tempo=-999
      const excludedActivitiesSet = new Set();
      (atividadesEmp || []).forEach(pa => {
        if (pa.id_atividade && pa.tempo === -999 && !pa.documento_id) {
          excludedActivitiesSet.add(pa.id_atividade);
        }
      });

      // Mapa de deduplicação: chave = "nome|||etapa"
      const atividadesMap = new Map();

      const addAtividade = (nome, etapa, disciplina, subdisciplina) => {
        if (!nome) return;
        const key = `${nome}|||${etapa || ''}`;
        if (!atividadesMap.has(key)) {
          atividadesMap.set(key, {
            nome,
            etapa: etapa || '',
            disciplina: disciplina || 'Sem disciplina',
            subdisciplina: subdisciplina || '',
          });
        }
      };

      // 1. Atividades específicas do projeto (não overrides, não exclusões)
      (atividadesEmp || []).forEach(pa => {
        if (pa.tempo === -999 || pa.id_atividade) return;
        addAtividade(pa.atividade, pa.etapa, pa.disciplina, pa.subdisciplina);
      });

      // 2. Todas as atividades do catálogo (sem empreendimento_id), exceto as excluídas
      (todasAtividades || [])
        .filter(a => !a.empreendimento_id)
        .forEach(a => {
          if (excludedActivitiesSet.has(a.id)) return;
          addAtividade(a.atividade, a.etapa, a.disciplina, a.subdisciplina);
        });

      // Agrupar por etapa
      const atividadesPorEtapa = {};
      atividadesMap.forEach(({ nome, etapa, disciplina, subdisciplina }) => {
        const k = etapa || 'Outras';
        if (!atividadesPorEtapa[k]) atividadesPorEtapa[k] = [];
        atividadesPorEtapa[k].push({ nome, disciplina, subdisciplina });
      });

      // Ordenar etapas e atividades dentro de cada etapa
      const ordemEtapas = ['Concepção', 'Planejamento', 'Estudo Preliminar', 'Ante-Projeto', 'Projeto Básico', 'Projeto Executivo', 'Liberado para Obra'];
      const etapasOrdenadas = {};
      ordemEtapas.forEach(etapa => {
        if (atividadesPorEtapa[etapa]) {
          etapasOrdenadas[etapa] = atividadesPorEtapa[etapa].sort((a, b) =>
            a.nome.localeCompare(b.nome, 'pt-BR')
          );
        }
      });

      return { dadosCliente, atividadesPorEtapa: etapasOrdenadas };
    } catch (error) {
      console.error("Erro ao buscar dados:", error);
      throw error;
    }
  };



  const handleGerarPDF = async () => {
    if (!empreendimentoId) return;

    setIsGenerating(true);
    
    try {
      // Buscar dados do empreendimento e atividades
      const { dadosCliente, atividadesPorEtapa } = await buscarDadosCompletos();
      
      if (!dadosCliente.construtora || !dadosCliente.empreendimento) {
        alert("Erro: Dados do empreendimento não encontrados.");
        setIsGenerating(false);
        return;
      }
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.width;
      const pageHeight = pdf.internal.pageSize.height;
      const margin = 15;
      let yPos = 20;

      // === CABEÇALHO ===
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = LOGO_URL;
        });
        const logoWidth = 35;
        const logoHeight = (img.height / img.width) * logoWidth;
        pdf.addImage(img, 'PNG', (pageWidth - logoWidth) / 2, yPos, logoWidth, logoHeight);
        yPos += logoHeight + 10;
      } catch (error) {
        yPos += 10;
      }

      // Título
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.text('RESUMO DE ATIVIDADES DO EMPREENDIMENTO', pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;

      // Dados do cliente
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text(`CONSTRUTORA ${dadosCliente.construtora.toUpperCase()}`, margin, yPos);
      yPos += 6;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.text(`Empreendimento: ${dadosCliente.empreendimento}`, margin, yPos);
      yPos += 10;

      // APRESENTAÇÃO
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text('APRESENTAÇÃO', margin, yPos);
      yPos += 6;
      
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      const apresentacao = `Este documento apresenta o resumo completo de todas as atividades planejadas para este empreendimento, organizadas por etapa de desenvolvimento e disciplina.`;
      const linhasApresentacao = pdf.splitTextToSize(apresentacao, pageWidth - 2 * margin);
      pdf.text(linhasApresentacao, margin, yPos);
      yPos += (linhasApresentacao.length * 5) + 10;

      // Função para verificar quebra de página
      const checkPageBreak = (necessarySpace) => {
        if (yPos + necessarySpace > pageHeight - margin) {
          pdf.addPage();
          yPos = margin;
          return true;
        }
        return false;
      };

      // === LISTA DE ATIVIDADES POR ETAPA ===
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text('LISTA DE ATIVIDADES POR ETAPA', margin, yPos);
      yPos += 10;

      let atividadeCounter = 1;
      
      const ordemEtapas = ['Concepção', 'Planejamento', 'Estudo Preliminar', 'Ante-Projeto', 'Projeto Básico', 'Projeto Executivo', 'Liberado para Obra'];
      
      ordemEtapas.forEach((etapa, etapaIndex) => {
        const atividades = atividadesPorEtapa[etapa];
        if (!atividades || atividades.length === 0) return;
        // Se a etapa tem 6 ou mais atividades e não é a primeira, começar em nova página
        if (atividades.length >= 6 && etapaIndex > 0) {
          pdf.addPage();
          yPos = margin + 30;
        } else {
          checkPageBreak(20);
        }

        // Nome da Etapa
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        pdf.setTextColor(0, 51, 153);
        pdf.text(etapa.toUpperCase(), margin, yPos);
        pdf.setTextColor(0);
        yPos += 8;
        
        // Atividades da etapa
        atividades.forEach(atividade => {
          checkPageBreak(15);

          // Nome da atividade
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(9);
          const itemNum = `${atividadeCounter}.`;
          pdf.text(itemNum, margin + 5, yPos);
          
          const atividadeWidth = pageWidth - 2 * margin - 15;
          const linhasAtividade = pdf.splitTextToSize(atividade.nome, atividadeWidth);
          pdf.text(linhasAtividade, margin + 13, yPos);
          yPos += linhasAtividade.length * 4 + 2;

          // Disciplina
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(8);
          pdf.setTextColor(80);
          pdf.text(`${atividade.disciplina}${atividade.subdisciplina ? ` - ${atividade.subdisciplina}` : ''}`, margin + 13, yPos);
          pdf.setTextColor(0);
          yPos += 6;

          atividadeCounter++;
        });
        
        yPos += 5;
      });

      // === RODAPÉ ===
      const totalPages = pdf.internal.pages.length - 1;
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        
        // Linha decorativa
        pdf.setDrawColor(200);
        pdf.line(margin, pageHeight - 20, pageWidth - margin, pageHeight - 20);
        
        // Texto do rodapé
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(100);
        pdf.text('Interativa Engenharia', margin, pageHeight - 12);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.text('www.interativaengenharia.com.br', margin, pageHeight - 4);
      }

      // Baixar PDF diretamente
      const totalAtividades = Object.values(atividadesPorEtapa).reduce((sum, ativs) => sum + ativs.length, 0);
      const nomeArquivo = `Resumo_Atividades_${dadosCliente.empreendimento.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`;
      pdf.save(nomeArquivo);
      
      alert(`✅ PDF baixado com sucesso!\n\n${totalAtividades} atividades documentadas`);
      
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      alert("Erro ao gerar PDF: " + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      onClick={handleGerarPDF}
      disabled={!empreendimentoId || isGenerating}
      className="bg-purple-600 hover:bg-purple-700"
    >
      {isGenerating ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Gerando PDF...
        </>
      ) : (
        <>
          <FileText className="w-4 h-4 mr-2" />
          Gerar Resumo de Atividades
        </>
      )}
    </Button>
  );
}