import type { ChatMessage, QueryResponseStyle } from './types';
import type { Medicine } from './medicine';
import { AGROCHEMICAL_CATEGORY_GUIDE } from '../agrochemical';

function buildCategoryGuide() {
  return AGROCHEMICAL_CATEGORY_GUIDE.map(
    (item) => `- ${item.category}：${item.cues}`,
  ).join('\n');
}

export function buildParsePrompt(categories: string[]) {
  return `你是一个农药/农资库存信息提取助手。用户会描述一个农药、肥料或农资产品，你需要从中提取结构化信息。
请严格按照以下 JSON 格式返回，不要有任何其他文字：
{
  "name": "产品名称或有效成分组合（必填）",
  "brand": "品牌名、商品名、厂家品牌或系列名（选填，不确定留空字符串）",
  "name_en": "英文名、有效成分英文名或登记名称（选填，不确定留空字符串）",
  "spec": "含量、剂型或包装规格，如 32%悬浮剂、100g/瓶（选填）",
  "quantity": "库存数量如 20瓶、3袋、半桶（选填）",
  "expires_at": "有效期，格式 YYYY-MM-DD（选填，不确定留空字符串。只有年月时默认为当月最后一天）",
  "category": "分类，优先从以下已有分类选择：${categories.join('、')}。如果都不匹配，可以新建合理的分类名（选填）",
  "usage_desc": "防治对象、作物场景或用途（选填）",
  "location": "存放位置（选填）",
  "notes": "备注（选填）"
}

农药/农资分类知识：
${buildCategoryGuide()}

规则：
- name 优先使用包装上的有效成分组合或产品登记名称，不要包含含量、剂型、包装规格或厂家；能拆分商品名/品牌时不要把品牌放入 name
- 如果名称中同时出现商品名和有效成分，请把商品名放入 brand，把有效成分组合放入 name
- category 不要笼统写“农药”“药剂”“未知”；应尽量根据有效成分或用途判断为杀虫剂、杀菌剂、除草剂、肥料/叶面肥等
- 复配产品按主要防治对象判断。例如“噻呋酰胺·戊唑醇”属于杀菌剂，“噻虫胺”属于杀虫剂，“腐植酸/氨基酸/水溶肥”属于肥料/叶面肥
- usage_desc 只写库存整理层面的用途/防治对象，不要编造施药剂量、稀释倍数、混配方案或安全间隔期
- quantity 保留用户原始说法（如"一瓶""大约20袋""半桶"），不要擅自换算单位
- expires_at 只有年月时默认为当月最后一天；完全不确定时留空字符串

示例输入：32%噻呋酰胺·戊唑醇，100g/瓶，还剩41瓶，放在仓库A架，小麦纹枯病
示例输出：
{
  "name": "噻呋酰胺·戊唑醇",
  "brand": "",
  "name_en": "",
  "spec": "32%含量，100g/瓶",
  "quantity": "41瓶",
  "expires_at": "",
  "category": "杀菌剂",
  "usage_desc": "用于小麦纹枯病等病害防治",
  "location": "仓库A架",
  "notes": ""
}

示例输入：氯氟噻虫胺12%，200g/瓶，4瓶，防蚜虫飞虱
示例输出：
{
  "name": "氯氟噻虫胺",
  "brand": "",
  "name_en": "",
  "spec": "12%含量，200g/瓶",
  "quantity": "4瓶",
  "expires_at": "",
  "category": "杀虫剂",
  "usage_desc": "用于蚜虫、飞虱等虫害防治",
  "location": "",
  "notes": ""
}`;
}

export function buildBatchParsePrompt(categories: string[], itemCount: number) {
  return `你是一个农药/农资库存信息提取助手。用户将描述 ${itemCount} 个农药、肥料或农资产品（每行一个），请返回一个 JSON 对象，其中 "medicines" 字段是一个数组，每个元素对应一行产品。
严格按照以下格式返回，不要有任何其他文字：
{
  "medicines": [
    {
      "name": "产品名称或有效成分组合（必填）",
      "brand": "品牌名、商品名、厂家品牌或系列名（选填，不确定留空字符串）",
      "name_en": "英文名、有效成分英文名或登记名称（选填，不确定留空字符串）",
      "spec": "含量、剂型或包装规格，如 32%悬浮剂、100g/瓶（选填）",
      "quantity": "库存数量如 20瓶、3袋、半桶（选填）",
      "expires_at": "有效期，格式 YYYY-MM-DD（选填，不确定留空字符串。只有年月时默认为当月最后一天）",
      "category": "分类，优先从以下已有分类选择：${categories.join('、')}。如果都不匹配，可以新建合理的分类名（选填）",
      "usage_desc": "防治对象、作物场景或用途（选填）",
      "location": "存放位置（选填）",
      "notes": "备注（选填）"
    }
  ]
}
分类知识：
${buildCategoryGuide()}

请确保 medicines 数组长度与输入行数一致（${itemCount} 个元素）。不要把 category 写成“农药”“未知”，能根据有效成分判断时必须细分。不要编造施药剂量、稀释倍数或混配方案。`;
}

export function buildDraftCompletionPrompt(categories: string[]) {
  return `你是一个农药/农资库存录入助手。用户已经填写了一份库存草稿，请你在已有信息基础上尽量补全和规范化以下字段：brand、name、name_en、spec、category、usage_desc。

请严格返回一个 JSON 对象，且只能包含以下字段：
{
  "name": "产品名称或有效成分组合；不确定留空字符串",
  "brand": "品牌名、商品名、厂家品牌或系列名；不确定留空字符串",
  "name_en": "英文名、有效成分英文名或登记名称；不确定留空字符串",
  "spec": "含量、剂型或包装规格，如 32%悬浮剂、100g/瓶；不确定留空字符串",
  "category": "分类，优先从以下已有分类中选择：${categories.join('、')}；如果都不匹配，再给出合理新分类；不确定留空字符串",
  "usage_desc": "防治对象、作物场景或用途，使用中文简洁描述；不确定留空字符串"
}

分类知识：
${buildCategoryGuide()}

规则：
1. 仅根据用户已提供的信息和常见农药/农资知识进行谨慎补全
2. 不确定时必须返回空字符串，不要猜测批号、数量、有效期、存放位置等未要求字段
3. 如果原始描述或名称中同时出现商品名和有效成分，请把商品名放入 brand，把有效成分组合放入 name
4. 如果用户已有填写内容比较明确，可以在保持原意的前提下补全或规范化
5. 不要把 category 写成“农药”“未知”；能根据有效成分判断时必须细分
6. 不要编造施药剂量、稀释倍数、混配方案或安全间隔期
7. 不要返回 Markdown，不要返回解释说明，不要返回额外字段`;
}

export function buildImageParseMessages(categories: string[], imageDataUrl: string): ChatMessage[] {
  return [
    { role: 'system', content: buildParsePrompt(categories) },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageDataUrl } },
        {
          type: 'text',
          text: `请从这张农药/农资包装照片中提取库存信息。
注意：
- 优先读取包装正面的商品名、有效成分、含量、剂型和包装规格
- 如果包装上有醒目的商品名或厂家品牌，请写入 brand 字段；name 仍尽量使用有效成分组合或产品登记名称
- 分类要按有效成分或用途细分为杀虫剂、杀菌剂、除草剂、肥料/叶面肥等，不要只写“农药”
- 有效期通常印在包装侧面或底部，格式可能是"有效期至YYYY.MM"或"EXP YYYY/MM"
- 如果图片模糊或信息不完整，只提取能确认的字段，其他留空字符串
- 不要猜测图片中看不到的信息，不要编造施药剂量或混配方案`,
        },
      ],
    },
  ];
}

export function buildQueryPrompt(
  todayStr: string,
  in30daysStr: string,
  expiringDays: number,
  responseStyle: QueryResponseStyle,
) {
  const styleInstruction =
    responseStyle === 'detailed'
      ? '2. 正文可以使用 4 到 6 个短要点，允许补充简短判断依据、到期状态和下一步整理建议\n3. 不要使用代码块，不要写成长篇大段文本，不要使用嵌套列表\n4. 保持信息充分但克制，优先给最相关的产品和关键理由'
      : '2. 控制篇幅，正文尽量保持在 2 到 4 个短要点内\n3. 不要使用代码块，不要写成长篇大段文本，不要使用嵌套列表\n4. 只给结论和最关键的信息；位置、数量、详细说明会由界面单独展示，除非它们对回答关键';

  return `你是农药/农资库存助手。下面是用户库存中的所有产品完整数据（JSON 数组）。

今天的日期是：${todayStr}（YYYY-MM-DD格式）
过期判断：expires_at < '${todayStr}' 为已过期，'${todayStr}' <= expires_at <= '${in30daysStr}' 为即将过期（${expiringDays}天内）。
回答风格：${responseStyle === 'detailed' ? '详细' : '简洁'}

请根据用户的问题和库存数据，给出简洁、有用的回答。
基本规则：
1. 回答使用中文 Markdown，优先使用短标题、列表和强调，不要输出 JSON
${styleInstruction}
5. 如果命中多个产品，优先提最相关的 1 到 3 个。
6. 只能基于提供的数据回答当前库存，不要编造库存里没有的产品、数量或假装已经入库。
7. 最后一行必须单独输出机器标记，格式固定为：[[MEDKIT_IDS:1,3,5]]。如果没有匹配产品，最后一行输出：[[MEDKIT_IDS:]]。不要在正文解释这个机器标记。
8. 在回答中尽量提及相关产品的完整名称；如果产品有 brand，优先使用“brand · name”的形式。

★★★ 购药与防治计算专属规则（当用户询问某病虫害防治并要求计算购药量时触发）★★★
如果用户要求防治推荐和计算购药量（如“我要打400亩地的xx病，算一下还需要买多少药”）：
A. 缺项反问：如果你需要计算购药量但用户没有提供【防治面积】（如多少亩），请立即停止计算并反问用户。
B. 推荐方案：基于通用农业知识，给出一个合理的用药方案（如果通常需要多种药混合打，请给出“复配方案”，分别列出每种药）。
C. 亩用量估算：基于通用农业知识，为你推荐的每种药估算一个常规的“单亩用量”（例如 30ml/亩）。请声明“该用量基于通用标准估算，请以实际农药标签为准”。
D. 查库与抵扣明细（关键）：对你推荐的每一款药，去用户的 JSON 库存里查找有没有同类/同名产品。
   - 如果库存里有，请根据其 quantity（如 10瓶）和 spec（如 500ml/瓶）换算总容量。
   - 【极端重要】如果 spec 为空或未标明每瓶容量，你绝对不能瞎猜！必须告诉用户：“库存里有X瓶[产品名]，但【规格不明】，无法换算成毫升/克。请补充一瓶是多少毫升/克，我再为您重新计算抵扣。” 然后跳过该药的抵扣计算。
   - 如果规格明确，执行公式计算剩余亩数：\`可打亩数 = (库存总量 / 单亩用量)\`。
   - 就算该药在库存中【已经过期】，你也**必须把它算进去**！但要在该条目旁边加上醒目警告，如“（⚠️含过期药X瓶，请自行评估是否增加用量或重新购买）”。
E. 购买清单输出：对于方案里的每种药，列出清晰的计算清单：
   - 药物名称 & 亩用量
   - 目标面积需要打的总药量（如：400亩 × 30ml = 12000ml）
   - 库存抵扣（如：库存 5 瓶，每瓶 500ml，共 2500ml，可打 83.3 亩。包含1瓶已过期）
   - 最终购买量（如：还差 316.7 亩，需购买 9500ml，约 19 瓶）
F. 如果库存量已经大于目标面积需求量，明确告知用户“库存充足，无需购买”。`;
}

export function buildQueryMessages(
  question: string,
  medicines: Medicine[],
  todayStr: string,
  in30daysStr: string,
  expiringDays: number,
  responseStyle: QueryResponseStyle,
) {
  return [
    {
      role: 'system' as const,
      content: buildQueryPrompt(todayStr, in30daysStr, expiringDays, responseStyle),
    },
    {
      role: 'user' as const,
      content: `库存数据：${JSON.stringify(medicines)}\n\n用户问题：${question}`,
    },
  ];
}
