import { useEffect, useState } from 'react';
import { History, Layers3, Plus, Trash2, X } from 'lucide-react';

import {
  createInventoryBatch,
  deleteInventoryBatch,
  getInventoryBatches,
  getInventoryTransactions,
} from '../lib/api';
import { useTimezone } from '../hooks/useTimezone';
import {
  daysUntilExpiry,
  formatDate,
  formatMedicineDisplayName,
  getMedicineStatus,
  getStatusText,
} from '../lib/utils';
import type {
  InventoryActionType,
  InventoryBatch,
  InventoryTransaction,
  InventoryTransactionSource,
  Medicine,
} from '../types';
import { ConfirmDialog } from './ConfirmDialog';

interface MedicineDetailModalProps {
  medicine: Medicine | null;
  expiringDays: number;
  onClose: () => void;
  onEdit: (medicine: Medicine) => void;
  onDelete: (medicine: Medicine) => Promise<void>;
}

function getStatusClasses(status: ReturnType<typeof getMedicineStatus>) {
  if (status === 'expired') {
    return {
      dot: 'bg-status-danger',
      badge: 'bg-status-danger-bg text-status-danger',
      banner: 'border-status-danger/20 bg-status-danger-bg text-status-danger',
    };
  }

  if (status === 'expiring') {
    return {
      dot: 'bg-status-warn',
      badge: 'bg-status-warn-bg text-status-warn',
      banner: 'border-status-warn/20 bg-status-warn-bg text-status-warn',
    };
  }

  if (status === 'ok') {
    return {
      dot: 'bg-status-ok',
      badge: 'bg-status-ok-bg text-status-ok',
      banner: 'border-status-ok/20 bg-status-ok-bg text-status-ok',
    };
  }

  return {
    dot: 'bg-border',
    badge: 'bg-surface2 text-ink2',
    banner: 'border-border bg-surface2 text-ink2',
  };
}

function MetaCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="theme-panel rounded-[14px] border px-3.5 py-2.5">
      <div className="text-[11px] uppercase tracking-[0.08em] text-ink3">{label}</div>
      <div className="mt-1.5 text-[14px] leading-5 text-ink">{value}</div>
    </div>
  );
}

function Section({
  title,
  value,
}: {
  title: string;
  value?: string;
}) {
  return (
    <section className="theme-panel-soft rounded-[16px] border px-4 py-3.5">
      <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink3">{title}</div>
      <div className="mt-2 whitespace-pre-wrap text-[14px] leading-6 text-ink">
        {value?.trim() || '未填写'}
      </div>
    </section>
  );
}

function getTransactionTypeText(type: InventoryActionType) {
  const map: Record<InventoryActionType, string> = {
    create: '新增',
    stock_in: '入库',
    stock_out: '出库',
    adjustment: '调整',
    delete: '删除',
  };

  return map[type] || type;
}

function getTransactionSourceText(source: InventoryTransactionSource) {
  const map: Record<InventoryTransactionSource, string> = {
    manual: '手动',
    ai: 'AI',
    import: '导入',
  };

  return map[source] || source;
}

function formatTransactionTime(value: string) {
  return value.replace('T', ' ').slice(0, 16);
}

function InventoryTransactionList({
  transactions,
  loading,
}: {
  transactions: InventoryTransaction[];
  loading: boolean;
}) {
  return (
    <section className="theme-panel-soft rounded-[16px] border px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-ink3">
          <History className="h-4 w-4" strokeWidth={1.9} />
          <span>库存流水</span>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink3">
          最近 {transactions.length} 条
        </div>
      </div>

      <div className="mt-3 space-y-2.5">
        {loading ? (
          <div className="rounded-[12px] border border-border/50 bg-surface px-3 py-3 text-[13px] text-ink2">
            正在加载库存流水...
          </div>
        ) : transactions.length === 0 ? (
          <div className="rounded-[12px] border border-border/50 bg-surface px-3 py-3 text-[13px] text-ink2">
            暂无库存流水。
          </div>
        ) : (
          transactions.map((transaction) => (
            <div
              key={transaction.id}
              className="rounded-[12px] border border-border/50 bg-surface px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-surface2 px-2.5 py-1 text-[11px] font-medium text-ink2">
                    {getTransactionTypeText(transaction.action_type)}
                  </span>
                  {transaction.quantity_delta && (
                    <span className="font-mono text-[12px] font-semibold text-accent">
                      {transaction.quantity_delta}
                    </span>
                  )}
                </div>
                <span className="font-mono text-[10px] text-ink3">
                  {formatTransactionTime(transaction.created_at)}
                </span>
              </div>

              <div className="mt-2 text-[13px] text-ink">
                {(transaction.quantity_before || '未填写')} → {(transaction.quantity_after || '未填写')}
              </div>

              <div className="mt-1 text-[11px] leading-5 text-ink3">
                {getTransactionSourceText(transaction.source)}
                {transaction.reason ? ` · ${transaction.reason}` : ''}
                {transaction.note ? ` · ${transaction.note}` : ''}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

const emptyBatchForm = {
  batch_no: '',
  expires_at: '',
  quantity: '',
  supplier: '',
  location: '',
  notes: '',
};

function parseQuantityForSummary(value?: string) {
  const match = (value || '').trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*(.*)$/);

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);

  if (!Number.isFinite(amount)) {
    return null;
  }

  return {
    amount,
    unit: match[2].trim(),
  };
}

function buildBatchSummary(batches: InventoryBatch[]) {
  let unit = '';
  let total = 0;

  for (const batch of batches) {
    const parsed = parseQuantityForSummary(batch.quantity);

    if (!parsed) {
      continue;
    }

    if (!unit) {
      unit = parsed.unit;
    }

    if (unit !== parsed.unit) {
      return `${batches.length} 个批次`;
    }

    total += parsed.amount;
  }

  if (total > 0) {
    return `合计 ${Number(total.toFixed(3))}${unit}`;
  }

  return `${batches.length} 个批次`;
}

function BatchManagementSection({
  batches,
  loading,
  form,
  saving,
  error,
  onFormChange,
  onAddBatch,
  onDeleteBatch,
}: {
  batches: InventoryBatch[];
  loading: boolean;
  form: typeof emptyBatchForm;
  saving: boolean;
  error: string;
  onFormChange: (key: keyof typeof emptyBatchForm, value: string) => void;
  onAddBatch: () => void;
  onDeleteBatch: (batch: InventoryBatch) => void;
}) {
  return (
    <section className="theme-panel-soft rounded-[16px] border px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-ink3">
          <Layers3 className="h-4 w-4" strokeWidth={1.9} />
          <span>批次库存</span>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink3">
          {batches.length > 0 ? buildBatchSummary(batches) : '暂无批次'}
        </div>
      </div>

      <div className="mt-3 space-y-2.5">
        {loading ? (
          <div className="rounded-[12px] border border-border/50 bg-surface px-3 py-3 text-[13px] text-ink2">
            正在加载批次...
          </div>
        ) : batches.length === 0 ? (
          <div className="rounded-[12px] border border-border/50 bg-surface px-3 py-3 text-[13px] text-ink2">
            还没有批次记录。可以先补一条采购批次，后续出库会更容易追踪。
          </div>
        ) : (
          batches.map((batch) => (
            <div
              key={batch.id}
              className="rounded-[12px] border border-border/50 bg-surface px-3 py-2.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-ink">
                    {batch.batch_no || `批次 #${batch.id}`}
                  </div>
                  <div className="mt-1 text-[11px] leading-5 text-ink3">
                    {[batch.quantity, batch.expires_at ? `有效期 ${formatDate(batch.expires_at)}` : '', batch.location, batch.supplier]
                      .filter(Boolean)
                      .join(' · ') || '暂无附加信息'}
                  </div>
                  {batch.notes && (
                    <div className="mt-1 text-[11px] leading-5 text-ink2">{batch.notes}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteBatch(batch)}
                  aria-label={`删除批次 ${batch.batch_no || batch.id}`}
                  className="theme-icon-button rounded-full border p-2 transition-all duration-200 hover:text-status-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 rounded-[12px] border border-border/50 bg-surface px-3 py-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            value={form.batch_no}
            onChange={(event) => onFormChange('batch_no', event.target.value)}
            placeholder="批号 / 批次名"
            className="rounded-[10px] border border-border bg-surface2 px-3 py-2 text-[12px] text-ink outline-none focus:border-accent/60"
          />
          <input
            value={form.quantity}
            onChange={(event) => onFormChange('quantity', event.target.value)}
            placeholder="数量，如 10瓶"
            className="rounded-[10px] border border-border bg-surface2 px-3 py-2 text-[12px] text-ink outline-none focus:border-accent/60"
          />
          <input
            value={form.expires_at}
            onChange={(event) => onFormChange('expires_at', event.target.value)}
            placeholder="有效期 YYYY-MM-DD"
            className="rounded-[10px] border border-border bg-surface2 px-3 py-2 text-[12px] text-ink outline-none focus:border-accent/60"
          />
          <input
            value={form.location}
            onChange={(event) => onFormChange('location', event.target.value)}
            placeholder="位置"
            className="rounded-[10px] border border-border bg-surface2 px-3 py-2 text-[12px] text-ink outline-none focus:border-accent/60"
          />
          <input
            value={form.supplier}
            onChange={(event) => onFormChange('supplier', event.target.value)}
            placeholder="供应商"
            className="rounded-[10px] border border-border bg-surface2 px-3 py-2 text-[12px] text-ink outline-none focus:border-accent/60"
          />
          <input
            value={form.notes}
            onChange={(event) => onFormChange('notes', event.target.value)}
            placeholder="备注"
            className="rounded-[10px] border border-border bg-surface2 px-3 py-2 text-[12px] text-ink outline-none focus:border-accent/60"
          />
        </div>

        {error && <div className="mt-2 text-[12px] text-status-danger">{error}</div>}

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onAddBatch}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-[12px] font-medium text-white transition-all hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
            {saving ? '保存中...' : '新增批次'}
          </button>
        </div>
      </div>
    </section>
  );
}

export function MedicineDetailModal({
  medicine,
  expiringDays,
  onClose,
  onEdit,
  onDelete,
}: MedicineDetailModalProps) {
  const { timezone } = useTimezone();
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState('');
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchForm, setBatchForm] = useState(emptyBatchForm);
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchError, setBatchError] = useState('');

  useEffect(() => {
    if (!medicine) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !confirmOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [confirmOpen, medicine, onClose]);

  useEffect(() => {
    setDeleting(false);
    setConfirmOpen(false);
    setError('');
    setTransactions([]);
    setBatches([]);
    setBatchForm(emptyBatchForm);
    setBatchError('');
  }, [medicine?.id]);

  useEffect(() => {
    if (!medicine) {
      return;
    }

    let cancelled = false;
    setTransactionsLoading(true);

    void getInventoryTransactions(medicine.id)
      .then((items) => {
        if (!cancelled) {
          setTransactions(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTransactions([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTransactionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [medicine]);

  useEffect(() => {
    if (!medicine) {
      return;
    }

    let cancelled = false;
    setBatchesLoading(true);

    void getInventoryBatches(medicine.id)
      .then((items) => {
        if (!cancelled) {
          setBatches(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBatches([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBatchesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [medicine]);

  if (!medicine) {
    return null;
  }

  const status = getMedicineStatus(medicine.expires_at, timezone, expiringDays);
  const days = medicine.expires_at ? daysUntilExpiry(medicine.expires_at, timezone) : undefined;
  const styles = getStatusClasses(status);
  const displayName = formatMedicineDisplayName(medicine);

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    setError('');

    try {
      await onDelete(medicine);
      onClose();
    } catch (err) {
      setConfirmOpen(false);
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  const refreshDetailLists = async () => {
    const [nextBatches, nextTransactions] = await Promise.all([
      getInventoryBatches(medicine.id),
      getInventoryTransactions(medicine.id),
    ]);
    setBatches(nextBatches);
    setTransactions(nextTransactions);
  };

  const handleBatchFormChange = (key: keyof typeof emptyBatchForm, value: string) => {
    setBatchForm((current) => ({ ...current, [key]: value }));
  };

  const handleAddBatch = async () => {
    const hasContent = Object.values(batchForm).some((value) => value.trim().length > 0);

    if (!hasContent) {
      setBatchError('请至少填写一个批次字段。');
      return;
    }

    setBatchSaving(true);
    setBatchError('');

    try {
      await createInventoryBatch(medicine.id, batchForm);
      setBatchForm(emptyBatchForm);
      await refreshDetailLists();
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : '新增批次失败');
    } finally {
      setBatchSaving(false);
    }
  };

  const handleDeleteBatch = async (batch: InventoryBatch) => {
    setBatchError('');

    try {
      await deleteInventoryBatch(medicine.id, batch.id);
      await refreshDetailLists();
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : '删除批次失败');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="medicine-detail-title"
    >
      <div
        className="absolute inset-0 animate-overlayFade bg-overlay/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="theme-modal-shell relative z-10 flex max-h-[88vh] w-full max-w-[720px] flex-col overflow-hidden rounded-[22px] border animate-modalPop">
        <div className="flex items-start justify-between gap-3 border-b border-border/40 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2
                id="medicine-detail-title"
                className="text-[25px] font-semibold leading-tight text-ink"
              >
                {displayName}
              </h2>
              {medicine.category && (
                <span className="rounded-full bg-surface2 px-3 py-1 text-[11px] font-medium text-ink2">
                  {medicine.category}
                </span>
              )}
              <span className={`rounded-full px-3 py-1 text-[11px] font-medium ${styles.badge}`}>
                {getStatusText(status, days)}
              </span>
            </div>

            {(medicine.name_en || medicine.spec) && (
              <div className="mt-1.5 text-[13px] text-ink2">
                {[medicine.name_en, medicine.spec].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="关闭详情"
            className="theme-icon-button rounded-full border p-2 transition-all duration-200"
          >
            <X aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
          <div className={`rounded-[16px] border px-3.5 py-2.5 text-[13px] ${styles.banner}`}>
            {status === 'expired'
              ? '这款产品已经过期，建议优先隔离、核对标签并处理。'
              : status === 'expiring'
                ? `这款产品将在 ${typeof days === 'number' ? `${days} 天内` : '近期'} 到期，建议尽快留意。`
                : status === 'ok'
                  ? '当前状态良好，详细信息都整理在这里了。'
                  : '还没有填写有效期，建议补充完整信息。'}
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <MetaCard label="商品名 / 品牌" value={medicine.brand || '未填写'} />
            <MetaCard label="规格" value={medicine.spec || '未填写'} />
            <MetaCard label="有效期" value={formatDate(medicine.expires_at)} />
            <MetaCard label="库存数量" value={medicine.quantity || '未填写'} />
            <MetaCard label="存放位置" value={medicine.location || '未填写'} />
          </div>

          <Section title="防治对象 / 用途" value={medicine.usage_desc} />
          <Section title="备注" value={medicine.notes} />
          <BatchManagementSection
            batches={batches}
            loading={batchesLoading}
            form={batchForm}
            saving={batchSaving}
            error={batchError}
            onFormChange={handleBatchFormChange}
            onAddBatch={handleAddBatch}
            onDeleteBatch={handleDeleteBatch}
          />
          <InventoryTransactionList
            transactions={transactions}
            loading={transactionsLoading}
          />
        </div>

        <div className="border-t border-border/40 bg-surface/70 px-5 py-3.5">
          {error && <div className="mb-2.5 text-sm text-status-danger">{error}</div>}

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => onEdit(medicine)}
              className="theme-button-secondary rounded-lg border px-4 py-2 text-[13px] font-medium transition-all"
            >
              编辑产品
            </button>

            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={deleting}
              className="rounded-lg border border-status-danger/25 bg-status-danger-bg/55 px-4 py-2 text-[13px] font-medium text-status-danger transition-all hover:bg-status-danger-bg/75 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? '删除中...' : '删除产品'}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={`确认删除「${displayName}」吗？`}
        description="删除后这条库存记录会从当前库存中移除，相关到期提醒和查询结果也不会再显示。"
        confirmLabel="确认删除"
        cancelLabel="先保留"
        tone="danger"
        loading={deleting}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
