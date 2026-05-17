import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as api from '../lib/api';
import type { Settings } from '../types';
import { AddModal } from './AddModal';

vi.mock('../lib/api', () => ({
  completeMedicineDraft: vi.fn(),
  getCategories: vi.fn(),
  parseMedicineBatchStream: vi.fn(),
  parseMedicineImageStream: vi.fn(),
  parseMedicineStream: vi.fn(),
}));

const settings: Settings = {
  aiBaseUrl: '',
  aiApiKey: '',
  aiModel: '',
  defaultHomeTab: 'ai',
  defaultListView: 'grid',
  expiringDays: 30,
  aiResponseStyle: 'concise',
  themePreference: 'system',
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('AddModal', () => {
  it('enables manual submit once a product name is entered', async () => {
    vi.mocked(api.getCategories).mockResolvedValue(['杀菌剂']);

    const onCreate = vi.fn().mockResolvedValue(undefined);
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <AddModal
        open
        onClose={onClose}
        settings={settings}
        onCreate={onCreate}
        onUpdate={onUpdate}
      />,
    );

    await waitFor(() => expect(api.getCategories).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: '直接手动填写' }));

    const submitButton = screen.getByRole('button', { name: '确认添加' });
    expect(submitButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('产品名称 / 有效成分'), {
      target: { value: '噻呋酰胺·戊唑醇' },
    });

    expect(submitButton).toBeEnabled();

    fireEvent.click(submitButton);

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '噻呋酰胺·戊唑醇',
        }),
      ),
    );
  });

  it('submits the selected category from the custom select', async () => {
    vi.mocked(api.getCategories).mockResolvedValue(['杀菌剂', '杀虫剂']);

    const onCreate = vi.fn().mockResolvedValue(undefined);
    const onUpdate = vi.fn().mockResolvedValue(undefined);

    render(
      <AddModal
        open
        onClose={vi.fn()}
        settings={settings}
        onCreate={onCreate}
        onUpdate={onUpdate}
      />,
    );

    await waitFor(() => expect(api.getCategories).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: '直接手动填写' }));

    fireEvent.click(screen.getByRole('button', { name: '分类' }));
    fireEvent.click(screen.getByRole('option', { name: '杀虫剂' }));

    fireEvent.change(screen.getByLabelText('产品名称 / 有效成分'), {
      target: { value: '噻虫胺' },
    });

    fireEvent.click(screen.getByRole('button', { name: '确认添加' }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '噻虫胺',
          category: '杀虫剂',
        }),
      ),
    );
  });
});
