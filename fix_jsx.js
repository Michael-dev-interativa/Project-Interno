const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/empreendimento/CadastroTab.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings
const hasCRLF = content.includes('\r\n');
const normalized = content.replace(/\r\n/g, '\n');

// The old broken block - need to match exact indentation
const oldBlock = `                                     <DateCell
                                       key={\`\${linha.id}-\${etapa}-\${revisao}\`}
                                       linhaId={linha.id}
                                       style={{ width: '110px', minWidth: '110px' }}
                                     >
                                       <input
                                         type="date"
                                         value={getDataValue(linha, etapa, revisao)}
                                         onChange={(e) => handleUpdateData(linha.id, etapa, revisao, e.target.value)}
                                         className="h-8 text-xs w-full px-1 border border-gray-300 rounded cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 hover:[&::-webkit-calendar-picker-indicator]:opacity-100"
                                         style={{ color: getDataValue(linha, etapa, revisao) ? 'black' : 'transparent' }}
                                         disabled={readOnly}
                                       />
                                       {!readOnly && getDataValue(linha, etapa, revisao) && (
                                         <button
                                           onClick={() => copiarDataParaBaixo(linha.id, etapa, revisao)}
                                           className="text-purple-600 hover:text-purple-800 p-0.5 absolute right-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                           title="Preencher todas abaixo"
                                         >
                                           <Wand2 className="w-2.5 h-2.5" />
                                         </button>
                                       )}
                                      </div>`;

const newBlock = `                                     <DateCell
                                       key={\`\${linha.id}-\${etapa}-\${revisao}\`}
                                       linhaId={linha.id}
                                       etapa={etapa}
                                       revisao={revisao}
                                       value={getDataValue(linha, etapa, revisao)}
                                       onUpdate={handleUpdateData}
                                       readOnly={readOnly}
                                       onCopy={copiarDataParaBaixo}
                                     />`;

console.log('Looking for oldBlock...');
if (normalized.includes(oldBlock)) {
  console.log('Found! Replacing...');
  let result = normalized.replace(oldBlock, newBlock);
  if (hasCRLF) result = result.replace(/\n/g, '\r\n');
  fs.writeFileSync(filePath, result, 'utf8');
  console.log('SUCCESS: DateCell block replaced correctly');
  process.exit(0);
} else {
  console.error('ERROR: Could not find the target block');
  
  // Debug: Look for parts
  const lines = normalized.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('onChange={(e) => handleUpdateData(linha.id, etapa, revisao')) {
      console.log(`Found onChange at line ${i+1}`);
      for (let j = Math.max(0,i-5); j <= Math.min(lines.length-1, i+5); j++) {
        console.log(`  ${j+1}: ${JSON.stringify(lines[j].substring(0, 80))}`);
      }
      break;
    }
  }
  process.exit(1);
}
