import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

import { schema } from '../db/schema';

let testDb: Database.Database;

vi.mock('../db/client', () => ({
  getDb: () => testDb,
}));

vi.mock('../ai/client', () => ({
  buildChatCompletionsUrl: vi.fn((url: string) => `${url}/v1/chat/completions`),
  callAiJson: vi.fn().mockResolvedValue({
    parsed: { name: '布洛芬', spec: '300mg', category: '感冒发烧' },
    raw: '{"name":"布洛芬"}',
  }),
  callAiText: vi.fn().mockResolvedValue(
    '你可以使用布洛芬。\n[[MEDKIT_IDS:1]]',
  ),
  fetchStream: vi.fn(),
  getContentText: vi.fn(),
  getStreamChunkText: vi.fn(),
  readAiErrorDetail: vi.fn(),
}));

import { aiRouter } from './ai';

function createApp() {
  const app = new Hono();
  app.route('/api/ai', aiRouter);
  return app;
}

const AI_HEADERS = {
  'Content-Type': 'application/json',
  'X-AI-Api-Key': 'test-key',
  'X-AI-Base-Url': 'https://test.api',
  'X-AI-Model': 'test-model',
};

beforeEach(() => {
  testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');
  testDb.exec(schema);
});

afterEach(() => {
  testDb.close();
});

describe('GET /api/ai/config-status', () => {
  it('returns config status without requiring API key', async () => {
    const app = createApp();
    const res = await app.request('/api/ai/config-status');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('hasServerAiConfig');
    expect(body.data).toHaveProperty('defaultBaseUrl');
    expect(body.data).toHaveProperty('defaultModel');
  });
});

describe('POST /api/ai/parse', () => {
  it('returns 400 when no API key provided', async () => {
    const app = createApp();
    const res = await app.request('/api/ai/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '布洛芬' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when text is empty', async () => {
    const app = createApp();
    const res = await app.request('/api/ai/parse', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ text: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('parses medicine text successfully', async () => {
    const app = createApp();
    const res = await app.request('/api/ai/parse', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ text: '布洛芬缓释胶囊300mg' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.name).toBe('布洛芬');
  });
});

describe('POST /api/ai/parse-batch', () => {
  it('returns 400 when text is empty', async () => {
    const app = createApp();
    const res = await app.request('/api/ai/parse-batch', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ text: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when exceeding 20 items', async () => {
    const items = Array.from({ length: 21 }, (_, i) => `item${i}`).join('\n');
    const app = createApp();
    const res = await app.request('/api/ai/parse-batch', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ text: items }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('max 20');
  });

  it('parses multiple items', async () => {
    const app = createApp();
    const res = await app.request('/api/ai/parse-batch', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ text: '布洛芬300mg\n创可贴' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.results).toHaveLength(2);
    expect(body.data.results[0].success).toBe(true);
  });
});

describe('POST /api/ai/query', () => {
  it('returns 400 when question is empty', async () => {
    const app = createApp();
    const res = await app.request('/api/ai/query', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ question: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns empty-box response when no medicines exist', async () => {
    const app = createApp();
    const res = await app.request('/api/ai/query', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ question: '有没有退烧药' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.answer).toContain('空的');
    expect(body.data.medicines).toEqual([]);
  });

  it('returns inventory answer for inventory questions', async () => {
    testDb
      .prepare(
        `INSERT INTO medicines (name, expires_at, category) VALUES (?, ?, ?)`,
      )
      .run('布洛芬', '2028-01-01', '感冒发烧');

    const app = createApp();
    const res = await app.request('/api/ai/query', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ question: '家里都有什么药' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.answer).toContain('库存概况');
  });

  it('updates stock directly for inventory decrease commands', async () => {
    testDb
      .prepare(
        `INSERT INTO medicines (name, spec, quantity, category) VALUES (?, ?, ?, ?)`,
      )
      .run('甲氨基阿维菌素苯甲酸盐', '1%，200g/瓶', '15瓶', '杀虫剂');

    const app = createApp();
    const res = await app.request('/api/ai/query', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ question: '甲氨基阿维菌素苯甲酸盐 库存减掉一。' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.answer).toContain('已更新库存');
    expect(body.data.inventoryChanged).toBe(true);
    expect(body.data.medicines[0].quantity).toBe('14瓶');

    const row = testDb
      .prepare('SELECT quantity FROM medicines WHERE name = ?')
      .get('甲氨基阿维菌素苯甲酸盐') as { quantity: string };
    expect(row.quantity).toBe('14瓶');

    const transaction = testDb
      .prepare('SELECT * FROM inventory_transactions WHERE medicine_id = ?')
      .get(1) as { action_type: string; quantity_delta: string; source: string };
    expect(transaction.action_type).toBe('stock_out');
    expect(transaction.quantity_delta).toBe('-1瓶');
    expect(transaction.source).toBe('ai');
  });

  it('sets stock directly for inventory set commands', async () => {
    testDb
      .prepare(
        `INSERT INTO medicines (name, spec, quantity, category) VALUES (?, ?, ?, ?)`,
      )
      .run('磷酸二氢钾', '', '3包', '肥料');

    const app = createApp();
    const res = await app.request('/api/ai/query', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ question: '磷酸二氢钾库存修改为1包' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.answer).toContain('已更新库存');
    expect(body.data.inventoryChanged).toBe(true);
    expect(body.data.medicines[0].quantity).toBe('1包');

    const row = testDb
      .prepare('SELECT quantity FROM medicines WHERE name = ?')
      .get('磷酸二氢钾') as { quantity: string };
    expect(row.quantity).toBe('1包');

    const transaction = testDb
      .prepare('SELECT * FROM inventory_transactions WHERE medicine_id = ?')
      .get(1) as {
        action_type: string;
        quantity_before: string;
        quantity_after: string;
        quantity_delta: string;
        source: string;
      };
    expect(transaction.action_type).toBe('adjustment');
    expect(transaction.quantity_before).toBe('3包');
    expect(transaction.quantity_after).toBe('1包');
    expect(transaction.quantity_delta).toBe('-2包');
    expect(transaction.source).toBe('ai');
  });

  it('deducts nearest-expiring batches first for inventory decrease commands', async () => {
    testDb
      .prepare(
        `INSERT INTO medicines (name, spec, quantity, category) VALUES (?, ?, ?, ?)`,
      )
      .run('噻呋酰胺戊唑醇', '32%，100g/瓶', '5瓶', '杀菌剂');
    testDb
      .prepare(
        `INSERT INTO inventory_batches (medicine_id, batch_no, quantity, expires_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(1, '近效期批次', '1瓶', '2026-06-01');
    testDb
      .prepare(
        `INSERT INTO inventory_batches (medicine_id, batch_no, quantity, expires_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(1, '远效期批次', '4瓶', '2027-06-01');

    const app = createApp();
    const res = await app.request('/api/ai/query', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ question: '噻呋酰胺戊唑醇 库存减掉2瓶。' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.answer).toContain('批次扣减');
    expect(body.data.medicines[0].quantity).toBe('3瓶');

    const batches = testDb
      .prepare('SELECT batch_no, quantity FROM inventory_batches ORDER BY expires_at ASC')
      .all() as Array<{ batch_no: string; quantity: string }>;
    expect(batches).toEqual([
      { batch_no: '近效期批次', quantity: '0瓶' },
      { batch_no: '远效期批次', quantity: '3瓶' },
    ]);

    const transaction = testDb
      .prepare('SELECT * FROM inventory_transactions WHERE medicine_id = ?')
      .get(1) as { reason: string; note: string; quantity_delta: string };
    expect(transaction.reason).toContain('近效期批次优先');
    expect(transaction.note).toContain('近效期批次 1瓶→0瓶');
    expect(transaction.quantity_delta).toBe('-2瓶');
  });

  it('calls AI for non-inventory questions with medicines in DB', async () => {
    testDb
      .prepare(
        `INSERT INTO medicines (name, expires_at, category) VALUES (?, ?, ?)`,
      )
      .run('布洛芬', '2028-01-01', '感冒发烧');

    const app = createApp();
    const res = await app.request('/api/ai/query', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ question: '有没有退烧药' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
  });
});

describe('POST /api/ai/complete', () => {
  it('returns 400 when draft is empty', async () => {
    const app = createApp();
    const res = await app.request('/api/ai/complete', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ draft: {} }),
    });
    expect(res.status).toBe(400);
  });

  it('completes a draft with existing content', async () => {
    const app = createApp();
    const res = await app.request('/api/ai/complete', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ draft: { name: '布洛芬' } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
  });
});

describe('POST /api/ai/test', () => {
  it('returns success on valid AI response', async () => {
    const { callAiJson } = await import('../ai/client');
    (callAiJson as any).mockResolvedValueOnce({
      parsed: { ok: true, message: '连接成功' },
      raw: '{"ok":true,"message":"连接成功"}',
    });

    const app = createApp();
    const res = await app.request('/api/ai/test', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ok).toBe(true);
  });
});

describe('POST /api/ai/parse-image', () => {
  it('returns 400 for invalid image data URL', async () => {
    const app = createApp();
    const res = await app.request('/api/ai/parse-image', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ image: 'not a data url' }),
    });
    expect(res.status).toBe(400);
  });
});
