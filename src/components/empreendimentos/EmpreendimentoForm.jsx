import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Upload, Save } from "lucide-react";
import { motion } from "framer-motion";
import { UploadFile } from "@/integrations/Core";

const ETAPAS_PADRAO = [
  "Etapa 1",
  "Etapa 2",
  "Etapa 3",
  "Etapa 4",
  "Etapa 5",
  "Etapa 6",
  "Etapa 7"
];

export default function EmpreendimentoForm({ empreendimento, onSubmit, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    nome: empreendimento?.nome || "",
    cliente: empreendimento?.cliente || "",
    endereco: empreendimento?.endereco || "",
    num_proposta: empreendimento?.num_proposta || "",
    status: empreendimento?.status || "em_planejamento",
    foto_url: empreendimento?.foto_url || "",
    etapas: empreendimento?.etapas || [
      "Estudo Preliminar",
      "Ante-Projeto",
      "Projeto Básico",
      "Projeto Executivo",
      "Liberado para Obra"
    ]
  });
  
  const [etapasEditaveis, setEtapasEditaveis] = useState(() => {
    // Inicializar com as etapas existentes ou 7 etapas vazias
    const etapasAtuais = empreendimento?.etapas || [];
    return ETAPAS_PADRAO.map((_, index) => etapasAtuais[index] || "");
  });
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleEtapaChange = (index, valor) => {
    const novasEtapas = [...etapasEditaveis];
    novasEtapas[index] = valor;
    setEtapasEditaveis(novasEtapas);
    
    // Atualizar formData apenas com etapas preenchidas
    const etapasPreenchidas = novasEtapas.filter(e => e.trim() !== "");
    setFormData(prev => ({ ...prev, etapas: etapasPreenchidas }));
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { file_url } = await UploadFile({ file });
      setFormData(prev => ({ ...prev, foto_url: file_url }));
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
      alert("Erro ao fazer upload da imagem. Tente novamente.");
    }
    setIsUploading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // **CORREÇÃO**: Verificar se onSubmit é uma função válida
    if (!onSubmit || typeof onSubmit !== 'function') {
      console.error('EmpreendimentoForm: onSubmit não é uma função válida');
      alert('Erro interno: função de submissão não encontrada');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await onSubmit(formData);
      // **CORREÇÃO**: Chamar onSuccess apenas se fornecido
      if (onSuccess && typeof onSuccess === 'function') {
        await onSuccess();
      }
    } catch (error) {
      console.error('Erro no handleSubmit:', error);
      // O erro já é tratado na função onSubmit da página pai
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-2xl"
      >
        <Card className="bg-white shadow-2xl">
          <CardHeader className="border-b border-gray-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-bold">
                {empreendimento ? "Editar Empreendimento" : "Novo Empreendimento"}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome do Empreendimento *</Label>
                  <Input
                    id="nome"
                    value={formData.nome}
                    onChange={(e) => handleInputChange("nome", e.target.value)}
                    placeholder="Digite o nome do empreendimento"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="cliente">Cliente *</Label>
                  <Input
                    id="cliente"
                    value={formData.cliente}
                    onChange={(e) => handleInputChange("cliente", e.target.value)}
                    placeholder="Nome do cliente"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="endereco">Endereço</Label>
                <Input
                  id="endereco"
                  value={formData.endereco}
                  onChange={(e) => handleInputChange("endereco", e.target.value)}
                  placeholder="Endereço completo do empreendimento"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="num_proposta">Nº Proposta</Label>
                <Input
                  id="num_proposta"
                  value={formData.num_proposta}
                  onChange={(e) => handleInputChange("num_proposta", e.target.value)}
                  placeholder="Ex: PP24-1071-R3"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status} onValueChange={(value) => handleInputChange("status", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="em_planejamento">Em Planejamento</SelectItem>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="pausado">Pausado</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label>Etapas do Empreendimento</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  {ETAPAS_PADRAO.map((etapaLabel, index) => (
                    <div key={index} className="space-y-1">
                      <Label htmlFor={`etapa-${index}`} className="text-xs font-medium text-gray-600">
                        {etapaLabel}
                      </Label>
                      <Input
                        id={`etapa-${index}`}
                        value={etapasEditaveis[index]}
                        onChange={(e) => handleEtapaChange(index, e.target.value)}
                        placeholder={`Ex: Estudo Preliminar, Projeto Executivo...`}
                        className="h-9"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500">
                  Nomeie as etapas do empreendimento. Deixe em branco as que não forem utilizadas.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Foto do Empreendimento</Label>
                <div className="flex items-center gap-4">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="foto-upload"
                  />
                  <label htmlFor="foto-upload">
                    <Button 
                      type="button" 
                      variant="outline"
                      disabled={isUploading}
                      asChild
                    >
                      <span>
                        <Upload className="w-4 h-4 mr-2" />
                        {isUploading ? "Enviando..." : "Escolher Foto"}
                      </span>
                    </Button>
                  </label>
                  {formData.foto_url && (
                    <img 
                      src={formData.foto_url} 
                      alt="Preview" 
                      className="w-16 h-16 object-cover rounded-lg"
                    />
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmitting || isUploading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isSubmitting ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}