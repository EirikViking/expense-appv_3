import XLSX from 'xlsx';

// Create test data based on the screenshot
const testData = [
    ['12.01.2026', 'KIWI 505 BARC', -137.83, 18777.90, 'NOK'],
    ['08.01.2026', 'KIWI 505 BARC', -96.42, 18915.73, 'NOK'],
    ['08.01.2026', 'Overføring - ST', 29130.12, 19012.15, 'NOK'],
    ['07.01.2026', 'KIWI 505 BARC', -161.53, -10117.97, 'NOK'],
    ['07.01.2026', 'Overføring - SC', 1529.00, -9956.44, 'NOK'],
    ['06.01.2026', 'SATS Bjoervika', -179.00, -11485.44, 'NOK'],
    ['06.01.2026', 'SATS Bjoervika', -79.00, -11306.44, 'NOK'],
    ['05.01.2026', 'ANTHROPIC US', -195.89, -11227.44, 'NOK'],
    ['05.01.2026', 'CLAUDE.AI SUB', -258.03, -11031.55, 'NOK'],
    ['05.01.2026', 'ANTHROPIC US', -64.50, -10773.52, 'NOK'],
    ['05.01.2026', 'LOS TACOS BJC', -55.00, -10709.02, 'NOK'],
    ['05.01.2026', 'VISA VARE 427:', -119.00, -10654.02, 'NOK'],
    ['05.01.2026', 'Vipps*Los Taco', -58.00, -10535.02, 'NOK'],
    ['05.01.2026', 'Til Anja', -7350.00, -10477.02, 'NOK'],
    ['05.01.2026', 'Varekjøp REMA', 153.38, -3127.02, 'NOK'],
    ['05.01.2026', 'Varekjøp KIWI 5', -96.80, -2973.64, 'NOK'],
    ['05.01.2026', 'Overføring - 10:', 7704.07, -2876.84, 'NOK'],
    ['05.01.2026', 'Overføring - 10:', 7090.00, -10580.91, 'NOK'],
    ['05.01.2026', 'betaling av kred', -22500.00, -17670.91, 'NOK'],
    ['02.01.2026', 'TV 2 NO 32705', -469.00, 4829.09, 'NOK'],
];

const ws = XLSX.utils.aoa_to_sheet(testData);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

// Save as XLS
XLSX.writeFile(wb, 'sample_data/nettbank_test.xlsx');

console.log('Created test file: sample_data/nettbank_test.xlsx');
console.log('Rows:', testData.length);
console.log('Columns: 5 (Date, Description, Amount, Balance, Currency)');
