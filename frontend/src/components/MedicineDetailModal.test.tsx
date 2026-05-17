import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MedicineDetailModal } from './MedicineDetailModal';
import { getInventoryTransactions } from '../lib/api';

vi.mock('../hooks/useTimezone', () => ({
  useTimezone: () => ({
    timezone: 'Asia/Shanghai',
  }),
}));

vi.mock('../lib/api', () => ({
  getInventoryTransactions: vi.fn().mockResolvedValue([]),
}));

const medicine = {
  id: 1,
  name: '噻呋酰胺·戊唑醇',
  name_en: '',
  spec: '32%悬浮剂，100g/瓶',
  quantity: '20瓶',
  expires_at: '2026-07-01',
  category: '杀菌剂',
  usage_desc: '小麦纹枯病',
  location: '农药库 A 架',
  notes: '',
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

afterEach(() => {
  vi.clearAllMocks();
  vi.mocked(getInventoryTransactions).mockResolvedValue([]);
});

describe('MedicineDetailModal', () => {
  it('uses the themed confirm dialog before deleting', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <MedicineDetailModal
        medicine={medicine}
        expiringDays={30}
        onClose={onClose}
        onEdit={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '删除产品' }));

    expect(
      screen.getByRole('alertdialog', { name: '确认删除「噻呋酰胺·戊唑醇」吗？' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '先保留' }));
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '删除产品' }));
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(medicine));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows an inline error when deletion fails', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('删除失败，请重试'));

    render(
      <MedicineDetailModal
        medicine={medicine}
        expiringDays={30}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '删除产品' }));
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(medicine));
    expect(await screen.findByText('删除失败，请重试')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows inventory transaction history', async () => {
    vi.mocked(getInventoryTransactions).mockResolvedValueOnce([
      {
        id: 1,
        medicine_id: 1,
        medicine_name: medicine.name,
        action_type: 'stock_out',
        quantity_before: '20瓶',
        quantity_after: '19瓶',
        quantity_delta: '-1瓶',
        source: 'ai',
        reason: 'AI 库存扣减',
        note: '库存减掉一',
        created_at: '2026-05-18 10:30:00',
      },
    ]);

    render(
      <MedicineDetailModal
        medicine={medicine}
        expiringDays={30}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(await screen.findByText('库存流水')).toBeInTheDocument();
    expect(await screen.findByText('-1瓶')).toBeInTheDocument();
    expect(screen.getByText('20瓶 → 19瓶')).toBeInTheDocument();
    expect(screen.getByText(/AI · AI 库存扣减/)).toBeInTheDocument();
  });
});
