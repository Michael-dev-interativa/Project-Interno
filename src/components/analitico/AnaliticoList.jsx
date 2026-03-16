import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export default function AnaliticoList({ analiticoItens, atividadesMap }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lista de Atividades Analíticas</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Etapa</TableHead>
              <TableHead>Disciplina</TableHead>
              <TableHead>Subdisciplina</TableHead>
              <TableHead>Atividade</TableHead>
              <TableHead>Tempo Real (h)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {analiticoItens.map(item => {
              const atividade = atividadesMap[item.atividade_id];
              if (!atividade) return null;
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <Badge variant="outline">{item.etapa}</Badge>
                  </TableCell>
                  <TableCell>{String(atividade.disciplina || '')}</TableCell>
                  <TableCell>{String(atividade.subdisciplina || '')}</TableCell>
                  <TableCell className="font-medium">{String(atividade.atividade || '')}</TableCell>
                  <TableCell className="font-bold text-blue-600">
                    {item.tempo_real?.toFixed(2)}h
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}