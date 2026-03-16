
function convertToCSV(data) {
    if (!data || data.length === 0) {
        return "";
    }
    const headers = Object.keys(data[0]);
    const csvRows = [];
    
    // Adiciona a linha de cabeçalho, tratando aspas e usando ponto e vírgula
    csvRows.push(headers.map(header => `"${header.replace(/"/g, '""')}"`).join(';'));

    // Adiciona as linhas de dados
    for (const row of data) {
        const values = headers.map(header => {
            const value = row[header] === null || row[header] === undefined ? '' : row[header];
            const escaped = ('' + value).replace(/"/g, '""'); // Escapa aspas duplas
            return `"${escaped}"`; // Envolve todos os valores em aspas
        });
        // Usa ponto e vírgula como separador para as linhas de dados
        csvRows.push(values.join(';'));
    }

    return csvRows.join('\n');
}

export function exportToExcel(dataToExport, fileName) {
    const csvData = convertToCSV(dataToExport);

    // Adiciona BOM para garantir a codificação UTF-8 correta no Excel
    const blob = new Blob([`\uFEFF${csvData}`], { type: 'text/csv;charset=utf-8;' }); 

    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        // Garante que o arquivo seja .csv, que é o formato real
        link.setAttribute("download", `${fileName}.csv`); 
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
