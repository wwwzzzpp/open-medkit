import { formatStockQuantity, parseStockQuantity } from '../ai/inventory-actions';
import type { SqliteDatabase } from '../db/client';

export type InventoryActionType = 'create' | 'stock_in' | 'stock_out' | 'adjustment' | 'delete';
export type InventoryTransactionSource = 'manual' | 'ai' | 'import';

export interface InventoryTransactionInput {
  medicineId?: number | null;
  medicineName: string;
  actionType: InventoryActionType;
  quantityBefore?: string;
  quantityAfter?: string;
  quantityDelta?: string;
  source?: InventoryTransactionSource;
  reason?: string;
  note?: string;
}

export interface InventoryTransactionRecord {
  id: number;
  medicine_id: number | null;
  medicine_name: string;
  action_type: InventoryActionType;
  quantity_before: string | null;
  quantity_after: string | null;
  quantity_delta: string | null;
  source: InventoryTransactionSource;
  reason: string | null;
  note: string | null;
  created_at: string;
}

export function buildQuantityDelta(quantityBefore?: string, quantityAfter?: string) {
  const before = parseStockQuantity(quantityBefore || '');
  const after = parseStockQuantity(quantityAfter || '');

  if (!before || !after) {
    return '';
  }

  const beforeUnit = before.unit.trim();
  const afterUnit = after.unit.trim();

  if (beforeUnit && afterUnit && beforeUnit !== afterUnit) {
    return '';
  }

  const unit = afterUnit || beforeUnit;
  const delta = after.amount - before.amount;

  if (delta === 0) {
    return '';
  }

  return delta > 0
    ? `+${formatStockQuantity(delta, unit)}`
    : formatStockQuantity(delta, unit);
}

export function recordInventoryTransaction(
  db: SqliteDatabase,
  input: InventoryTransactionInput,
) {
  db.prepare(
    `
      INSERT INTO inventory_transactions
      (medicine_id, medicine_name, action_type, quantity_before, quantity_after, quantity_delta, source, reason, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    input.medicineId || null,
    input.medicineName.trim() || '未知产品',
    input.actionType,
    input.quantityBefore?.trim() || null,
    input.quantityAfter?.trim() || null,
    input.quantityDelta?.trim() || buildQuantityDelta(input.quantityBefore, input.quantityAfter) || null,
    input.source || 'manual',
    input.reason?.trim() || null,
    input.note?.trim() || null,
  );
}

export function listInventoryTransactions(
  db: SqliteDatabase,
  medicineId: number,
  limit = 30,
) {
  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : 30;

  return db
    .prepare(
      `
        SELECT *
        FROM inventory_transactions
        WHERE medicine_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `,
    )
    .all(medicineId, normalizedLimit) as InventoryTransactionRecord[];
}
