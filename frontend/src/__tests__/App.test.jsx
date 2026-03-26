import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../App.jsx';

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
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Placed (1)')).toBeInTheDocument();
    });
  });

  it('refetches orders when SSE reconnects', async () => {
    const { useSSE } = await import('../hooks/useSSE.js');

    render(<App />);

    // Wait for the initial fetch
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    // Simulate SSE reconnect by calling the onReconnect callback
    const onReconnect = useSSE.mock.calls[0][2];
    await onReconnect();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledWith('/api/orders');
  });
});
