
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, FileText, Users, BarChart3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function StatsOverview({ stats: statsData, isLoading }) {
  const stats = [
    {
      title: "Empreendimentos",
      value: statsData.empreendimentos,
      icon: Building2,
      color: "bg-blue-500",
      description: "Total de projetos"
    },
    {
      title: "Disciplinas",
      value: statsData.disciplinas,
      icon: FileText,
      color: "bg-green-500",
      description: "Áreas técnicas"
    },
    {
      title: "Atividades",
      value: statsData.atividades,
      icon: BarChart3,
      color: "bg-purple-500",
      description: "Tipos de atividades"
    },
    {
      title: "Ativos",
      value: statsData.ativos,
      icon: Users,
      color: "bg-orange-500",
      description: "Projetos em andamento"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {stats.map((stat, index) => (
        <Card key={index} className="relative overflow-hidden bg-white border-0 shadow-lg hover:shadow-xl transition-all duration-300">
          <div className={`absolute top-0 right-0 w-20 h-20 transform translate-x-6 -translate-y-6 ${stat.color} rounded-full opacity-10`} />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              {stat.title}
            </CardTitle>
            <div className={`p-2 rounded-lg ${stat.color} bg-opacity-10`}>
              <stat.icon className={`w-4 h-4 ${stat.color.replace('bg-', 'text-')}`} />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16 mb-1" />
            ) : (
              <div className="text-2xl font-bold text-gray-900 mb-1">
                {stat.value}
              </div>
            )}
            <p className="text-xs text-gray-500">{stat.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
