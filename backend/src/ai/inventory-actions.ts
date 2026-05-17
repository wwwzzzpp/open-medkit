import type { Medicine } from './medicine';

type InventoryAdjustmentOperation = 'decrease';

export interface InventoryAdjustmentIntent {
  operation: InventoryAdjustmentOperation;
  medicine: Medicine;
  amount: number;
  unit: string;
}

export interface ParsedQuantity {
  amount: number;
  unit: string;
}

const DECREASE_KEYWORDS = [
  '库存减掉',
  '库存减少',
  '减掉库存',
  '减少库存',
  '扣掉',
  '扣除',
  '减掉',
  '减少',
  '出库',
  '领用',
  '用掉',
  '用了',
  '消耗',
  '减',
];

const UNIT_PATTERN =
  '(公斤|千克|毫升|kg|KG|Kg|ml|mL|瓶|袋|盒|桶|箱|包|支|件|罐|板|粒|片|颗|枚|卷|套|组|斤|克|g|G|升|L|l|吨)';
const NUMBER_PATTERN = '([0-9]+(?:\\.[0-9]+)?|[零〇一二两三四五六七八九十百千万]+)';

const digitMap: Record<string, number> = {
  零: 0,
  '〇': 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

function normalizeText(value: string) {
  return value.replace(/[\s，。,.！!？?：:；;、·\-_/()（）【】\[\]"'“”‘’]/g, '').toLowerCase();
}

function parseChineseInteger(value: string) {
  if (!value) return null;

  if (Object.prototype.hasOwnProperty.call(digitMap, value)) {
    return digitMap[value];
  }

  let total = 0;
  let section = 0;
  let number = 0;

  for (const char of value) {
    if (Object.prototype.hasOwnProperty.call(digitMap, char)) {
      number = digitMap[char];
      continue;
    }

    if (char === '十') {
      section += (number || 1) * 10;
      number = 0;
      continue;
    }

    if (char === '百') {
      section += (number || 1) * 100;
      number = 0;
      continue;
    }

    if (char === '千') {
      section += (number || 1) * 1000;
      number = 0;
      continue;
    }

    if (char === '万') {
      total += (section + number) * 10000;
      section = 0;
      number = 0;
      continue;
    }

    return null;
  }

  return total + section + number;
}

export function parseInventoryNumber(value: string) {
  const trimmed = value.trim();
  const numeric = Number(trimmed);

  if (Number.isFinite(numeric)) {
    return numeric;
  }

  return parseChineseInteger(trimmed);
}

function findEarliestKeywordIndex(text: string) {
  return DECREASE_KEYWORDS.reduce<number | null>((earliest, keyword) => {
    const index = text.indexOf(keyword);
    if (index < 0) return earliest;
    return earliest === null ? index : Math.min(earliest, index);
  }, null);
}

function findRequestedAmount(question: string) {
  const compact = question.replace(/\s+/g, '');
  const afterAction = new RegExp(
    `(?:${DECREASE_KEYWORDS.join('|')})${NUMBER_PATTERN}\\s*${UNIT_PATTERN}?`,
  );
  const beforeAction = new RegExp(
    `${NUMBER_PATTERN}\\s*${UNIT_PATTERN}?(?:${DECREASE_KEYWORDS.join('|')})`,
  );
  const match = compact.match(afterAction) || compact.match(beforeAction);

  if (!match) {
    return null;
  }

  const amount = parseInventoryNumber(match[1]);

  if (amount === null || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return {
    amount,
    unit: typeof match[2] === 'string' ? match[2] : '',
  };
}

function medicineCandidateNames(medicine: Medicine) {
  return [
    medicine.name,
    medicine.brand,
    medicine.name_en,
    medicine.brand && medicine.brand !== medicine.name ? `${medicine.brand}${medicine.name}` : '',
  ]
    .filter(Boolean)
    .map((value) => String(value));
}

function findMedicineForAdjustment(question: string, medicines: Medicine[]) {
  const normalizedQuestion = normalizeText(question);
  const actionIndex = findEarliestKeywordIndex(question);
  const subject = actionIndex === null ? '' : normalizeText(question.slice(0, actionIndex));
  const matches: Array<{ medicine: Medicine; score: number }> = [];

  medicines.forEach((medicine) => {
    let bestScore = 0;

    medicineCandidateNames(medicine).forEach((candidate) => {
      const normalizedCandidate = normalizeText(candidate);

      if (!normalizedCandidate || normalizedCandidate.length < 2) {
        return;
      }

      if (normalizedQuestion.includes(normalizedCandidate)) {
        bestScore = Math.max(bestScore, 1000 + normalizedCandidate.length);
      } else if (subject.length >= 2 && normalizedCandidate.includes(subject)) {
        bestScore = Math.max(bestScore, 500 + subject.length);
      } else if (subject.length >= 2 && subject.includes(normalizedCandidate)) {
        bestScore = Math.max(bestScore, 400 + normalizedCandidate.length);
      }
    });

    if (bestScore > 0) {
      matches.push({ medicine, score: bestScore });
    }
  });

  matches.sort((left, right) => right.score - left.score);

  if (matches.length === 0) {
    return null;
  }

  if (matches.length > 1 && matches[0].score === matches[1].score) {
    return 'ambiguous' as const;
  }

  return matches[0].medicine;
}

export function parseInventoryAdjustmentIntent(
  question: string,
  medicines: Medicine[],
): InventoryAdjustmentIntent | null | { error: string } {
  if (!DECREASE_KEYWORDS.some((keyword) => question.includes(keyword))) {
    return null;
  }

  const amount = findRequestedAmount(question);

  if (!amount) {
    return {
      error: '我识别到你想调整库存，但没有看清要减少多少。可以这样说：某某农药库存减掉 1 瓶。',
    };
  }

  const medicine = findMedicineForAdjustment(question, medicines);

  if (!medicine) {
    return {
      error: '我识别到你想调整库存，但没有在库存中找到对应产品。请把产品名称写完整一点。',
    };
  }

  if (medicine === 'ambiguous') {
    return {
      error: '我识别到多个相似产品，暂时不敢自动扣减。请把产品名称写完整一点。',
    };
  }

  return {
    operation: 'decrease',
    medicine,
    amount: amount.amount,
    unit: amount.unit,
  };
}

export function parseStockQuantity(quantity: string): ParsedQuantity | null {
  const trimmed = quantity.trim();

  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(new RegExp(`${NUMBER_PATTERN}\\s*${UNIT_PATTERN}?`));

  if (!match) {
    return null;
  }

  const amount = parseInventoryNumber(match[1]);

  if (amount === null || !Number.isFinite(amount)) {
    return null;
  }

  const trailing = trimmed.slice((match.index || 0) + match[0].length).trim();
  const unit = (match[2] || trailing || '').trim();

  return {
    amount,
    unit,
  };
}

export function formatStockQuantity(amount: number, unit: string) {
  const rounded = Number(amount.toFixed(3));
  return `${rounded}${unit}`;
}
