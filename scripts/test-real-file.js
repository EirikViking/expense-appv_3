import XLSX from 'xlsx';
import fs from 'fs';

console.log('Loading eksporter.xlsx...');
const fileBuffer = fs.readFileSync('sample_data/eksporter.xlsx');

// Load workbook
const wb = XLSX.readFile('sample_data/eksporter.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const range = XLSX.utils.decode_range(ws['!ref']);

console.log(`\nWorkbook loaded: ${range.e.r + 1} rows, ${range.e.c + 1} columns`);

// Test date detection
console.log('\n=== TESTING DATE DETECTION ===');
const testDates = ['2/3/26', '1/8/26', '12/31/25', '1/5/26'];

const DATE_VALUE_PATTERN = /^\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4}$/;

testDates.forEach(date => {
    const matches = DATE_VALUE_PATTERN.test(date);
    console.log(`  "${date}" matches pattern: ${matches}`);
});

// Check first 5 rows
console.log('\n=== FIRST 5 ROWS ===');
for (let r = 0; r < Math.min(5, range.e.r + 1); r++) {
    const row = [];
    for (let c = 0; c <= range.e.c; c++) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        const cell = ws[cellRef];
        if (cell && cell.v !== undefined) {
            const val = typeof cell.v === 'string' ? `"${cell.v.substring(0, 30)}"` : cell.v;
            row.push(val);
        } else {
            row.push('');
        }
    }
    console.log(`Row ${r}:`, row.join(' | '));
}

// Now try to import and use the parser
console.log('\n=== ATTEMPTING TO PARSE WITH PARSER ===');
try {
    // Dynamic import since we're in a script
    const { parseXlsxFile } = await import('../apps/web/src/lib/xlsx-parser.js');

    const result = parseXlsxFile(fileBuffer.buffer);

    console.log('Parse result:');
    console.log('  Error:', result.error);
    console.log('  Transactions:', result.transactions.length);
    console.log('  Detected format:', result.detectedFormat);

    if (result.transactions.length > 0) {
        console.log('\n=== FIRST 5 TRANSACTIONS ===');
        result.transactions.slice(0, 5).forEach((tx, i) => {
            console.log(`${i + 1}. ${tx.tx_date} | ${tx.description.substring(0, 40)} | ${tx.amount} | ${tx.merchant || '(none)'}`);
        });
    }
} catch (error) {
    console.error('Parser error:', error.message);
    console.error('Stack:', error.stack);
}
