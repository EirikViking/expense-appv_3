// Test merchant extraction with real examples from eksporter.xlsx

const testCases = [
    {
        description: 'KIWI 505 BARCODE Notanr 74383766009800088550605',
        expected: 'KIWI'
    },
    {
        description: 'Vipps*Los Tacos Bjoervika Notanr 74987506002002677126098',
        expected: 'LOS TACOS'
    },
    {
        description: 'Varekjøp REMA SØRENGA SØRENGKAIA 1 OSLO betal dato 2026-01-03',
        expected: 'REMA 1000'
    },
    {
        description: 'SATS Bjoervika Notanr 74987506005002681604095',
        expected: 'SATS'
    },
    {
        description: 'ANTHROPIC USD 18,98 Kurs   1032 Notanr 24011346005100067204146',
        expected: 'ANTHROPIC'
    },
    {
        description: 'CLAUDE.AI SUBSCRIPTION USD 25,00 Kurs   1032 Notanr 24011346004100083686681',
        expected: 'CLAUDE.AI'
    },
    {
        description: 'VISA VARE 427279XXXXXX6829 02.02  0,00 APPLE.COM/BILL\\80056952 Kurs',
        expected: 'APPLE'
    },
    {
        description: 'PAYPAL *CLOUDFLARE',
        expected: 'PAYPAL'
    },
    {
        description: 'TV 2 NO 32705132',
        expected: 'TV 2'
    },
    {
        description: 'Google Play Apps',
        expected: 'GOOGLE PLAY'
    },
];

function deriveMerchantFromSpesifikasjon(description) {
    const s = description.replace(/\s+/g, ' ').trim();
    if (!s) return undefined;

    const upper = s.toUpperCase();

    // Quick groceries anchors
    if (/\bREMA\b/.test(upper)) return 'REMA 1000';
    if (/\bKIWI\b/.test(upper)) return 'KIWI';
    if (/\bMENY\b/.test(upper)) return 'MENY';
    if (/\bCOOP\b/.test(upper)) return 'COOP';
    if (/\bEXTRA\b/.test(upper)) return 'EXTRA';
    if (/\bOBS\b/.test(upper)) return 'OBS';
    if (/\bSPAR\b/.test(upper)) return 'SPAR';
    if (/\bJOKER\b/.test(upper)) return 'JOKER';

    // Common merchants from nettbank exports
    if (/\bSATS\b/.test(upper)) return 'SATS';
    if (/\bANTHROPIC\b/.test(upper)) return 'ANTHROPIC';
    if (/\bCLAUDE\.AI\b/.test(upper)) return 'CLAUDE.AI';
    if (/\bOPENROUTER\b/.test(upper)) return 'OPENROUTER';
    if (/\bREPLIT\b/.test(upper)) return 'REPLIT';
    if (/\bPAYPAL\b/.test(upper)) return 'PAYPAL';
    if (/\bFLYTOGET\b/.test(upper)) return 'FLYTOGET';
    if (/\bLOVABLE\b/.test(upper)) return 'LOVABLE';
    if (/\bGOOGLE\s+PLAY\b/.test(upper)) return 'GOOGLE PLAY';
    if (/\bAPPLE\.COM\b/.test(upper)) return 'APPLE';
    if (/\bTV\s*2\b/.test(upper)) return 'TV 2';

    // Vipps transactions
    const vippsMatch = s.match(/Vipps\*([^\s]+(?:\s+[^\s]+)?)/i);
    if (vippsMatch) {
        return vippsMatch[1].toUpperCase();
    }

    // Varekjøp
    const varekjopMatch = s.match(/Varekjøp\s+([A-ZÆØÅ0-9]+(?:\s+[A-ZÆØÅ0-9]+)?)/i);
    if (varekjopMatch) {
        const merchantName = varekjopMatch[1].toUpperCase();
        if (merchantName.includes('REMA')) return 'REMA 1000';
        if (merchantName.includes('KIWI')) return 'KIWI';
        return merchantName;
    }

    // Strip "Notanr" suffix
    let cleaned = s.replace(/\s+Notanr\s+\d+$/i, '').trim();

    // Strip common prefixes
    cleaned = cleaned
        .replace(/^(VISA|BANKAXEPT|BANKAXEPT\/VISA|KORTKJØP|KORTKJOP|KJØP|KJOP|VISA\s+VARE)\s+/i, '')
        .trim();

    // Strip currency and exchange rate info
    cleaned = cleaned.replace(/\s+(USD|EUR|GBP|SEK|DKK)\s+[\d,]+\s+Kurs\s+[\d,]+.*$/i, '').trim();

    // Strip card number patterns
    cleaned = cleaned.replace(/\s+\d+X+\d+\s+.*$/i, '').trim();

    const tokens = cleaned.split(' ').filter(Boolean);
    if (tokens.length === 0) return undefined;

    // If we have a common "NAME 1234 ..." pattern, keep the first two tokens
    if (tokens.length >= 2 && /^\d{2,4}$/.test(tokens[1])) {
        return `${tokens[0]} ${tokens[1]}`.toUpperCase();
    }

    // Otherwise keep the first 1-3 tokens
    return tokens.slice(0, 3).join(' ').toUpperCase();
}

console.log('=== MERCHANT EXTRACTION TEST ===\n');

let passed = 0;
let failed = 0;

testCases.forEach(({ description, expected }) => {
    const result = deriveMerchantFromSpesifikasjon(description);
    const status = result === expected ? '✅' : '❌';

    if (result === expected) {
        passed++;
    } else {
        failed++;
    }

    console.log(`${status} "${description.substring(0, 60)}"`);
    console.log(`   Expected: "${expected}"`);
    console.log(`   Got:      "${result}"`);
    console.log('');
});

console.log(`\n=== RESULTS ===`);
console.log(`Passed: ${passed}/${testCases.length}`);
console.log(`Failed: ${failed}/${testCases.length}`);

if (failed === 0) {
    console.log('\n🎉 All tests passed!');
} else {
    console.log('\n⚠️  Some tests failed');
    process.exit(1);
}
