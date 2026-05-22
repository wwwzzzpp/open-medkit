import { Hono } from 'hono';

import type { AiEnv } from '../middleware/apiKey';
import { apiKeyMiddleware } from '../middleware/apiKey';
import { buildChatCompletionsUrl, callAiJson, callAiText } from '../ai/client';
import { isRecord, parseAiJsonResponse } from '../ai/json-utils';
import {
  type Medicine,
  type MedicineRecord,
  getAllMedicines,
  getDateBoundaries,
  getDynamicCategories,
  normalizeExpiringDays,
  normalizeMedicineDraftPayload,
  normalizeQueryResponseStyle,
  rowToMedicine,
  validateImageDataUrl,
} from '../ai/medicine';
import {
  formatStockQuantity,
  parseInventoryAdjustmentIntent,
  parseStockQuantity,
} from '../ai/inventory-actions';
import { completeMedicineDraft, parseMedicineImage, parseMedicineText } from '../ai/parse';
import {
  buildBatchParsePrompt,
  buildImageParseMessages,
  buildParsePrompt,
  buildQueryMessages,
} from '../ai/prompts';
import {
  buildEmptyBoxAnswer,
  buildInventoryAnswer,
  getSafeQueryStreamChunk,
  isInventoryQuestion,
  resolveQueryResult,
  stripQueryMetadata,
} from '../ai/query';
import { createSseProxyResponse } from '../ai/stream';
import type { ChatMessage } from '../ai/types';
import { getDb } from '../db/client';
import { recordInventoryTransaction } from '../services/inventory-transactions';

export const aiRouter = new Hono<AiEnv>();

interface InventoryBatchRecord {
  id: number;
  batch_no: string | null;
  quantity: string | null;
  expires_at: string | null;
}

function formatMedicineName(medicine: Medicine) {
  return medicine.brand && medicine.brand !== medicine.name
    ? `${medicine.brand} · ${medicine.name}`
    : medicine.name;
}

function formatTransactionDelta(amount: number, unit: string) {
  if (amount > 0) {
    return `+${formatStockQuantity(amount, unit)}`;
  }

  return formatStockQuantity(amount, unit);
}

function loadBatchesForDeduction(medicineId: number) {
  const db = getDb();
  return db
    .prepare(
      `
        SELECT id, batch_no, quantity, expires_at
        FROM inventory_batches
        WHERE medicine_id = ?
        ORDER BY
          CASE WHEN expires_at IS NULL OR expires_at = '' THEN 1 ELSE 0 END ASC,
          expires_at ASC,
          id ASC
      `,
    )
    .all(medicineId) as InventoryBatchRecord[];
}

function buildBatchDeductions(
  batches: InventoryBatchRecord[],
  requestedAmount: number,
  unit: string,
) {
  if (batches.length === 0) {
    return { deductions: [] as Array<{ batch: InventoryBatchRecord; before: string; after: string; amount: number }> };
  }

  let remaining = requestedAmount;
  const deductions: Array<{ batch: InventoryBatchRecord; before: string; after: string; amount: number }> = [];

  for (const batch of batches) {
    if (remaining <= 0) {
      break;
    }

    const parsed = parseStockQuantity(batch.quantity || '');

    if (!parsed) {
      continue;
    }

    const batchUnit = parsed.unit.trim();

    if (unit && batchUnit && unit !== batchUnit) {
      return {
        error: `批次「${batch.batch_no || batch.id}」的单位是「${batchUnit}」，当前扣减单位是「${unit}」。为了避免批次账不一致，暂时没有更新库存。`,
      };
    }

    if (parsed.amount <= 0) {
      continue;
    }

    const deductAmount = Math.min(parsed.amount, remaining);
    const nextAmount = parsed.amount - deductAmount;
    const resolvedUnit = batchUnit || unit;

    deductions.push({
      batch,
      before: formatStockQuantity(parsed.amount, resolvedUnit),
      after: formatStockQuantity(nextAmount, resolvedUnit),
      amount: deductAmount,
    });
    remaining -= deductAmount;
  }

  if (remaining > 0) {
    return {
      error: `该产品已经建立批次，但可扣减批次数量不足，还差 ${formatStockQuantity(remaining, unit)}。暂时没有更新库存。`,
    };
  }

  return { deductions };
}

function applyInventoryAdjustment(question: string, medicines: Medicine[]) {
  const intent = parseInventoryAdjustmentIntent(question, medicines);

  if (!intent) {
    return null;
  }

  if ('error' in intent) {
    return {
      answer: intent.error,
      medicines: [],
      inventoryChanged: false,
    };
  }

  const current = parseStockQuantity(intent.medicine.quantity || '');

  if (!current) {
    return {
      answer: `我找到了 **${formatMedicineName(intent.medicine)}**，但当前库存数量「${intent.medicine.quantity || '未填写'}」无法自动计算。请先把库存填成类似「15瓶」这样的格式。`,
      medicines: [intent.medicine],
      inventoryChanged: false,
    };
  }

  const requestedUnit = intent.unit.trim();
  const unit = current.unit || requestedUnit;

  if (requestedUnit && current.unit && requestedUnit !== current.unit) {
    return {
      answer: `我找到了 **${formatMedicineName(intent.medicine)}**，但当前单位是「${current.unit}」，你这次写的是「${requestedUnit}」。为了避免扣错，暂时没有更新库存。`,
      medicines: [intent.medicine],
      inventoryChanged: false,
    };
  }

  const nextAmount =
    intent.operation === 'set' ? intent.amount : current.amount - intent.amount;
  const deltaAmount = nextAmount - current.amount;

  if (intent.operation === 'decrease' && nextAmount < 0) {
    return {
      answer: `库存不足，暂时没有更新。**${formatMedicineName(intent.medicine)}** 当前只有 ${formatStockQuantity(current.amount, unit)}，不能减掉 ${formatStockQuantity(intent.amount, unit)}。`,
      medicines: [intent.medicine],
      inventoryChanged: false,
    };
  }

  if (intent.operation === 'set' && deltaAmount === 0) {
    return {
      answer: `**${formatMedicineName(intent.medicine)}** 当前库存已经是 ${formatStockQuantity(current.amount, unit)}，不需要修改。`,
      medicines: [intent.medicine],
      inventoryChanged: false,
    };
  }

  const nextQuantity = formatStockQuantity(nextAmount, unit);
  const db = getDb();
  const batches = loadBatchesForDeduction(intent.medicine.id);
  let batchPlan = {
    deductions: [] as Array<{ batch: InventoryBatchRecord; before: string; after: string; amount: number }>,
  };

  if (intent.operation === 'decrease' || deltaAmount < 0) {
    const plannedDeductions = buildBatchDeductions(
      batches,
      Math.abs(deltaAmount),
      unit,
    );

    if ('error' in plannedDeductions) {
      return {
        answer: plannedDeductions.error,
        medicines: [intent.medicine],
        inventoryChanged: false,
      };
    }

    batchPlan = plannedDeductions;
  } else if (intent.operation === 'set' && deltaAmount > 0 && batches.length > 0) {
    return {
      answer: `**${formatMedicineName(intent.medicine)}** 已经建立批次，增加总库存需要指定入库批次。请在批次库存里新增入库，或先说清楚要加到哪个批次。`,
      medicines: [intent.medicine],
      inventoryChanged: false,
    };
  }

  const updateProductAndBatches = db.transaction(() => {
    db.prepare('UPDATE medicines SET quantity = ? WHERE id = ?').run(nextQuantity, intent.medicine.id);

    batchPlan.deductions.forEach((deduction) => {
      db.prepare('UPDATE inventory_batches SET quantity = ? WHERE id = ?').run(
        deduction.after,
        deduction.batch.id,
      );
    });
  });

  updateProductAndBatches();

  const updatedRow = db
    .prepare('SELECT * FROM medicines WHERE id = ?')
    .get(intent.medicine.id) as MedicineRecord;
  const updatedMedicine = rowToMedicine(updatedRow);
  const spec = updatedMedicine.spec ? `（${updatedMedicine.spec}）` : '';
  const batchLabel = intent.operation === 'set' ? '批次同步' : '批次扣减';
  const batchNote = batchPlan.deductions.length
    ? `${batchLabel}：${batchPlan.deductions
        .map((deduction) =>
          `${deduction.batch.batch_no || `#${deduction.batch.id}`} ${deduction.before}→${deduction.after}`,
        )
        .join('；')}`
    : '';

  recordInventoryTransaction(db, {
    medicineId: updatedMedicine.id,
    medicineName: formatMedicineName(updatedMedicine),
    actionType: intent.operation === 'set' ? 'adjustment' : 'stock_out',
    quantityBefore: formatStockQuantity(current.amount, unit),
    quantityAfter: nextQuantity,
    quantityDelta: formatTransactionDelta(deltaAmount, unit),
    source: 'ai',
    reason:
      intent.operation === 'set'
        ? batchPlan.deductions.length
          ? 'AI 库存修正（近效期批次优先同步）'
          : 'AI 库存修正'
        : batchPlan.deductions.length
          ? 'AI 库存扣减（近效期批次优先）'
          : 'AI 库存扣减',
    note: [question, batchNote].filter(Boolean).join('\n'),
  });

  return {
    answer: `好的，已更新库存。\n\n**${formatMedicineName(updatedMedicine)}**${spec}：原来 ${formatStockQuantity(current.amount, unit)}，现在 ${nextQuantity}。${batchNote ? `\n\n${batchNote}` : ''}`,
    medicines: [updatedMedicine],
    inventoryChanged: true,
  };
}

aiRouter.get('/config-status', (c) => {
  const hasServerAiConfig =
    typeof process.env.AI_API_KEY === 'string' && process.env.AI_API_KEY.trim().length > 0;

  return c.json({
    data: {
      hasServerAiConfig,
      defaultBaseUrl: process.env.AI_BASE_URL || 'https://api.openai.com',
      defaultModel: process.env.AI_MODEL || 'gpt-4o-mini',
    },
  });
});

aiRouter.use('*', apiKeyMiddleware);

// ---------------------------------------------------------------------------
// Parse — non-streaming
// ---------------------------------------------------------------------------

aiRouter.post('/parse', async (c) => {
  try {
    const body = await c.req.json();
    const text = typeof body?.text === 'string' ? body.text.trim() : '';

    if (!text) {
      return c.json({ error: 'Text is required' }, 400);
    }

    const result = await parseMedicineText(c, text);

    if ('error' in result) {
      return c.json({ error: result.error, raw: result.raw }, 422);
    }

    return c.json({ data: result.data });
  } catch (error) {
    return c.json(
      {
        error: 'AI service error',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      502,
    );
  }
});

// ---------------------------------------------------------------------------
// Parse — streaming
// ---------------------------------------------------------------------------

aiRouter.post('/parse-stream', async (c) => {
  try {
    const body = await c.req.json();
    const text = typeof body?.text === 'string' ? body.text.trim() : '';

    if (!text) {
      return c.json({ error: 'Text is required' }, 400);
    }

    const categories = await getDynamicCategories();

    return createSseProxyResponse({
      c,
      messages: [
        { role: 'system', content: buildParsePrompt(categories) },
        { role: 'user', content: text },
      ],
      resolve: (accumulated) => {
        const parsed = parseAiJsonResponse<Record<string, unknown> | null>(accumulated);
        return isRecord(parsed) ? normalizeMedicineDraftPayload(parsed) : null;
      },
      buildDoneEvent: (medicine) => ({ type: 'done', medicine }),
      fallback: async () => {
        const result = await parseMedicineText(c, text);
        if ('error' in result) return { type: 'error', message: result.error };
        return { type: 'done', medicine: result.data };
      },
    });
  } catch (error) {
    return c.json(
      {
        error: 'AI service error',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      502,
    );
  }
});

// ---------------------------------------------------------------------------
// Parse image — non-streaming
// ---------------------------------------------------------------------------

aiRouter.post('/parse-image', async (c) => {
  try {
    const body = await c.req.json();
    const validated = validateImageDataUrl(body?.image);

    if (!validated) {
      return c.json({ error: 'A valid image data URL is required (data:image/...;base64,...)' }, 400);
    }

    const result = await parseMedicineImage(c, validated.dataUrl);

    if ('error' in result) {
      return c.json({ error: result.error, raw: result.raw }, 422);
    }

    return c.json({ data: result.data });
  } catch (error) {
    return c.json(
      {
        error: 'AI service error',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      502,
    );
  }
});

// ---------------------------------------------------------------------------
// Parse image — streaming
// ---------------------------------------------------------------------------

aiRouter.post('/parse-image-stream', async (c) => {
  try {
    const body = await c.req.json();
    const validated = validateImageDataUrl(body?.image);

    if (!validated) {
      return c.json({ error: 'A valid image data URL is required (data:image/...;base64,...)' }, 400);
    }

    const categories = await getDynamicCategories();

    return createSseProxyResponse({
      c,
      messages: buildImageParseMessages(categories, validated.dataUrl),
      resolve: (accumulated) => {
        const parsed = parseAiJsonResponse<Record<string, unknown> | null>(accumulated);
        return isRecord(parsed) ? normalizeMedicineDraftPayload(parsed) : null;
      },
      buildDoneEvent: (medicine) => ({ type: 'done', medicine }),
      fallback: async () => {
        const result = await parseMedicineImage(c, validated.dataUrl);
        if ('error' in result) return { type: 'error', message: result.error };
        return { type: 'done', medicine: result.data };
      },
    });
  } catch (error) {
    return c.json(
      {
        error: 'AI service error',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      502,
    );
  }
});

// ---------------------------------------------------------------------------
// Parse batch — non-streaming
// ---------------------------------------------------------------------------

aiRouter.post('/parse-batch', async (c) => {
  try {
    const body = await c.req.json();
    const text: string = typeof body?.text === 'string' ? body.text : '';
    const items: string[] = text
      .split('\n')
      .map((item: string) => item.trim())
      .filter(Boolean);

    if (items.length === 0) {
      return c.json({ error: 'Text is required' }, 400);
    }

    if (items.length > 20) {
      return c.json({ error: 'Too many items, max 20' }, 400);
    }

    const settled = await Promise.allSettled(
      items.map((item: string) => parseMedicineText(c, item)),
    );

    const results = settled.map((result, index) => {
      if (result.status === 'fulfilled') {
        if ('error' in result.value) {
          return {
            index,
            success: false,
            error: result.value.error,
            raw: result.value.raw,
          };
        }

        return {
          index,
          success: true,
          medicine: result.value.data,
        };
      }

      return {
        index,
        success: false,
        error: 'AI service error',
        raw: result.reason instanceof Error ? result.reason.message : String(result.reason),
      };
    });

    return c.json({ data: { results } });
  } catch (error) {
    return c.json(
      {
        error: 'AI service error',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      502,
    );
  }
});

// ---------------------------------------------------------------------------
// Parse batch — streaming
// ---------------------------------------------------------------------------

aiRouter.post('/parse-batch-stream', async (c) => {
  try {
    const body = await c.req.json();
    const text: string = typeof body?.text === 'string' ? body.text : '';
    const items: string[] = text
      .split('\n')
      .map((item: string) => item.trim())
      .filter(Boolean);

    if (items.length === 0) {
      return c.json({ error: 'Text is required' }, 400);
    }

    if (items.length > 20) {
      return c.json({ error: 'Too many items, max 20' }, 400);
    }

    const categories = await getDynamicCategories();

    const buildResults = (arr: unknown[]) =>
      items.map((raw, index) => {
        const entry = arr[index];
        if (isRecord(entry)) {
          return { index, success: true, medicine: normalizeMedicineDraftPayload(entry), raw };
        }
        return { index, success: false, error: 'AI returned invalid format', raw };
      });

    return createSseProxyResponse({
      c,
      messages: [
        { role: 'system', content: buildBatchParsePrompt(categories, items.length) },
        { role: 'user', content: items.map((item, i) => `${i + 1}. ${item}`).join('\n') },
      ],
      resolve: (accumulated) => {
        const parsed = parseAiJsonResponse<unknown>(accumulated);

        // Primary path: prompt requests { "medicines": [...] }
        if (isRecord(parsed) && Array.isArray(parsed.medicines)) {
          return buildResults(parsed.medicines);
        }

        // Backward-compat: bare array or array under any key
        if (Array.isArray(parsed)) {
          return buildResults(parsed);
        }

        if (isRecord(parsed)) {
          const arrCandidate = Object.values(parsed).find(Array.isArray);
          if (Array.isArray(arrCandidate)) {
            return buildResults(arrCandidate);
          }
        }

        return null;
      },
      buildDoneEvent: (results) => ({ type: 'done', results }),
      fallback: async () => {
        const settled = await Promise.allSettled(
          items.map((item: string) => parseMedicineText(c, item)),
        );

        const results = settled.map((result, index) => {
          if (result.status === 'fulfilled') {
            if ('error' in result.value) {
              return { index, success: false, error: result.value.error, raw: items[index] };
            }
            return { index, success: true, medicine: result.value.data, raw: items[index] };
          }
          return {
            index,
            success: false,
            error: result.reason instanceof Error ? result.reason.message : 'AI service error',
            raw: items[index],
          };
        });

        return { type: 'done', results };
      },
    });
  } catch (error) {
    return c.json(
      {
        error: 'AI service error',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      502,
    );
  }
});

// ---------------------------------------------------------------------------
// Draft completion
// ---------------------------------------------------------------------------

aiRouter.post('/complete', async (c) => {
  try {
    const body = await c.req.json();
    const draft = isRecord(body?.draft) ? body.draft : {};
    const sourceText = typeof body?.sourceText === 'string' ? body.sourceText.trim() : '';
    const hasDraftContent = Object.values(draft).some(
      (value) => typeof value === 'string' && value.trim().length > 0,
    );

    if (!hasDraftContent && !sourceText) {
      return c.json({ error: 'Draft is required' }, 400);
    }

    const result = await completeMedicineDraft(c, draft, sourceText);

    if ('error' in result) {
      return c.json({ error: result.error, raw: result.raw }, 422);
    }

    return c.json({ data: result.data });
  } catch (error) {
    return c.json(
      {
        error: 'AI service error',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      502,
    );
  }
});

// ---------------------------------------------------------------------------
// Query — streaming
// ---------------------------------------------------------------------------

aiRouter.post('/query-stream', async (c) => {
  try {
    const body = await c.req.json();
    const question = typeof body?.question === 'string' ? body.question.trim() : '';
    const expiringDays = normalizeExpiringDays(body?.expiringDays);
    const responseStyle = normalizeQueryResponseStyle(body?.responseStyle);

    if (!question) {
      return c.json({ error: 'Question is required' }, 400);
    }

    const medicines = getAllMedicines();
    const { todayStr, in30daysStr } = getDateBoundaries(expiringDays);
    const encoder = new TextEncoder();

    const immediateResponse = (
      answer: string,
      matchedMedicines: Medicine[],
      inventoryChanged = false,
    ) => {
      const sseStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'text', content: answer })}\n\n`),
          );
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'done', answer, medicines: matchedMedicines, inventoryChanged })}\n\n`,
            ),
          );
          controller.close();
        },
      });

      return new Response(sseStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    };

    if (medicines.length === 0) {
      return immediateResponse(buildEmptyBoxAnswer(responseStyle), []);
    }

    const inventoryAdjustment = applyInventoryAdjustment(question, medicines);

    if (inventoryAdjustment) {
      return immediateResponse(
        inventoryAdjustment.answer,
        inventoryAdjustment.medicines,
        inventoryAdjustment.inventoryChanged,
      );
    }

    if (isInventoryQuestion(question)) {
      return immediateResponse(
        buildInventoryAnswer(medicines, todayStr, in30daysStr, expiringDays, responseStyle),
        medicines,
      );
    }

    const aiApiKey = c.get('aiApiKey');
    const aiBaseUrl = c.get('aiBaseUrl');
    const aiModel = c.get('aiModel');

    const upstreamResponse = await fetch(buildChatCompletionsUrl(aiBaseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiApiKey}`,
      },
      body: JSON.stringify({
        model: aiModel,
        messages: buildQueryMessages(question, medicines, todayStr, in30daysStr, expiringDays, responseStyle),
        stream: true,
      }),
    });

    if (!upstreamResponse.ok) {
      let detail = `AI request failed with status ${upstreamResponse.status}`;
      try {
        const errText = await upstreamResponse.text();
        const errJson = JSON.parse(errText) as { error?: { message?: string } };
        detail = errJson.error?.message || detail;
      } catch {}
      return c.json({ error: 'AI service error', detail }, 502);
    }

    if (!upstreamResponse.body) {
      return c.json({ error: 'AI service error', detail: 'No response body' }, 502);
    }

    const decoder = new TextDecoder();
    const sseStream = new ReadableStream({
      async start(controller) {
        let accumulated = '';
        let pendingText = '';
        let buffer = '';
        const reader = (upstreamResponse.body as ReadableStream<Uint8Array>).getReader();
        const sendEvent = (payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };
        const appendContent = (content: string) => {
          accumulated += content;
          pendingText += content;

          const visibleText = getSafeQueryStreamChunk(pendingText);
          if (visibleText) {
            sendEvent({ type: 'text', content: visibleText });
            pendingText = pendingText.slice(visibleText.length);
          }
        };

        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data:')) continue;
              const payload = trimmed.slice(trimmed.indexOf(':') + 1).trim();
              if (payload === '[DONE]') continue;

              try {
                const chunk = JSON.parse(payload) as {
                  choices?: Array<{ delta?: { content?: string } }>;
                };
                const content = chunk.choices?.[0]?.delta?.content;
                if (typeof content === 'string' && content) {
                  appendContent(content);
                }
              } catch {}
            }
          }

          if (buffer.trim()) {
            const trimmed = buffer.trim();
            if (trimmed.startsWith('data:')) {
              const payload = trimmed.slice(trimmed.indexOf(':') + 1).trim();
              if (payload !== '[DONE]') {
                try {
                  const chunk = JSON.parse(payload) as {
                    choices?: Array<{ delta?: { content?: string } }>;
                  };
                  const content = chunk.choices?.[0]?.delta?.content;
                  if (typeof content === 'string' && content) {
                    appendContent(content);
                  }
                } catch {}
              }
            }
          }

          const result = resolveQueryResult(
            accumulated,
            medicines,
            todayStr,
            in30daysStr,
            expiringDays,
            responseStyle,
          );

          if ('error' in result) {
            sendEvent({ type: 'error', message: result.error });
            return;
          }

          const remaining = stripQueryMetadata(pendingText);
          if (remaining) {
            sendEvent({ type: 'text', content: remaining });
          }

          sendEvent({
            type: 'done',
            answer: result.data.answer,
            medicines: result.data.medicines,
            inventoryChanged: false,
          });
        } catch (err) {
          sendEvent({
            type: 'error',
            message: err instanceof Error ? err.message : 'Stream error',
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(sseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return c.json(
      {
        error: 'AI service error',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      502,
    );
  }
});

// ---------------------------------------------------------------------------
// Query — non-streaming
// ---------------------------------------------------------------------------

aiRouter.post('/query', async (c) => {
  try {
    const body = await c.req.json();
    const question = typeof body?.question === 'string' ? body.question.trim() : '';
    const expiringDays = normalizeExpiringDays(body?.expiringDays);
    const responseStyle = normalizeQueryResponseStyle(body?.responseStyle);

    if (!question) {
      return c.json({ error: 'Question is required' }, 400);
    }

    const medicines = getAllMedicines();
    const { todayStr, in30daysStr } = getDateBoundaries(expiringDays);

    if (medicines.length === 0) {
      return c.json({
        data: {
          answer: buildEmptyBoxAnswer(responseStyle),
          medicines: [],
          inventoryChanged: false,
        },
      });
    }

    const inventoryAdjustment = applyInventoryAdjustment(question, medicines);

    if (inventoryAdjustment) {
      return c.json({
        data: inventoryAdjustment,
      });
    }

    if (isInventoryQuestion(question)) {
      return c.json({
        data: {
          answer: buildInventoryAnswer(medicines, todayStr, in30daysStr, expiringDays, responseStyle),
          medicines,
          inventoryChanged: false,
        },
      });
    }

    const raw = await callAiText(
      c,
      buildQueryMessages(question, medicines, todayStr, in30daysStr, expiringDays, responseStyle),
    );
    const result = resolveQueryResult(
      raw,
      medicines,
      todayStr,
      in30daysStr,
      expiringDays,
      responseStyle,
    );

    if ('error' in result) {
      return c.json({ error: result.error, raw: result.raw }, 422);
    }

    return c.json({
      data: {
        ...result.data,
        inventoryChanged: false,
      },
    });
  } catch (error) {
    return c.json(
      {
        error: 'AI service error',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      502,
    );
  }
});

// ---------------------------------------------------------------------------
// Test connection
// ---------------------------------------------------------------------------

aiRouter.post('/test', async (c) => {
  try {
    const { parsed, raw } = await callAiJson<{
      ok?: boolean;
      message?: string;
    } | null>(c, [
      {
        role: 'system',
        content: `你是一个 API 连通性测试助手。

请严格返回 JSON，不要包含任何额外文字：
{
  "ok": true,
  "message": "连接成功"
}`,
      },
      {
        role: 'user',
        content: '请测试当前 API Key、Base URL 和模型是否可以正常完成一次请求。',
      },
    ]);

    if (!parsed || typeof parsed !== 'object' || parsed.ok !== true) {
      return c.json({ error: 'AI returned invalid format', raw }, 422);
    }

    return c.json({
      data: {
        ok: true,
        message: typeof parsed.message === 'string' ? parsed.message : '连接成功',
        model: c.get('aiModel'),
        baseUrl: c.get('aiBaseUrl'),
      },
    });
  } catch (error) {
    return c.json(
      {
        error: 'AI service error',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      502,
    );
  }
});
