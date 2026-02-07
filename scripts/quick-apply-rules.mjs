/* Quick script to apply rules - will prompt for password */

const API_BASE = 'https://expense-api.cromkake.workers.dev';

// Get password from command line argument
const PASSWORD = process.argv[2];

if (!PASSWORD) {
    console.log('Usage: node scripts/quick-apply-rules.mjs YOUR_PASSWORD');
    console.log('');
    console.log('This script will apply all categorization rules to existing transactions.');
    process.exit(1);
}

async function jsonRequest(path, { method = 'GET', token, body } = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    let data;
    try {
        data = await res.json();
    } catch {
        data = null;
    }

    if (!res.ok) {
        const msg = (data && (data.error || data.message)) ? String(data.error || data.message) : `HTTP ${res.status}`;
        throw new Error(`${method} ${path} failed: ${msg}`);
    }

    return data;
}

async function login() {
    const data = await jsonRequest('/auth/login', { method: 'POST', body: { password: PASSWORD } });
    if (!data || typeof data.token !== 'string' || !data.token) throw new Error('Login failed: token missing from response');
    return data.token;
}

async function run() {
    console.log('🔐 Logging in...');
    const token = await login();
    console.log('✅ Logged in successfully');

    console.log('\n📊 Fetching existing rules...');
    const rulesResponse = await jsonRequest('/rules', { token });
    const rules = rulesResponse.rules || [];
    console.log(`   Found ${rules.length} rules in database`);

    if (rules.length === 0) {
        console.log('⚠️  No rules found. Please add rules first.');
        return;
    }

    console.log('\n🔄 Applying rules to all transactions...');
    const result = await jsonRequest('/rules/apply', {
        method: 'POST',
        token,
        body: { all: true, batch_size: 500 }
    });

    console.log('\n=== APPLY RULES RESULT ===');
    console.log(`   Processed:          ${result.processed || 0}`);
    console.log(`   Matched:            ${result.matched || 0}`);
    console.log(`   Updated:            ${result.updated || 0}`);
    console.log(`   Still uncategorized: ${result.still_uncategorized || 0}`);
    console.log(`   Errors:             ${result.errors || 0}`);

    if (result.updated > 0) {
        console.log('\n✅ Categories updated successfully! Refresh the app to see changes.');
    } else if (result.matched > 0) {
        console.log('\n⚠️  Rules matched but no new updates. Categories may already be set.');
    } else {
        console.log('\n⚠️  No rules matched. Check your rule patterns.');
    }
}

run().catch((err) => {
    console.error('❌ Error:', err.message || String(err));
    process.exit(1);
});
