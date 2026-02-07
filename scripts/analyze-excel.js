import XLSX from 'xlsx';
import fs from 'fs';

const wb = XLSX.readFile('sample_data/eksporter.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];

// Convert to JSON to see the actual data
const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });

console.log('Total rows:', data.length);
console.log('\n=== FIRST 20 ROWS (formatted) ===\n');

for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i];
    console.log(`Row ${i}:`);
    console.log(`  Col A (Date): ${row[0]}`);
    console.log(`  Col B (Desc): ${String(row[1] || '').substring(0, 50)}`);
    console.log(`  Col C (Amt):  ${row[2]}`);
    console.log(`  Col D (Bal):  ${row[3]}`);
    console.log(`  Col E (Cur):  ${row[4]}`);
    console.log('');
}

// Save first 50 rows to a file for inspection
const sample = data.slice(0, 50);
fs.writeFileSync('sample_data/eksporter_sample.json', JSON.stringify(sample, null, 2));
console.log('\nSaved first 50 rows to sample_data/eksporter_sample.json');
