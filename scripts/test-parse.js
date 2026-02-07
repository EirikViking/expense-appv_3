import { parseXlsxFile } from '../apps/web/src/lib/xlsx-parser.js';
import fs from 'fs';

const buffer = fs.readFileSync('sample_data/nettbank_test.xlsx');
const result = parseXlsxFile(buffer.buffer);

console.log('=== PARSE RESULT ===');
console.log('Error:', result.error);
console.log('Detected format:', result.detectedFormat);
console.log('Total transactions:', result.transactions.length);
console.log('\n=== FIRST 5 TRANSACTIONS ===');

for (let i = 0; i < Math.min(5, result.transactions.length); i++) {
    const tx = result.transactions[i];
    console.log(`\n${i + 1}. ${tx.tx_date} - ${tx.description}`);
    console.log(`   Amount: ${tx.amount} ${tx.currency}`);
    console.log(`   Merchant: ${tx.merchant || '(none)'}`);
    console.log(`   Raw JSON: ${tx.raw_json.substring(0, 150)}...`);
}

console.log('\n=== MERCHANT EXTRACTION TEST ===');
const testDescriptions = [
    'KIWI 505 BARC',
    'SATS Bjoervika',
    'ANTHROPIC US',
    'CLAUDE.AI SUB',
    'Vipps*Los Taco',
    'Varekjøp REMA',
    'Varekjøp KIWI 5',
    'Overføring - ST',
    'Til Anja',
];

// We need to access the internal function, so let's just show what we got
console.log('\nMerchants extracted from transactions:');
result.transactions.slice(0, 10).forEach(tx => {
    console.log(`  "${tx.description}" -> merchant: "${tx.merchant || '(none)'}"`);
});
