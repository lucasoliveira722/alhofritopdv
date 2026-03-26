import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub useSSE so it doesn't try to open a real EventSource
vi.mock('../hooks/useSSE.js', () => ({ useSSE: vi.fn() }));

describe('App', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 'ord-placed', status: 'PLACED', items: [], total_price: '10.00' },
      ],
    });
  });

  it('fetches orders on mount and renders the kanban board', async () => {
    const { default: App } = await import('../App.jsx');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Placed (1)')).toBeInTheDocument();
    });
  });
});
