const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'empreendimento', 'CadastroTab.jsx');

// Read the file
let content = fs.readFileSync(filePath, 'utf8');

// Try multiple replacement strategies
let success = false;

// Strategy 1: Find and replace the entire <div>...</div> block
const divBlockStart = '<div\n                                        key={`${linha.id}-${etapa}-${revisao}`}\n                                        className="border-r border-gray-100 p-0.5 flex-shrink-0 flex items-center relative group"';
const divBlockEnd = '</div>\n                                     ))}\n                                     <div className="p-0.5 flex-shrink-0"';

if (content.includes(divBlockStart) && content.includes(divBlockEnd)) {
    console.log('Strategy 1: Trying full div replacement...');
    
    const startIdx = content.indexOf(divBlockStart);
    const endIdx = content.indexOf(divBlockEnd, startIdx) + '</div>\n                                     ))}}'.length;
    
    if (startIdx !== -1 && endIdx > startIdx) {
        const oldContent = content.substring(startIdx, endIdx);
        const newContent = `<DateCell
                                        key={`${linha.id}-${etapa}-${revisao}`}
                                        linhaId={linha.id}
                                        etapa={etapa}
                                        revisao={revisao}
                                        value={getDataValue(linha, etapa, revisao)}
                                        onUpdate={handleUpdateData}
                                        readOnly={readOnly}
                                        onCopy={copiarDataParaBaixo}
                                      />
                                     ))}`;
        
        content = content.substring(0, startIdx) + newContent + content.substring(endIdx);
        success = true;
        console.log('✓ Strategy 1 succeeded!');
    }
}

// Strategy 2: Use regex to find the pattern more flexibly
if (!success) {
    console.log('Strategy 2: Trying regex pattern replacement...');
    
    const pattern = /<div\s+key={\`\$\{linha\.id\}-\$\{etapa\}-\$\{revisao\}\`\}[\s\S]*?<\/div>\s*\)\)\}/;
    
    if (pattern.test(content)) {
        const replacement = `<DateCell
                                        key={`${linha.id}-${etapa}-${revisao}`}
                                        linhaId={linha.id}
                                        etapa={etapa}
                                        revisao={revisao}
                                        value={getDataValue(linha, etapa, revisao)}
                                        onUpdate={handleUpdateData}
                                        readOnly={readOnly}
                                        onCopy={copiarDataParaBaixo}
                                      />
                                     ))}`;
        
        content = content.replace(pattern, replacement);
        success = true;
        console.log('✓ Strategy 2 succeeded!');
    }
}

// Strategy 3: Simple substring replacement focusing on the critical part
if (!success) {
    console.log('Strategy 3: Trying simpler substring approach...');
    
    // Look for the pattern: line with "key={`${linha.id}-${etapa}-${revisao}`}" followed by closing div
    const searchStr = 'key={`${linha.id}-${etapa}-${revisao}`}\n                                        className="border-r border-gray-100 p-0.5 flex-shrink-0 flex items-center relative group"';
    
    if (content.includes(searchStr)) {
        console.log('✓ Found the key line!');
        success = true;
        // Now we found it, use a more targeted replace
        const idx = content.indexOf('{revisoesEtapa.map((revisao) => (\n                                      <div\n                                        key={`${linha.id}-${etapa}-${revisao}`}');
        
        if (idx !== -1) {
            // Find the closing ))} for this map
            let depth = 0;
            let closeIdx = idx;
            let foundStart = false;
            let count = 0;
            
            for (let i = idx; i < content.length && count < 2000; i++) {
                if (content[i] === '(' && content[i-1] === '>') {
                    if (!foundStart) foundStart = true;
                    depth++;
                }
                if (foundStart && content.substring(i, i + 4) === '))}' && depth === 1) {
                    closeIdx = i + 3;
                    break;
                }
                count++;
            }
            
            if (closeIdx > idx) {
                const oldBlock = content.substring(idx, closeIdx);
                const newBlock = `{revisoesEtapa.map((revisao) => (
                                      <DateCell
                                        key={`${linha.id}-${etapa}-${revisao}`}
                                        linhaId={linha.id}
                                        etapa={etapa}
                                        revisao={revisao}
                                        value={getDataValue(linha, etapa, revisao)}
                                        onUpdate={handleUpdateData}
                                        readOnly={readOnly}
                                        onCopy={copiarDataParaBaixo}
                                      />
                                     ))}`;
                
                content = content.substring(0, idx) + newBlock + content.substring(closeIdx);
                success = true;
                console.log('✓ Strategy 3 succeeded with targeted replacement!');
            }
        }
    }
}

if (success) {
    fs.writeFileSync(filePath, content, 'utf8');
    
    // Verify
    const newContent = fs.readFileSync(filePath, 'utf8');
    const hasDateCell = newContent.includes('DateCell');
    const hasReplaced = newContent.includes('copiarDataParaBaixo_REPLACED');
    
    console.log('\n✓ Replacement completed!');
    console.log(`  - File contains 'DateCell': ${hasDateCell}`);
    console.log(`  - File contains 'copiarDataParaBaixo_REPLACED': ${hasReplaced}`);
    
    if (hasDateCell && !hasReplaced) {
        console.log('\n✓✓✓ VERIFICATION SUCCESSFUL: Block replaced correctly!');
        process.exit(0);
    } else {
        console.log('\n✗ Verification failed!');
        process.exit(1);
    }
} else {
    console.log('\n✗ All strategies failed. Block not found.');
    process.exit(1);
}
