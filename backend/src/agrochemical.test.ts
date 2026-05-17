import { describe, expect, it } from 'vitest';

import {
  AGROCHEMICAL_CATEGORIES,
  inferAgrochemicalCategory,
  normalizeAgrochemicalCategory,
} from './agrochemical';

describe('agrochemical categories', () => {
  it('uses pesticide/agrochemical defaults', () => {
    expect(AGROCHEMICAL_CATEGORIES).toContain('杀虫剂');
    expect(AGROCHEMICAL_CATEGORIES).toContain('杀菌剂');
    expect(AGROCHEMICAL_CATEGORIES).toContain('肥料/叶面肥');
  });

  it('infers category from active ingredients', () => {
    expect(inferAgrochemicalCategory('噻呋酰胺·戊唑醇 32%')).toBe('杀菌剂');
    expect(inferAgrochemicalCategory('氯氟噻虫胺 12% 防蚜虫')).toBe('杀虫剂');
    expect(inferAgrochemicalCategory('腐植酸水溶肥')).toBe('肥料/叶面肥');
  });

  it('replaces generic categories when context is specific', () => {
    expect(normalizeAgrochemicalCategory('其他', '噻呋酰胺戊唑醇')).toBe('杀菌剂');
    expect(normalizeAgrochemicalCategory('肥料', '腐植酸')).toBe('肥料/叶面肥');
    expect(normalizeAgrochemicalCategory('慢性病用药', '阿莫西林')).toBe('其他');
  });

  it('keeps custom category when no better inference exists', () => {
    expect(normalizeAgrochemicalCategory('仓库自定义', '未知产品')).toBe('仓库自定义');
  });
});
