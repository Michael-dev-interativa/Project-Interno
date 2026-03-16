# Server local para Project-Oficial

Instruções rápidas:

- Instalar dependências:

```bash
cd server
npm install
```

- Configurar conexão (opcional):

Crie um arquivo `.env` em `server/` com `DATABASE_URL` ou `PG_CONNECTION`.

- Rodar migrações iniciais:

```bash
npm run migrate
```

- Iniciar servidor:

```bash
npm start
```

Endpoints iniciais:
- `GET /health` — checa conexão com DB
- `POST /migrate` — aplica schema SQL (igual a `npm run migrate`)

Importar CSV para `comerciais`:

```bash
cd server
npm run import:comerciais -- "C:/caminho/comerciais.csv" "--sep=;"
```

No PowerShell, use `"--sep=;"` (com aspas) para evitar que `;` seja interpretado como separador de comando.

Opcoes do importador:
- `--sep=;` define delimitador (padrao: `,`)
- `--insert-only` desativa update por `numero` e sempre insere
- `--dry-run` valida arquivo sem gravar no banco

Importar CSV para `documentos`:

```bash
cd server
npm run import:documentos -- "C:/caminho/Documento_export.csv" "--sep=;"
```

Importar CSV para `empreendimentos`:

```bash
cd server
npm run import:empreendimentos -- "C:/caminho/Empreendimentos_export.csv" "--sep=;"
```

Importar CSV para `atividades`:

```bash
cd server
npm run import:atividades -- "C:/caminho/Atividades_export.csv" "--sep=;" --empreendimentos-csv="C:/caminho/Empreendimentos_export.csv"
```

Vincular `documentos` com `empreendimentos` usando os CSVs de origem:

```bash
cd server
npm run link:documentos-empreendimentos -- "C:/caminho/Documento_export.csv" "C:/caminho/Empreendimentos_export.csv"
```

Produção:
- Defina `PORT` conforme a plataforma.
- Defina `DATABASE_URL` para o banco de produção.
- Defina `CORS_ALLOWED_ORIGINS` com a URL do frontend publicado (ou múltiplas URLs separadas por vírgula).
