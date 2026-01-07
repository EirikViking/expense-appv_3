import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

const SAMPLE_DATA_DIR = path.join(process.cwd(), 'sample_data');

// Ensure sample_data directory exists
if (!fs.existsSync(SAMPLE_DATA_DIR)) {
  fs.mkdirSync(SAMPLE_DATA_DIR, { recursive: true });
  console.log('Created sample_data/ directory');
}

// Generate test XLSX file
function generateTestXlsx() {
  const data = [
    // Header row
    ['Dato', 'Bokført', 'Spesifikasjon', 'Sted', 'Valuta', 'Utl. beløp', 'Beløp'],
    // Data rows
    ['15.01.2024', '16.01.2024', 'REMA 1000', 'OSLO', 'NOK', '', '-523,45'],
    ['15.01.2024', '17.01.2024', 'SPOTIFY', 'STOCKHOLM', 'SEK', '-119,00', '-134,22'],
    ['16.01.2024', '18.01.2024', 'NETFLIX', 'AMSTERDAM', 'EUR', '-12,99', '-149,90'],
    ['17.01.2024', '19.01.2024', 'SHELL MAJORSTUEN', 'OSLO', 'NOK', '', '-687,32'],
    ['18.01.2024', '20.01.2024', 'VINMONOPOLET', 'OSLO', 'NOK', '', '-459,00'],
    ['19.01.2024', '21.01.2024', 'MENY STORO', 'OSLO', 'NOK', '', '-892,15'],
    ['20.01.2024', '22.01.2024', 'TELIA NORGE AS', 'OSLO', 'NOK', '', '-599,00'],
    ['21.01.2024', '23.01.2024', 'COOP MEGA', 'OSLO', 'NOK', '', '-345,67'],
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(data);

  // Set column widths
  worksheet['!cols'] = [
    { wch: 12 }, // Dato
    { wch: 12 }, // Bokført
    { wch: 25 }, // Spesifikasjon
    { wch: 15 }, // Sted
    { wch: 8 },  // Valuta
    { wch: 12 }, // Utl. beløp
    { wch: 12 }, // Beløp
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Transactions');

  const outputPath = path.join(SAMPLE_DATA_DIR, 'test_credit_card.xlsx');
  XLSX.writeFile(workbook, outputPath);
  console.log(`Generated ${outputPath}`);
}

// Generate test bank statement text (simulating PDF extracted text)
function generateTestBankStatement() {
  const text = `Bank Statement - January 2024

Account: 1234.56.78901
Period: 01.01.2024 - 31.01.2024

Reservasjoner

17.01.2024  VIPPS *KIWI MAJORSTUEN           -89,90
17.01.2024  VIPPS *UBER                      -245,00
18.01.2024  VIPPS *BOLT                      -67,50
18.01.2024  VIPPS *FOODORA                   -189,00

Kontobevegelser

15.01.2024  LØNN ARBEIDSGIVER AS            45 678,90
14.01.2024  HUSLEIE JANUAR                  -12 500,00
10.01.2024  REMA 1000 OSLO                  -234,56
08.01.2024  STRØM TIBBER                    -1 234,56
05.01.2024  FORSIKRING GJENSIDIGE           -567,00
03.01.2024  TELENOR ABONNEMENT              -499,00
02.01.2024  NETFLIX                         -149,00

End of statement
`;

  const outputPath = path.join(SAMPLE_DATA_DIR, 'test_bank_statement.txt');
  fs.writeFileSync(outputPath, text, 'utf-8');
  console.log(`Generated ${outputPath}`);
}

// Generate headerless XLSX file like Storebrand exports (no headers, Excel serial dates)
function generateStorebrandHeaderlessXlsx() {
  // Excel serial dates: Jan 1, 2024 = 45292
  // Storebrand format: Date (serial), Description, Amount, Currency (no headers!)
  const data = [
    // No header row - first row is data
    [45307, 'REMA 1000 OSLO', -523.45, 'NOK'],      // 2024-01-16
    [45308, 'NETFLIX MONTHLY', -149.00, 'NOK'],     // 2024-01-17
    [45309, 'SPOTIFY AB', -119.00, 'NOK'],          // 2024-01-18
    [45310, 'SHELL MAJORSTUEN', -687.32, 'NOK'],    // 2024-01-19
    [45312, 'COOP MEGA TORSHOV', -892.15, 'NOK'],   // 2024-01-21
    [45315, 'VINMONOPOLET', -459.00, 'NOK'],        // 2024-01-24
    [45320, 'SALARY COMPANY AS', 45678.90, 'NOK'],  // 2024-01-29
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(data);

  // Set column widths
  worksheet['!cols'] = [
    { wch: 10 },  // Date (serial)
    { wch: 25 },  // Description
    { wch: 12 },  // Amount
    { wch: 6 },   // Currency
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Transaksjoner');

  const outputPath = path.join(SAMPLE_DATA_DIR, 'storebrand_headerless.xlsx');
  XLSX.writeFile(workbook, outputPath);
  console.log(`Generated ${outputPath} (headerless with Excel serial dates)`);
}

// Run generators
console.log('Generating test fixtures...\n');

try {
  generateTestXlsx();
  generateTestBankStatement();
  generateStorebrandHeaderlessXlsx();
  console.log('\nDone! Test fixtures created in sample_data/');
} catch (error) {
  console.error('Error generating fixtures:', error);
  process.exit(1);
}
