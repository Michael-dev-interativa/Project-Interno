// Run from project root: node fix_datecell.cjs
const fs = require('fs');

const filePath = 'src/components/empreendimento/CadastroTab.jsx';
const raw = fs.readFileSync(filePath, 'utf8');
const hasCRLF = raw.includes('\r\n');
const src = raw.replace(/\r\n/g, '\n');

// Anchors that are unique and stable
const ANCHOR_START = '{revisoesEtapa.map((revisao) => (';
const ANCHOR_END   = '))}\n                                     <div className="p-0.5 flex-shrink-0"';

const startIdx = src.indexOf(ANCHOR_START);
const endIdx   = src.indexOf(ANCHOR_END, startIdx);

if (startIdx === -1 || endIdx === -1) {
  console.error('ERROR: anchor strings not found. startIdx=' + startIdx + ' endIdx=' + endIdx);
  process.exit(1);
}

const replaceEnd = endIdx + 3; // include the '))}'

const newBlock = `{revisoesEtapa.map((revisao) => (
                                      <DateCell
                                        key={\`\${linha.id}-\${etapa}-\${revisao}\`}
                                        linhaId={linha.id}
                                        etapa={etapa}
                                        revisao={revisao}
                                        value={getDataValue(linha, etapa, revisao)}
                                        onUpdate={handleUpdateData}
                                        readOnly={readOnly}
                                        onCopy={copiarDataParaBaixo}
                                      />
                                     ))}`;

const result = src.slice(0, startIdx) + newBlock + src.slice(replaceEnd);
const final = hasCRLF ? result.replace(/\n/g, '\r\n') : result;
fs.writeFileSync(filePath, final, 'utf8');

const check = fs.readFileSync(filePath, 'utf8');
const ok = check.includes('onCopy={copiarDataParaBaixo}') && !check.includes('onChange={(e) => handleUpdateData(linha.id, etapa, revisao,');
console.log(ok ? 'SUCCESS: DateCell render replaced correctly!' : 'PARTIAL — check the file manually');
