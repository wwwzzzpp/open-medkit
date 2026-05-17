import { getDb } from '../db/client';
import { DEFAULT_CATEGORIES } from '../db/schema';
import { normalizeAgrochemicalCategory } from '../agrochemical';
import {
  getDateBoundaries as getTimezoneDateBoundaries,
  getStoredTimezone,
} from '../utils/timezone';
import type { QueryResponseStyle } from './types';

export interface MedicineRecord {
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

export function rowToMedicine(row: MedicineRecord) {
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

export type Medicine = ReturnType<typeof rowToMedicine>;

export function normalizeExpiringDays(value: unknown) {
  const numeric = Number(value);

  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.floor(numeric);
  }

  return 30;
}

export function normalizeQueryResponseStyle(value: unknown): QueryResponseStyle {
  return value === 'detailed' ? 'detailed' : 'concise';
}

export function getDateBoundaries(expiringDays = 30, timezone?: string) {
  const resolvedTimezone = timezone || getStoredTimezone(getDb()).timezone;
  const { todayStr, warningDateStr } = getTimezoneDateBoundaries(resolvedTimezone, expiringDays);

  return {
    todayStr,
    in30daysStr: warningDateStr,
  };
}

export function getMedicineExpiryState(
  medicine: Medicine,
  todayStr: string,
  in30daysStr: string,
) {
  if (!medicine.expires_at) {
    return 'unknown' as const;
  }

  if (medicine.expires_at < todayStr) {
    return 'expired' as const;
  }

  if (medicine.expires_at <= in30daysStr) {
    return 'expiring' as const;
  }

  return 'ok' as const;
}

export function normalizeMedicineDraftPayload(parsed: Record<string, unknown>) {
  const name = typeof parsed.name === 'string' ? parsed.name : '';
  const brand = typeof parsed.brand === 'string' ? parsed.brand : '';
  const nameEn = typeof parsed.name_en === 'string' ? parsed.name_en : '';
  const spec = typeof parsed.spec === 'string' ? parsed.spec : '';
  const category = typeof parsed.category === 'string' ? parsed.category : '';
  const usageDesc = typeof parsed.usage_desc === 'string' ? parsed.usage_desc : '';
  const notes = typeof parsed.notes === 'string' ? parsed.notes : '';

  return {
    name,
    brand,
    name_en: nameEn,
    spec,
    quantity: typeof parsed.quantity === 'string' ? parsed.quantity : '',
    expires_at: typeof parsed.expires_at === 'string' ? parsed.expires_at : '',
    category: normalizeAgrochemicalCategory(category, name, brand, nameEn, spec, usageDesc, notes),
    usage_desc: usageDesc,
    location: typeof parsed.location === 'string' ? parsed.location : '',
    notes,
  };
}

export function validateImageDataUrl(image: unknown): { mimeType: string; dataUrl: string } | null {
  if (typeof image !== 'string') return null;
  const match = image.match(/^data:(image\/(?:jpeg|jpg|png|gif|webp));base64,/i);
  if (!match) return null;
  return { mimeType: match[1], dataUrl: image };
}

export async function getDynamicCategories() {
  const db = getDb();
  const rows = db
    .prepare(
      `
        SELECT DISTINCT category
        FROM medicines
        WHERE category IS NOT NULL AND category != ''
        ORDER BY category ASC
      `,
    )
    .all() as { category: string }[];

  const merged = [...DEFAULT_CATEGORIES];

  rows.forEach(({ category }) => {
    if (!merged.includes(category)) {
      merged.push(category);
    }
  });

  return merged;
}

export function getAllMedicines() {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM medicines ORDER BY expires_at IS NULL ASC, expires_at ASC, id ASC')
    .all() as MedicineRecord[];
  return rows.map(rowToMedicine);
}
