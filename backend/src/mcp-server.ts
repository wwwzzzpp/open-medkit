import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { inferAgrochemicalCategory, normalizeAgrochemicalCategory } from './agrochemical';
import { getDb } from './db/client';
import { DEFAULT_CATEGORIES } from './db/schema';
import {
  canonicalizeTimezone,
  getDateBoundaries as getTimezoneDateBoundaries,
  getStoredTimezone,
  setStoredTimezone,
} from './utils/timezone';

// ---------------------------------------------------------------------------
// DB helpers (mirrors logic from routes/medicines.ts & ai/medicine.ts)
// ---------------------------------------------------------------------------

interface MedicineRecord {
  id: number;
  name: string;
  brand: string | null;
  name_en: string | null;
  spec: string | null;
  quantity: string | null;
  expires_at: string | null;
  category: string | null;
  usage_desc: string | null;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToMedicine(row: MedicineRecord) {
  return {
    ...row,
    brand: row.brand || '',
    name_en: row.name_en || '',
    spec: row.spec || '',
    quantity: row.quantity || '',
    expires_at: row.expires_at || '',
    category: row.category || '',
    usage_desc: row.usage_desc || '',
    location: row.location || '',
    notes: row.notes || '',
  };
}

function getDateBoundaries(expiringDays = 30) {
  const db = getDb();
  const { timezone } = getStoredTimezone(db);
  return getTimezoneDateBoundaries(timezone, expiringDays);
}

function getMergedCategories() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT category FROM medicines WHERE category IS NOT NULL AND category != '' ORDER BY category ASC`,
    )
    .all() as { category: string }[];
  const merged: string[] = [...DEFAULT_CATEGORIES];
  for (const { category } of rows) {
    if (!merged.includes(category)) {
      merged.push(category);
    }
  }
  return merged;
}

function computeStats(expiringDays = 30) {
  const db = getDb();
  const { todayStr, warningDateStr } = getDateBoundaries(expiringDays);

  const totals = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN expires_at IS NOT NULL AND expires_at != '' AND expires_at < ? THEN 1 ELSE 0 END) AS expired,
         SUM(CASE WHEN expires_at IS NOT NULL AND expires_at != '' AND expires_at >= ? AND expires_at <= ? THEN 1 ELSE 0 END) AS expiring,
         SUM(CASE WHEN expires_at IS NOT NULL AND expires_at != '' AND expires_at > ? THEN 1 ELSE 0 END) AS ok
       FROM medicines`,
    )
    .get(todayStr, todayStr, warningDateStr, warningDateStr) as {
    total: number;
    expired: number | null;
    expiring: number | null;
    ok: number | null;
  };

  const categories = db
    .prepare(
      `SELECT category, COUNT(*) AS count
       FROM medicines
       WHERE category IS NOT NULL AND category != ''
       GROUP BY category
       ORDER BY count DESC, category ASC`,
    )
    .all() as { category: string; count: number }[];

  return {
    total: totals.total || 0,
    expired: totals.expired || 0,
    expiring: totals.expiring || 0,
    ok: totals.ok || 0,
    expiring_days: expiringDays,
    categories,
    available_categories: getMergedCategories(),
  };
}

function getTimezoneMeta() {
  const db = getDb();
  const { timezone, configured } = getStoredTimezone(db);

  return {
    timezone,
    configured,
    warning: configured
      ? undefined
      : '时区尚未初始化。当前库存系统使用 UTC 而不是服务器本地时区。请先使用 set_timezone 工具完成初始化。',
  };
}

function attachMeta(data: unknown) {
  const meta = getTimezoneMeta();

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return {
      ...data,
      _meta: meta,
    };
  }

  return {
    data,
    _meta: meta,
  };
}

function textResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(attachMeta(data), null, 2) }] };
}

function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }], isError: true as const };
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'open-medkit',
  version: '1.0.0',
});

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

server.tool(
  'get_settings',
  '获取当前与 MCP 使用相关的库存系统设置，包括业务时区是否已经初始化。',
  {},
  async () => {
    try {
      const meta = getTimezoneMeta();
      return textResult({
        timezone: meta.timezone,
        configured: meta.configured,
        guidance: meta.configured
          ? '时区已配置，后续的过期判断、AI 中的“今天”以及通知调度都会使用这个时区。'
          : '时区尚未初始化，当前库存系统使用 UTC 而不是服务器本地时区。请运行 set_timezone，并传入 IANA 时区，例如 "Asia/Shanghai"。',
      });
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : '获取设置失败');
    }
  },
);

server.tool(
  'set_timezone',
  '初始化或更新库存系统的业务时区。这个时区会用于过期判断、AI 中的“今天”以及通知调度。',
  {
    timezone: z
      .string()
      .trim()
      .min(1, '时区不能为空')
      .describe('IANA 时区，例如 Asia/Shanghai 或 America/New_York'),
  },
  async ({ timezone }) => {
    try {
      const canonicalTimezone = canonicalizeTimezone(timezone);

      if (!canonicalTimezone) {
        return errorResult(`无效的时区：${timezone}`);
      }

      const db = getDb();
      const transaction = db.transaction(() => {
        setStoredTimezone(db, canonicalTimezone);
        db.prepare('UPDATE notification_channels SET last_notified_date = NULL').run();
      });

      transaction();

      return textResult({
        timezone: canonicalTimezone,
        configured: true,
        message:
          '时区已保存。后续的过期判断、AI 日期上下文和通知调度都会使用这个时区。',
      });
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : '设置时区失败');
    }
  },
);

server.tool(
  'list_medicines',
  'List all pesticide/agrochemical inventory items. Supports filtering by category, expiry status, or name search.',
  {
    category: z.string().optional().describe('Filter by category name'),
    status: z.enum(['expired', 'expiring', 'ok']).optional().describe('Filter by expiry status'),
    search: z.string().optional().describe('Fuzzy search on name'),
    expiring_days: z.number().positive().optional().describe('Days threshold for "expiring" status (default: 30)'),
  },
  async ({ category, status, search, expiring_days }) => {
    try {
      const db = getDb();
      const { todayStr, warningDateStr } = getDateBoundaries(expiring_days);
      const conditions: string[] = [];
      const params: (string | number)[] = [];

      if (category) {
        conditions.push('category = ?');
        params.push(category);
      }

      if (status === 'expired') {
        conditions.push("expires_at IS NOT NULL AND expires_at != '' AND expires_at < ?");
        params.push(todayStr);
      } else if (status === 'expiring') {
        conditions.push("expires_at IS NOT NULL AND expires_at != '' AND expires_at >= ? AND expires_at <= ?");
        params.push(todayStr, warningDateStr);
      } else if (status === 'ok') {
        conditions.push("expires_at IS NOT NULL AND expires_at != '' AND expires_at > ?");
        params.push(warningDateStr);
      }

      if (search) {
        conditions.push('(name LIKE ? OR brand LIKE ? OR name_en LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = db
        .prepare(`SELECT * FROM medicines ${where} ORDER BY expires_at IS NULL ASC, expires_at ASC, id ASC`)
        .all(...params) as MedicineRecord[];

      return textResult({ count: rows.length, medicines: rows.map(rowToMedicine) });
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'Failed to list medicines');
    }
  },
);

server.tool(
  'get_medicine',
  'Get a single pesticide/agrochemical inventory item by its ID.',
  { id: z.number().describe('Inventory item ID') },
  async ({ id }) => {
    try {
      const db = getDb();
      const row = db.prepare('SELECT * FROM medicines WHERE id = ?').get(id) as MedicineRecord | undefined;

      if (!row) {
        return errorResult(`Medicine with id ${id} not found`);
      }

      return textResult(rowToMedicine(row));
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'Failed to get medicine');
    }
  },
);

server.tool(
  'add_medicine',
  `Add a new pesticide/agrochemical inventory item. Only "name" is required; all other fields are optional.
IMPORTANT: Always provide "category" when possible. Available categories: ${DEFAULT_CATEGORIES.join('、')}.
If category is omitted, the system will attempt to auto-classify based on the active ingredient/product name and usage description.
Also try to fill in brand, name_en, spec, usage_desc, and other fields for better data quality.`,
  {
    name: z.string().trim().min(1, 'Product name is required').describe('Product name or active ingredient combination (required)'),
    brand: z.string().optional().describe('Brand, trade name, manufacturer brand, or product series'),
    name_en: z.string().optional().describe('English name or active ingredient English name'),
    spec: z.string().optional().describe('Content, formulation, or package specification, e.g. 32%悬浮剂, 100g/瓶'),
    quantity: z.string().optional().describe('Remaining inventory, e.g. 20瓶, 3袋'),
    expires_at: z.string().optional().describe('Expiry date in YYYY-MM-DD format'),
    category: z.string().optional().describe(`Category. Choose from: ${DEFAULT_CATEGORIES.join(', ')}. Or create a new reasonable category if none fits.`),
    usage_desc: z.string().optional().describe('Target pest/disease/weed, crop scenario, or inventory usage description'),
    location: z.string().optional().describe('Storage location, e.g. 农药库 A架'),
    notes: z.string().optional().describe('Additional notes'),
  },
  async (params) => {
    try {
      const db = getDb();
      let category = params.category?.trim() || null;

      category =
        normalizeAgrochemicalCategory(
          category,
          params.name,
          params.brand,
          params.name_en,
          params.spec,
          params.usage_desc,
          params.notes,
        ) ||
        inferAgrochemicalCategory(params.name, params.usage_desc) ||
        null;

      const result = db
        .prepare(
          `INSERT INTO medicines (name, brand, name_en, spec, quantity, expires_at, category, usage_desc, location, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          params.name.trim(),
          params.brand?.trim() || null,
          params.name_en?.trim() || null,
          params.spec?.trim() || null,
          params.quantity?.trim() || null,
          params.expires_at?.trim() || null,
          category,
          params.usage_desc?.trim() || null,
          params.location?.trim() || null,
          params.notes?.trim() || null,
        );

      const created = db
        .prepare('SELECT * FROM medicines WHERE id = ?')
        .get(result.lastInsertRowid) as MedicineRecord;

      return textResult(rowToMedicine(created));
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'Failed to add medicine');
    }
  },
);

server.tool(
  'update_medicine',
  'Update an existing pesticide/agrochemical inventory item by ID. Only provided fields will be changed.',
  {
    id: z.number().describe('Inventory item ID (required)'),
    name: z.string().optional().describe('Product name or active ingredient combination'),
    brand: z.string().optional().describe('Brand or trade name'),
    name_en: z.string().optional().describe('English name or active ingredient English name'),
    spec: z.string().optional().describe('Content, formulation, or package specification'),
    quantity: z.string().optional().describe('Remaining inventory'),
    expires_at: z.string().optional().describe('Expiry date in YYYY-MM-DD format'),
    category: z.string().optional().describe('Category'),
    usage_desc: z.string().optional().describe('Usage description'),
    location: z.string().optional().describe('Storage location'),
    notes: z.string().optional().describe('Additional notes'),
  },
  async ({ id, ...fields }) => {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM medicines WHERE id = ?').get(id) as MedicineRecord | undefined;

      if (!existing) {
        return errorResult(`Medicine with id ${id} not found`);
      }

      if (fields.name !== undefined && !fields.name.trim()) {
        return errorResult('Product name cannot be empty');
      }

      const setClauses: string[] = [];
      const params: (string | null | number)[] = [];

      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          setClauses.push(`${key} = ?`);
          if (key === 'category') {
            params.push(
              normalizeAgrochemicalCategory(
                typeof value === 'string' ? value : '',
                fields.name,
                fields.brand,
                fields.name_en,
                fields.spec,
                fields.usage_desc,
                fields.notes,
                existing.name,
                existing.brand,
                existing.name_en,
                existing.spec,
                existing.usage_desc,
                existing.notes,
              ) || null,
            );
          } else {
            params.push(typeof value === 'string' ? value.trim() || null : value);
          }
        }
      }

      if (setClauses.length === 0) {
        return textResult(rowToMedicine(existing));
      }

      params.push(id);
      db.prepare(`UPDATE medicines SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

      const updated = db.prepare('SELECT * FROM medicines WHERE id = ?').get(id) as MedicineRecord;
      return textResult(rowToMedicine(updated));
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'Failed to update medicine');
    }
  },
);

server.tool(
  'delete_medicine',
  'Delete an inventory item by ID.',
  { id: z.number().describe('Inventory item ID') },
  async ({ id }) => {
    try {
      const db = getDb();
      const result = db.prepare('DELETE FROM medicines WHERE id = ?').run(id);

      if (result.changes === 0) {
        return errorResult(`Medicine with id ${id} not found`);
      }

      return textResult({ deleted: true, id });
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'Failed to delete medicine');
    }
  },
);

server.tool(
  'get_stats',
  'Get summary statistics of the pesticide/agrochemical inventory: total count, expired, expiring, ok, and category breakdown.',
  {
    expiring_days: z.number().positive().optional().describe('Days threshold for "expiring" status (default: 30)'),
  },
  async ({ expiring_days }) => {
    try {
      return textResult(computeStats(expiring_days));
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'Failed to get stats');
    }
  },
);

server.tool(
  'search_medicines',
  'Search pesticide/agrochemical inventory by keyword across name, brand, English name, usage description, and notes fields.',
  { query: z.string().describe('Search keyword') },
  async ({ query }) => {
    try {
      const db = getDb();
      const pattern = `%${query}%`;
      const rows = db
        .prepare(
          `SELECT * FROM medicines
           WHERE name LIKE ? OR brand LIKE ? OR name_en LIKE ? OR usage_desc LIKE ? OR notes LIKE ?
           ORDER BY expires_at IS NULL ASC, expires_at ASC, id ASC`,
        )
        .all(pattern, pattern, pattern, pattern, pattern) as MedicineRecord[];

      return textResult({ count: rows.length, medicines: rows.map(rowToMedicine) });
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'Failed to search medicines');
    }
  },
);

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

server.resource(
  'settings',
  'medkit://settings',
  { description: '当前与库存 MCP 使用相关的设置，包括业务时区状态。', mimeType: 'application/json' },
  async () => {
    const meta = getTimezoneMeta();

    return {
      contents: [
        {
          uri: 'medkit://settings',
          text: JSON.stringify(
            {
              timezone: meta.timezone,
              configured: meta.configured,
              warning: meta.warning,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.resource(
  'medicines',
  'medkit://medicines',
  { description: 'Full list of all pesticide/agrochemical inventory items as JSON', mimeType: 'application/json' },
  async () => {
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM medicines ORDER BY expires_at IS NULL ASC, expires_at ASC, id ASC')
      .all() as MedicineRecord[];
    return { contents: [{ uri: 'medkit://medicines', text: JSON.stringify(rows.map(rowToMedicine), null, 2) }] };
  },
);

server.resource(
  'stats',
  new ResourceTemplate('medkit://stats{?expiring_days}', { list: undefined }),
  { description: 'Summary statistics of the medkit. Use ?expiring_days=N to customize the "expiring" threshold (default: 30).', mimeType: 'application/json' },
  async (uri, params) => {
    const days = Number(params.expiring_days) || 30;
    return { contents: [{ uri: uri.href, text: JSON.stringify(computeStats(days), null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const meta = getTimezoneMeta();
  if (!meta.configured) {
    console.error(
      `[mcp] 时区尚未初始化，当前为 ${meta.timezone}。请使用 "set_timezone" 工具完成初始化。`,
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MedKit MCP server running on stdio');
}

main().catch((err) => {
  console.error('MCP server failed to start:', err);
  process.exit(1);
});
