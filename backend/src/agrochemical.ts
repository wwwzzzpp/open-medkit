export const AGROCHEMICAL_CATEGORIES = [
  '杀虫剂',
  '杀菌剂',
  '除草剂',
  '杀螨剂',
  '杀线虫剂',
  '植物生长调节剂',
  '种衣剂/拌种剂',
  '熏蒸剂',
  '杀鼠剂',
  '杀软体动物剂',
  '生物农药',
  '助剂/增效剂',
  '肥料/叶面肥',
  '其他',
] as const;

export const AGROCHEMICAL_CATEGORY_GUIDE = [
  {
    category: '杀虫剂',
    cues: '噻虫胺、噻虫嗪、吡虫啉、啶虫脒、氯虫苯甲酰胺、甲维盐、虫螨腈、菊酯类，以及蚜虫、飞虱、蓟马、粉虱、螟虫等虫害',
  },
  {
    category: '杀菌剂',
    cues: '戊唑醇、苯醚甲环唑、嘧菌酯、吡唑醚菌酯、噻呋酰胺、多菌灵、代森锰锌，以及白粉病、锈病、纹枯病、赤霉病、霜霉病等病害',
  },
  {
    category: '除草剂',
    cues: '草甘膦、草铵膦、乙草胺、莠去津、烟嘧磺隆、精喹禾灵、二甲戊灵，以及禾本科杂草、阔叶杂草等',
  },
  {
    category: '杀螨剂',
    cues: '哒螨灵、炔螨特、螺螨酯、乙螨唑、联苯肼酯、噻螨酮、红蜘蛛、螨类',
  },
  {
    category: '杀线虫剂',
    cues: '噻唑膦、氟吡菌酰胺等线虫防治产品，或明确写有根结线虫、线虫',
  },
  {
    category: '植物生长调节剂',
    cues: '赤霉酸、芸苔素内酯、复硝酚钠、胺鲜酯、多效唑、矮壮素、乙烯利，以及控旺、生根、膨大、调节生长',
  },
  {
    category: '种衣剂/拌种剂',
    cues: '种衣剂、拌种剂、包衣、种子处理，或咯菌腈、精甲霜灵等用于种子处理的复配产品',
  },
  {
    category: '熏蒸剂',
    cues: '磷化铝、氯化苦、棉隆、威百亩、熏蒸、土壤消毒',
  },
  {
    category: '杀鼠剂',
    cues: '溴敌隆、溴鼠灵、敌鼠钠盐、杀鼠、灭鼠',
  },
  {
    category: '杀软体动物剂',
    cues: '四聚乙醛、杀螺胺、蜗牛、蛞蝓、福寿螺',
  },
  {
    category: '生物农药',
    cues: '苏云金杆菌、Bt、枯草芽孢杆菌、哈茨木霉、白僵菌、绿僵菌、木霉菌等微生物或生物源产品',
  },
  {
    category: '助剂/增效剂',
    cues: '有机硅、展着剂、渗透剂、增效剂、飞防助剂、沉降剂、抗飘移助剂',
  },
  {
    category: '肥料/叶面肥',
    cues: '腐植酸、氨基酸、海藻酸、磷酸二氢钾、水溶肥、叶面肥、中微量元素、硼肥、锌肥、钙镁肥',
  },
];

const GENERIC_CATEGORIES = new Set([
  '',
  '其他',
  '未知',
  '未分类',
  '农药',
  '农资',
  '药剂',
  '产品',
]);

const CATEGORY_ALIASES: Record<string, string> = {
  杀虫: '杀虫剂',
  杀虫药: '杀虫剂',
  杀虫剂类: '杀虫剂',
  杀菌: '杀菌剂',
  杀菌药: '杀菌剂',
  杀菌剂类: '杀菌剂',
  除草: '除草剂',
  除草剂类: '除草剂',
  杀螨: '杀螨剂',
  杀螨剂类: '杀螨剂',
  线虫: '杀线虫剂',
  杀线虫: '杀线虫剂',
  植调剂: '植物生长调节剂',
  调节剂: '植物生长调节剂',
  生长调节剂: '植物生长调节剂',
  拌种剂: '种衣剂/拌种剂',
  种衣剂: '种衣剂/拌种剂',
  熏蒸: '熏蒸剂',
  杀鼠: '杀鼠剂',
  灭鼠剂: '杀鼠剂',
  杀螺剂: '杀软体动物剂',
  生物制剂: '生物农药',
  生物药剂: '生物农药',
  助剂: '助剂/增效剂',
  增效剂: '助剂/增效剂',
  肥料: '肥料/叶面肥',
  叶面肥: '肥料/叶面肥',
  慢性病用药: '其他',
};

const CATEGORY_KEYWORDS: Record<(typeof AGROCHEMICAL_CATEGORIES)[number], string[]> = {
  杀虫剂: [
    '噻虫胺', '噻虫嗪', '吡虫啉', '啶虫脒', '呋虫胺', '烯啶虫胺', '氟啶虫胺腈',
    '氟啶虫酰胺', '氯虫苯甲酰胺', '溴氰虫酰胺', '甲维盐', '甲氨基阿维菌素',
    '阿维菌素', '多杀霉素', '乙基多杀菌素', '茚虫威', '虫螨腈', '虱螨脲',
    '毒死蜱', '辛硫磷', '敌敌畏', '敌百虫', '高效氯氟氰菊酯', '氯氟氰菊酯',
    '氯氰菊酯', '联苯菊酯', '高效氯氰菊酯', '螺虫乙酯', '杀虫', '虫害',
    '蚜虫', '飞虱', '蓟马', '粉虱', '菜青虫', '棉铃虫', '玉米螟', '螟虫',
    '稻纵卷叶螟', '鳞翅目', '鞘翅目',
  ],
  杀菌剂: [
    '戊唑醇', '苯醚甲环唑', '丙环唑', '氟环唑', '己唑醇', '三唑酮', '烯唑醇',
    '嘧菌酯', '吡唑醚菌酯', '肟菌酯', '醚菌酯', '噻呋酰胺', '氟吡菌酰胺',
    '氟唑菌酰羟胺', '啶酰菌胺', '多菌灵', '甲基硫菌灵', '代森锰锌', '百菌清',
    '咪鲜胺', '腐霉利', '异菌脲', '霜脲氰', '烯酰吗啉', '甲霜灵', '精甲霜灵',
    '恶霜灵', '春雷霉素', '中生菌素', '井冈霉素', '宁南霉素', '杀菌', '病害',
    '白粉病', '锈病', '纹枯病', '赤霉病', '叶斑病', '霜霉病', '灰霉病',
    '炭疽病', '根腐病', '稻瘟病', '枯萎病', '青枯病', '疫病',
  ],
  除草剂: [
    '草甘膦', '草铵膦', '乙草胺', '莠去津', '烟嘧磺隆', '苯磺隆', '甲嘧磺隆',
    '氟磺胺草醚', '精喹禾灵', '高效氟吡甲禾灵', '氯氟吡氧乙酸', '2甲4氯',
    '二甲戊灵', '异丙甲草胺', '扑草净', '灭草松', '氰氟草酯', '五氟磺草胺',
    '除草', '杂草', '禾本科杂草', '阔叶杂草', '莎草',
  ],
  杀螨剂: [
    '哒螨灵', '炔螨特', '螺螨酯', '乙螨唑', '联苯肼酯', '噻螨酮', '唑螨酯',
    '丁氟螨酯', '杀螨', '红蜘蛛', '螨类', '叶螨', '茶黄螨',
  ],
  杀线虫剂: [
    '噻唑膦', '氟吡菌酰胺', '阿维菌素颗粒剂', '淡紫拟青霉', '杀线虫', '线虫',
    '根结线虫', '胞囊线虫',
  ],
  植物生长调节剂: [
    '赤霉酸', '芸苔素内酯', '复硝酚钠', '胺鲜酯', '多效唑', '矮壮素', '乙烯利',
    '氯吡脲', '萘乙酸', '吲哚丁酸', '调节', '植调', '控旺', '生根', '膨大',
    '保花保果', '催熟', '促长',
  ],
  '种衣剂/拌种剂': [
    '种衣剂', '拌种剂', '拌种', '包衣', '种子处理', '咯菌腈', '精甲霜灵', '噻虫嗪种子处理',
  ],
  熏蒸剂: [
    '磷化铝', '氯化苦', '棉隆', '威百亩', '熏蒸', '土壤消毒',
  ],
  杀鼠剂: [
    '溴敌隆', '溴鼠灵', '敌鼠钠盐', '杀鼠', '灭鼠', '鼠害',
  ],
  杀软体动物剂: [
    '四聚乙醛', '杀螺胺', '杀螺', '蜗牛', '蛞蝓', '福寿螺',
  ],
  生物农药: [
    '苏云金杆菌', 'bt', '枯草芽孢杆菌', '哈茨木霉', '木霉菌', '白僵菌', '绿僵菌',
    '淡紫拟青霉', '多抗霉素', '申嗪霉素', '生物农药', '微生物',
  ],
  '助剂/增效剂': [
    '有机硅', '展着剂', '渗透剂', '增效剂', '助剂', '飞防助剂', '沉降剂', '抗飘移',
    '润湿剂', '分散剂',
  ],
  '肥料/叶面肥': [
    '腐植酸', '黄腐酸', '氨基酸', '海藻酸', '磷酸二氢钾', '水溶肥', '叶面肥',
    '大量元素', '中量元素', '微量元素', '硼肥', '锌肥', '钙镁', '钙肥', '镁肥',
    '复合肥', '尿素', '肥料', '营养', '冲施肥',
  ],
  其他: [],
};

function compact(value: string) {
  return value.trim().replace(/\s+/g, '').toLowerCase();
}

function isGenericCategory(category: string) {
  return GENERIC_CATEGORIES.has(category.trim());
}

function normalizeAlias(category: string) {
  const compacted = compact(category);

  for (const [alias, canonical] of Object.entries(CATEGORY_ALIASES)) {
    if (compacted === compact(alias) || compacted.includes(compact(alias))) {
      return canonical;
    }
  }

  return '';
}

export function inferAgrochemicalCategory(...parts: Array<string | null | undefined>) {
  const text = parts
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ')
    .toLowerCase();

  if (!text) {
    return '';
  }

  let bestCategory = '';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += keyword.length >= 4 ? 2 : 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

export function normalizeAgrochemicalCategory(
  category: string | null | undefined,
  ...context: Array<string | null | undefined>
) {
  const raw = category?.trim() || '';
  const exact = AGROCHEMICAL_CATEGORIES.find((item) => item === raw);

  if (exact && !isGenericCategory(exact)) {
    return exact;
  }

  const alias = raw ? normalizeAlias(raw) : '';
  if (alias) {
    return alias;
  }

  const inferred = inferAgrochemicalCategory(...context);
  if (inferred) {
    return inferred;
  }

  if (exact) {
    return exact;
  }

  return raw;
}
