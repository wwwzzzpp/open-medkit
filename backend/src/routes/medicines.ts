import { Hono } from 'hono';

import { normalizeAgrochemicalCategory } from '../agrochemical';
import { getDb } from '../db/client';
import { DEFAULT_CATEGORIES } from '../db/schema';
import {
  getDateBoundaries,
  getStoredTimezone,
} from '../utils/timezone';
import {
  listInventoryTransactions,
  recordInventoryTransaction,
} from '../services/inventory-transactions';

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

interface MedicineInput {
  name: string;
  brand?: string;
  name_en?: string;
  spec?: string;
  quantity?: string;
  expires_at?: string;
  category?: string;
  usage_desc?: string;
  location?: string;
  notes?: string;
}

interface InventoryBatchRecord {
  id: number;
  medicine_id: number;
  batch_no: string | null;
  production_date: string | null;
  expires_at: string | null;
  quantity: string | null;
  purchase_date: string | null;
  supplier: string | null;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface InventoryBatchInput {
  batch_no?: string;
  production_date?: string;
  expires_at?: string;
  quantity?: string;
  purchase_date?: string;
  supplier?: string;
  location?: string;
  notes?: string;
}

function normalizeExpiringDays(value?: string) {
  const numeric = Number(value);

  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.floor(numeric);
  }

  return 30;
}

function normalizeMedicineInput(input: Partial<MedicineInput>) {
  const normalized = {
    name: input.name?.trim() || '',
    brand: input.brand?.trim() || '',
    name_en: input.name_en?.trim() || '',
    spec: input.spec?.trim() || '',
    quantity: input.quantity?.trim() || '',
    expires_at: input.expires_at?.trim() || '',
    category: input.category?.trim() || '',
    usage_desc: input.usage_desc?.trim() || '',
    location: input.location?.trim() || '',
    notes: input.notes?.trim() || '',
  };

  return {
    ...normalized,
    category: normalizeAgrochemicalCategory(
      normalized.category,
      normalized.name,
      normalized.brand,
      normalized.name_en,
      normalized.spec,
      normalized.usage_desc,
      normalized.notes,
    ),
  };
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

function normalizeBatchInput(input: Partial<InventoryBatchInput>) {
  return {
    batch_no: input.batch_no?.trim() || '',
    production_date: input.production_date?.trim() || '',
    expires_at: input.expires_at?.trim() || '',
    quantity: input.quantity?.trim() || '',
    purchase_date: input.purchase_date?.trim() || '',
    supplier: input.supplier?.trim() || '',
    location: input.location?.trim() || '',
    notes: input.notes?.trim() || '',
  };
}

function rowToBatch(row: InventoryBatchRecord) {
  return {
    ...row,
    batch_no: row.batch_no || '',
    production_date: row.production_date || '',
    expires_at: row.expires_at || '',
    quantity: row.quantity || '',
    purchase_date: row.purchase_date || '',
    supplier: row.supplier || '',
    location: row.location || '',
    notes: row.notes || '',
  };
}

function getExistingMedicine(db: ReturnType<typeof getDb>, id: number, userId: number) {
  return db
    .prepare('SELECT * FROM medicines WHERE id = ? AND user_id = ?')
    .get(id, userId) as MedicineRecord | undefined;
}

export const medicinesRouter = new Hono<{ Variables: { userId: number } }>();

medicinesRouter.get('/', (c) => {
  try {
    const db = getDb();
    const userId = c.get('userId');
    const category = c.req.query('category');
    const status = c.req.query('status');
//     const userId = c.get('userId');
    const expiringDays = normalizeExpiringDays(c.req.query('expiringDays'));
    const { timezone } = getStoredTimezone(db);
    const { todayStr, warningDateStr } = getDateBoundaries(timezone, expiringDays);

    const conditions: string[] = ['user_id = ?'];
    const params: (string|number)[] = [userId];
    // const params: string[] = [];

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

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `SELECT * FROM medicines ${whereClause} ORDER BY expires_at IS NULL ASC, expires_at ASC, id ASC`
      )
      .all(...params) as MedicineRecord[];

    return c.json({ data: rows.map(rowToMedicine) });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to fetch medicines',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

medicinesRouter.get('/stats', (c) => {
  const userId = c.get('userId');
  try {
    const db = getDb();
    const expiringDays = normalizeExpiringDays(c.req.query('expiringDays'));
    const { timezone } = getStoredTimezone(db);
    const { todayStr, warningDateStr } = getDateBoundaries(timezone, expiringDays);

    const totals = db
      .prepare(
        `
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN expires_at IS NOT NULL AND expires_at != '' AND expires_at < ? THEN 1 ELSE 0 END) AS expired,
            SUM(CASE WHEN expires_at IS NOT NULL AND expires_at != '' AND expires_at >= ? AND expires_at <= ? THEN 1 ELSE 0 END) AS expiring,
            SUM(CASE WHEN expires_at IS NOT NULL AND expires_at != '' AND expires_at > ? THEN 1 ELSE 0 END) AS ok
          FROM medicines
          WHERE user_id = ?
        `
      )
      .get(todayStr, todayStr, warningDateStr, warningDateStr, userId) as {
      total: number;
      expired: number | null;
      expiring: number | null;
      ok: number | null;
    };

    const categories = db
      .prepare(
        `
          SELECT category, COUNT(*) AS count
          FROM medicines
          WHERE user_id = ? AND category IS NOT NULL AND category != ''
          GROUP BY category
          ORDER BY count DESC, category ASC
        `
      )
      .all(userId) as { category: string; count: number }[];

    return c.json({
      data: {
        total: totals.total || 0,
        expired: totals.expired || 0,
        expiring: totals.expiring || 0,
        ok: totals.ok || 0,
        categories,
      },
    });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to fetch stats',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

medicinesRouter.get('/export', (c) => {
  try {
    const db = getDb();
    const userId = c.get('userId');
    const medicines = db
      .prepare('SELECT * FROM medicines WHERE user_id = ? ORDER BY expires_at IS NULL ASC, expires_at ASC, id ASC')
      .all(userId) as MedicineRecord[];
    const today = new Date().toISOString().slice(0, 10);

    c.header('Content-Type', 'application/json');
    c.header(
      'Content-Disposition',
      `attachment; filename=medkit-export-${today}.json`
    );

    return c.json({
      exported_at: new Date().toISOString(),
      count: medicines.length,
      medicines: medicines.map(rowToMedicine),
    });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to export medicines',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

medicinesRouter.post('/import', async (c) => {
  try {
    const body = await c.req.json();
    const userId = c.get('userId');
    const importedRows = Array.isArray(body?.medicines) ? body.medicines : null;

    if (!importedRows) {
      return c.json({ error: 'Invalid import format' }, 400);
    }

    const db = getDb();
    const insert = db.prepare(
      `
        INSERT INTO medicines
        (user_id, name, brand, name_en, spec, quantity, expires_at, category, usage_desc, location, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    );

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    const transaction = db.transaction((items: unknown[]) => {
      items.forEach((item, index) => {
        const normalized = normalizeMedicineInput((item || {}) as Partial<MedicineInput>);

        if (!normalized.name) {
          skipped += 1;
          errors.push(`Row ${index + 1}: missing name`);
          return;
        }

        try {
          const result = insert.run(
            userId,
            normalized.name,
            normalized.brand || null,
            normalized.name_en || null,
            normalized.spec || null,
            normalized.quantity || null,
            normalized.expires_at || null,
            normalized.category || null,
            normalized.usage_desc || null,
            normalized.location || null,
            normalized.notes || null
          );
          recordInventoryTransaction(db, {
            userId,
            medicineId: Number(result.lastInsertRowid),
            medicineName: normalized.name,
            actionType: 'create',
            quantityBefore: '',
            quantityAfter: normalized.quantity,
            quantityDelta: normalized.quantity ? `+${normalized.quantity}` : '',
            source: 'import',
            reason: '导入新增库存',
          });
          imported += 1;
        } catch (error) {
          skipped += 1;
          errors.push(
            `Row ${index + 1}: ${
              error instanceof Error ? error.message : 'Unknown insert error'
            }`
          );
        }
      });
    });

    transaction(importedRows);

    return c.json({ data: { imported, skipped, errors } });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to import medicines',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

medicinesRouter.get('/categories', (c) => {
  try {
    const db = getDb();
    const userId = c.get('userId');
    const categories = db
      .prepare(
        `
          SELECT DISTINCT category
          FROM medicines
          WHERE user_id = ? AND category IS NOT NULL AND category != ''
          ORDER BY category ASC
        `
      )
      .all(userId) as { category: string }[];

    const merged = [...DEFAULT_CATEGORIES];

    categories.forEach(({ category }) => {
      if (!merged.includes(category)) {
        merged.push(category);
      }
    });

    return c.json({ data: merged });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to fetch categories',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

medicinesRouter.get('/:id/transactions', (c) => {
  try {
    const db = getDb();
    const userId = c.get('userId');
    const id = Number(c.req.param('id'));
//     const userId = c.get('userId');
    const limit = Number(c.req.query('limit') || 30);
    const existing = db
      .prepare('SELECT id FROM medicines WHERE id = ? AND user_id = ?')
      .get(id, userId) as { id: number } | undefined;

    if (!existing) {
      return c.json({ error: 'Medicine not found' }, 404);
    }

    return c.json({ data: listInventoryTransactions(db, userId, id, limit) });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to fetch inventory transactions',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});

medicinesRouter.get('/:id/batches', (c) => {
  const userId = c.get('userId');
  try {
    const db = getDb();
    const id = Number(c.req.param('id'));
    const existing = getExistingMedicine(db, id, userId);

    if (!existing) {
      return c.json({ error: 'Medicine not found' }, 404);
    }

    const rows = db
      .prepare(
        `
          SELECT *
          FROM inventory_batches
          WHERE user_id = ? AND medicine_id = ?
          ORDER BY expires_at IS NULL ASC, expires_at ASC, id ASC
        `,
      )
      .all(userId, id) as InventoryBatchRecord[];

    return c.json({ data: rows.map(rowToBatch) });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to fetch inventory batches',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});

medicinesRouter.post('/:id/batches', async (c) => {
  const userId = c.get('userId');
  try {
    const db = getDb();
    const id = Number(c.req.param('id'));
    const medicine = getExistingMedicine(db, id, userId);

    if (!medicine) {
      return c.json({ error: 'Medicine not found' }, 404);
    }

    const userId = c.get('userId');
    const payload = normalizeBatchInput((await c.req.json()) as Partial<InventoryBatchInput>);
    const hasContent = Object.values(payload).some((value) => value.length > 0);

    if (!hasContent) {
      return c.json({ error: 'Batch information is required' }, 400);
    }

    const result = db
      .prepare(
        `
          INSERT INTO inventory_batches
          (user_id, medicine_id, batch_no, production_date, expires_at, quantity, purchase_date, supplier, location, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        userId,
        id,
        payload.batch_no || null,
        payload.production_date || null,
        payload.expires_at || null,
        payload.quantity || null,
        payload.purchase_date || null,
        payload.supplier || null,
        payload.location || null,
        payload.notes || null,
      );

    if (payload.quantity) {
      recordInventoryTransaction(db, {
//         userId,
        

userId,
                    medicineId: id,
          medicineName: medicine.name,
          actionType: 'stock_in',
        quantityBefore: '',
        quantityAfter: payload.quantity,
        quantityDelta: `+${payload.quantity}`,
        source: 'manual',
        reason: payload.batch_no ? `新增批次 ${payload.batch_no}` : '新增批次',
      });
    }

    const batch = db
      .prepare('SELECT * FROM inventory_batches WHERE id = ? AND user_id = ?')
      .get(result.lastInsertRowid, userId) as InventoryBatchRecord;

    return c.json({ data: rowToBatch(batch) }, 201);
  } catch (error) {
    return c.json(
      {
        error: 'Failed to create inventory batch',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});

medicinesRouter.put('/:id/batches/:batchId', async (c) => {
  try {
    const db = getDb();
    const id = Number(c.req.param('id'));
    const userId = c.get('userId');
    const batchId = Number(c.req.param('batchId'));
    const medicine = getExistingMedicine(db, id, userId);

    if (!medicine) {
      return c.json({ error: 'Medicine not found' }, 404);
    }

    const existing = db
      .prepare('SELECT * FROM inventory_batches WHERE id = ? AND user_id = ? AND medicine_id = ?')
      .get(batchId, userId, id) as InventoryBatchRecord | undefined;

    if (!existing) {
      return c.json({ error: 'Batch not found' }, 404);
    }

    const payload = normalizeBatchInput((await c.req.json()) as Partial<InventoryBatchInput>);

    db.prepare(
      `
        UPDATE inventory_batches
        SET batch_no = ?, production_date = ?, expires_at = ?, quantity = ?, purchase_date = ?, supplier = ?, location = ?, notes = ?
        WHERE id = ? AND user_id = ? AND medicine_id = ?
      `,
    ).run(
      payload.batch_no || null,
      payload.production_date || null,
      payload.expires_at || null,
      payload.quantity || null,
      payload.purchase_date || null,
      payload.supplier || null,
      payload.location || null,
      payload.notes || null,
      batchId,
      userId,
      id,
    );

    if ((existing.quantity || '') !== payload.quantity) {
      recordInventoryTransaction(db, {
        userId,

userId,
                    medicineId: id,
          medicineName: medicine.name,
          actionType: 'adjustment',
        quantityBefore: existing.quantity || '',
        quantityAfter: payload.quantity,
        source: 'manual',
        reason: payload.batch_no ? `编辑批次 ${payload.batch_no}` : '编辑批次',
      });
    }

    const batch = db
      .prepare('SELECT * FROM inventory_batches WHERE id = ? AND user_id = ?')
      .get(batchId, userId) as InventoryBatchRecord;

    return c.json({ data: rowToBatch(batch) });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to update inventory batch',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});

medicinesRouter.delete('/:id/batches/:batchId', (c) => {
  const userId = c.get('userId');
  try {
    const db = getDb();
    const id = Number(c.req.param('id'));
    const batchId = Number(c.req.param('batchId'));
    const medicine = getExistingMedicine(db, id, userId);

    if (!medicine) {
      return c.json({ error: 'Medicine not found' }, 404);
    }

    const existing = db
      .prepare('SELECT * FROM inventory_batches WHERE id = ? AND user_id = ? AND medicine_id = ?')
      .get(batchId, userId, id) as InventoryBatchRecord | undefined;

    if (!existing) {
      return c.json({ error: 'Batch not found' }, 404);
    }

    if (existing.quantity) {
      recordInventoryTransaction(db, {
        userId,

userId,
                    medicineId: id,
          medicineName: medicine.name,
          actionType: 'adjustment',
        quantityBefore: existing.quantity,
        quantityAfter: '',
        quantityDelta: `-${existing.quantity}`,
        source: 'manual',
        reason: existing.batch_no ? `删除批次 ${existing.batch_no}` : '删除批次',
      });
    }

    db.prepare('DELETE FROM inventory_batches WHERE id = ? AND user_id = ? AND medicine_id = ?').run(batchId, userId, id);

    return c.json({ data: { deleted: true } });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to delete inventory batch',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});

medicinesRouter.get('/:id', (c) => {
  const userId = c.get('userId');
  try {
    const db = getDb();
    const id = Number(c.req.param('id'));

    const medicine = db
      .prepare('SELECT * FROM medicines WHERE id = ? AND user_id = ?')
    .get(id, userId) as MedicineRecord | undefined;

    if (!medicine) {
      return c.json({ error: 'Medicine not found' }, 404);
    }

    return c.json({ data: rowToMedicine(medicine) });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to fetch medicine',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

medicinesRouter.post('/', async (c) => {
  const userId = c.get('userId');
  try {
    const db = getDb();
    const payload = normalizeMedicineInput((await c.req.json()) as Partial<MedicineInput>);

    if (!payload.name) {
      return c.json({ error: 'Medicine name is required' }, 400);
    }

    const result = db
      .prepare(
        `
          INSERT INTO medicines
          (user_id, name, brand, name_en, spec, quantity, expires_at, category, usage_desc, location, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        userId,
        payload.name,
        payload.brand || null,
        payload.name_en || null,
        payload.spec || null,
        payload.quantity || null,
        payload.expires_at || null,
        payload.category || null,
        payload.usage_desc || null,
        payload.location || null,
        payload.notes || null
      );

    const medicine = db
      .prepare('SELECT * FROM medicines WHERE id = ? AND user_id = ?')
      .get(result.lastInsertRowid, userId) as MedicineRecord;

    recordInventoryTransaction(db, {
      userId,
      medicineId: medicine.id,
      medicineName: medicine.name,
      actionType: 'create',
      quantityBefore: '',
      quantityAfter: payload.quantity,
      quantityDelta: payload.quantity ? `+${payload.quantity}` : '',
      source: 'manual',
      reason: '新增库存',
    });

    return c.json({ data: rowToMedicine(medicine) }, 201);
  } catch (error) {
    return c.json(
      {
        error: 'Failed to create medicine',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

medicinesRouter.put('/:id', async (c) => {
  const userId = c.get('userId');
  try {
    const db = getDb();
    const id = Number(c.req.param('id'));
    const existing = db
      .prepare('SELECT * FROM medicines WHERE id = ? AND user_id = ?')
    .get(id, userId) as MedicineRecord | undefined;

    if (!existing) {
      return c.json({ error: 'Medicine not found' }, 404);
    }

    const payload = normalizeMedicineInput((await c.req.json()) as Partial<MedicineInput>);

    if (!payload.name) {
      return c.json({ error: 'Medicine name is required' }, 400);
    }

    db.prepare(
      `
        UPDATE medicines
        SET name = ?, brand = ?, name_en = ?, spec = ?, quantity = ?, expires_at = ?, category = ?, usage_desc = ?, location = ?, notes = ?
        WHERE id = ? AND user_id = ?
      `
    ).run(
      payload.name,
      payload.brand || null,
      payload.name_en || null,
      payload.spec || null,
      payload.quantity || null,
      payload.expires_at || null,
      payload.category || null,
      payload.usage_desc || null,
      payload.location || null,
      payload.notes || null,
      id,
      userId
    );

    const medicine = db
      .prepare('SELECT * FROM medicines WHERE id = ? AND user_id = ?')
    .get(id, userId) as MedicineRecord;

    if ((existing.quantity || '') !== (payload.quantity || '')) {
      recordInventoryTransaction(db, {
        userId,

userId,
                    medicineId: id,
          medicineName: medicine.name,
          actionType: 'adjustment',
        quantityBefore: existing.quantity || '',
        quantityAfter: payload.quantity,
        source: 'manual',
        reason: '手动编辑库存数量',
      });
    }

    return c.json({ data: rowToMedicine(medicine) });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to update medicine',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

medicinesRouter.delete('/:id', (c) => {
  const userId = c.get('userId');
  try {
    const db = getDb();
    const id = Number(c.req.param('id'));
    const existing = db
      .prepare('SELECT * FROM medicines WHERE id = ? AND user_id = ?')
    .get(id, userId) as MedicineRecord | undefined;

    if (!existing) {
      return c.json({ error: 'Medicine not found' }, 404);
    }

    recordInventoryTransaction(db, {
      userId,
      medicineId: id,
      medicineName: existing.name,
      actionType: 'delete',
      quantityBefore: existing.quantity || '',
      quantityAfter: '',
      quantityDelta: existing.quantity ? `-${existing.quantity}` : '',
      source: 'manual',
      reason: '删除产品',
    });

    const result = db.prepare('DELETE FROM medicines WHERE id = ? AND user_id = ?').run(id, userId);

    if (result.changes === 0) {
      return c.json({ error: 'Medicine not found' }, 404);
    }

    return c.json({ data: { deleted: true } });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to delete medicine',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
