import { describe, expect, it } from 'vitest';

import {
  formatStockQuantity,
  parseInventoryAdjustmentIntent,
  parseInventoryNumber,
  parseStockQuantity,
} from './inventory-actions';
import type { Medicine } from './medicine';

function makeMedicine(overrides: Partial<Medicine>): Medicine {
  return {
    id: 1,
    name: '甲氨基阿维菌素苯甲酸盐',
    brand: '',
    name_en: '',
    spec: '1%，200g/瓶',
    quantity: '15瓶',
    expires_at: '',
    category: '杀虫剂',
    usage_desc: '',
    location: '',
    notes: '',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  };
}

describe('inventory actions', () => {
  it('parses Arabic and Chinese inventory numbers', () => {
    expect(parseInventoryNumber('12')).toBe(12);
    expect(parseInventoryNumber('一')).toBe(1);
    expect(parseInventoryNumber('十五')).toBe(15);
    expect(parseInventoryNumber('二十三')).toBe(23);
  });

  it('parses stock quantity with unit', () => {
    expect(parseStockQuantity('15瓶')).toEqual({ amount: 15, unit: '瓶' });
    expect(parseStockQuantity('1.5kg')).toEqual({ amount: 1.5, unit: 'kg' });
  });

  it('detects decrease command and matched product', () => {
    const intent = parseInventoryAdjustmentIntent('甲氨基阿维菌素苯甲酸盐 库存减掉一。', [
      makeMedicine({}),
    ]);

    expect(intent && !('error' in intent) ? intent.amount : null).toBe(1);
    expect(intent && !('error' in intent) ? intent.unit : null).toBe('');
    expect(intent && !('error' in intent) ? intent.medicine.id : null).toBe(1);
  });

  it('keeps stock quantity formatting compact', () => {
    expect(formatStockQuantity(14, '瓶')).toBe('14瓶');
    expect(formatStockQuantity(1.25, 'kg')).toBe('1.25kg');
  });
});
