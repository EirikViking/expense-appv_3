import { Hono } from 'hono';
import {
  createMerchantSchema,
  updateMerchantSchema,
  generateId,
  type Merchant,
  type MerchantsResponse,
} from '@expense/shared';
import type { Env } from '../types';

const merchants = new Hono<{ Bindings: Env }>();

// Parse patterns from JSON string
function parsePatterns(patternsJson: string): string[] {
  try {
    return JSON.parse(patternsJson);
  } catch {
    return [];
  }
}

// Get all merchants with pagination
merchants.get('/', async (c) => {
  try {
    const search = c.req.query('search') || '';
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 500);
    const offset = parseInt(c.req.query('offset') || '0');

    let whereClause = '';
    const params: (string | number)[] = [];

    if (search) {
      whereClause = 'WHERE canonical_name LIKE ? COLLATE NOCASE';
      params.push(`%${search}%`);
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM merchants ${whereClause}`;
    const countResult = await c.env.DB.prepare(countQuery).bind(...params).first<{ total: number }>();
    const total = countResult?.total || 0;

    // Get merchants
    const query = `
      SELECT * FROM merchants
      ${whereClause}
      ORDER BY canonical_name COLLATE NOCASE
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const result = await c.env.DB.prepare(query).bind(...params).all<{
      id: string;
      canonical_name: string;
      patterns: string;
      website: string | null;
      logo_url: string | null;
      created_at: string;
    }>();

    const merchantsList: Merchant[] = (result.results || []).map(m => ({
      ...m,
      patterns: parsePatterns(m.patterns),
    }));

    const response: MerchantsResponse = {
      merchants: merchantsList,
      total,
    };

    return c.json(response);
  } catch (error) {
    console.error('Merchants list error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get single merchant
merchants.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const result = await c.env.DB
      .prepare('SELECT * FROM merchants WHERE id = ?')
      .bind(id)
      .first<{
        id: string;
        canonical_name: string;
        patterns: string;
        website: string | null;
        logo_url: string | null;
        created_at: string;
      }>();

    if (!result) {
      return c.json({ error: 'Merchant not found' }, 404);
    }

    const merchant: Merchant = {
      ...result,
      patterns: parsePatterns(result.patterns),
    };

    return c.json(merchant);
  } catch (error) {
    console.error('Merchant get error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Create merchant
merchants.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = createMerchantSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    const { canonical_name, patterns, website } = parsed.data;

    // Check for duplicate name
    const existing = await c.env.DB
      .prepare('SELECT 1 FROM merchants WHERE LOWER(TRIM(canonical_name)) = LOWER(TRIM(?))')
      .bind(canonical_name)
      .first();

    if (existing) {
      return c.json({ error: 'Merchant with this name already exists' }, 400);
    }

    const id = generateId();
    const now = new Date().toISOString();

    await c.env.DB
      .prepare(`
        INSERT INTO merchants (id, canonical_name, patterns, website, created_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(id, canonical_name, JSON.stringify(patterns || []), website || null, now)
      .run();

    const created = await c.env.DB
      .prepare('SELECT * FROM merchants WHERE id = ?')
      .bind(id)
      .first<{
        id: string;
        canonical_name: string;
        patterns: string;
        website: string | null;
        logo_url: string | null;
        created_at: string;
      }>();

    return c.json({
      ...created,
      patterns: parsePatterns(created!.patterns),
    }, 201);
  } catch (error) {
    console.error('Merchant create error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Update merchant
merchants.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateMerchantSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    const existing = await c.env.DB
      .prepare('SELECT * FROM merchants WHERE id = ?')
      .bind(id)
      .first();

    if (!existing) {
      return c.json({ error: 'Merchant not found' }, 404);
    }

    const { canonical_name, patterns, website } = parsed.data;

    // Check for duplicate name if changing
    if (canonical_name) {
      const duplicate = await c.env.DB
        .prepare('SELECT 1 FROM merchants WHERE LOWER(TRIM(canonical_name)) = LOWER(TRIM(?)) AND id != ?')
        .bind(canonical_name, id)
        .first();

      if (duplicate) {
        return c.json({ error: 'Merchant with this name already exists' }, 400);
      }
    }

    const updates: string[] = [];
    const params: (string | null)[] = [];

    if (canonical_name !== undefined) {
      updates.push('canonical_name = ?');
      params.push(canonical_name);
    }
    if (patterns !== undefined) {
      updates.push('patterns = ?');
      params.push(JSON.stringify(patterns));
    }
    if (website !== undefined) {
      updates.push('website = ?');
      params.push(website);
    }

    if (updates.length > 0) {
      params.push(id);
      await c.env.DB
        .prepare(`UPDATE merchants SET ${updates.join(', ')} WHERE id = ?`)
        .bind(...params)
        .run();
    }

    const updated = await c.env.DB
      .prepare('SELECT * FROM merchants WHERE id = ?')
      .bind(id)
      .first<{
        id: string;
        canonical_name: string;
        patterns: string;
        website: string | null;
        logo_url: string | null;
        created_at: string;
      }>();

    return c.json({
      ...updated,
      patterns: parsePatterns(updated!.patterns),
    });
  } catch (error) {
    console.error('Merchant update error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Delete merchant
merchants.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const result = await c.env.DB
      .prepare('DELETE FROM merchants WHERE id = ?')
      .bind(id)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: 'Merchant not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Merchant delete error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Match description to merchant
merchants.post('/match', async (c) => {
  try {
    const body = await c.req.json();
    const { description } = body;

    if (!description) {
      return c.json({ error: 'Description required' }, 400);
    }

    // Get all merchants with patterns
    const result = await c.env.DB
      .prepare('SELECT * FROM merchants')
      .all<{
        id: string;
        canonical_name: string;
        patterns: string;
        website: string | null;
        logo_url: string | null;
        created_at: string;
      }>();

    const descLower = description.toLowerCase();

    for (const m of result.results || []) {
      const patterns = parsePatterns(m.patterns);
      for (const pattern of patterns) {
        if (descLower.includes(pattern.toLowerCase())) {
          return c.json({
            matched: true,
            merchant: {
              ...m,
              patterns,
            },
          });
        }
      }
    }

    return c.json({ matched: false, merchant: null });
  } catch (error) {
    console.error('Merchant match error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default merchants;
