import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Briefcase, FileText, Calculator, FolderOpen } from "lucide-react";
import { motion } from "framer-motion";
import {
  Card as UICard,
  CardDescription as UICardDescription,
  CardHeader as UICardHeader,
  CardTitle as UICardTitle,
} from "@/components/ui/card";

const Card = /** @type {any} */ (UICard);
const CardHeader = /** @type {any} */ (UICardHeader);
const CardTitle = /** @type {any} */ (UICardTitle);
const CardDescription = /** @type {any} */ (UICardDescription);

export default function ComercialPage() {
  const folders = [
    {
      title: "Propostas",
      description: "Gerencie propostas comerciais e orçamentos",
      icon: FileText,
      color: "purple",
      url: createPageUrl("Propostas")
    },
    {
      title: "Orçamentos",
      description: "Controle e análise de orçamentos",
      icon: Calculator,
      color: "blue",
      url: createPageUrl("Orcamentos")
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="p-6 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-purple-600" />
              </div>
              Comercial
            </h1>
            <p className="text-gray-600 mt-1">
              Acesse propostas e orçamentos
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            {folders.map((folder, index) => (
              <motion.div
                key={folder.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Link to={folder.url}>
                  <Card className="hover:shadow-lg transition-all duration-300 cursor-pointer border-2 hover:border-purple-300">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className={`w-14 h-14 bg-${folder.color}-100 rounded-xl flex items-center justify-center mb-4`}>
                          <folder.icon className={`w-7 h-7 text-${folder.color}-600`} />
                        </div>
                        <FolderOpen className="w-8 h-8 text-gray-300" />
                      </div>
                      <CardTitle className="text-2xl">{folder.title}</CardTitle>
                      <CardDescription className="text-base">{folder.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}