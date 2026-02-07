/* Apply categorization rules to all existing transactions */

const API_BASE = 'https://expense-api.cromkake.workers.dev';
const PASSWORD = process.env.RUN_REBUILD_PASSWORD;

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
    if (!PASSWORD) throw new Error('Missing RUN_REBUILD_PASSWORD env var');
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

    console.log('\n🔄 Applying rules to all transactions...');
    const result = await jsonRequest('/rules/apply', {
        method: 'POST',
        token,
        body: { all: true, batch_size: 500 }
    });

    console.log('\n=== APPLY RULES RESULT ===');
    console.log(`   Processed:          ${result.processed || 0}`);
    console.log(`   Matched:            ${result.matched || 0}`);
    console.log(`   Updated (real):     ${result.updated_real || 0}`);
    console.log(`   Category candidates: ${result.category_candidates || 0}`);
    console.log(`   Still uncategorized: ${result.still_uncategorized || 0}`);
    console.log(`   Errors:             ${result.errors || 0}`);

    if (result.still_uncategorized > 0) {
        console.log('\n⚠️  Some transactions are still uncategorized.');
        console.log('   This is expected for transactions that don\'t match any rules.');
    }

    if (result.updated_real > 0) {
        console.log('\n✅ Categories updated successfully!');
    }
}

run().catch((err) => {
    console.error('❌ Error:', err.message || String(err));
    process.exit(1);
});
