import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderCard } from '../../components/OrderCard.jsx';

const baseOrder = {
  id: 'abc123def456',
  total_price: '42.50',
  items: [{ name: 'X-Burger', quantity: 1, notes: 'sem cebola' }],
};

describe('OrderCard', () => {
  it('renders order items and total', () => {
    render(<OrderCard order={{ ...baseOrder, status: 'PLACED' }} onUpdate={() => {}} />);
    expect(screen.getByText(/X-Burger/)).toBeInTheDocument();
    expect(screen.getByText(/sem cebola/)).toBeInTheDocument();
    expect(screen.getByText(/42\.50/)).toBeInTheDocument();
  });

  it('shows Confirm and Cancel for PLACED orders', () => {
    render(<OrderCard order={{ ...baseOrder, status: 'PLACED' }} onUpdate={() => {}} />);
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('shows Mark Ready and Cancel for CONFIRMED orders', () => {
    render(<OrderCard order={{ ...baseOrder, status: 'CONFIRMED' }} onUpdate={() => {}} />);
    expect(screen.getByRole('button', { name: /mark ready/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('shows no action buttons for READY orders', () => {
    render(<OrderCard order={{ ...baseOrder, status: 'READY' }} onUpdate={() => {}} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('calls the confirm API and then onUpdate on success', async () => {
    const onUpdate = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

    render(<OrderCard order={{ ...baseOrder, status: 'PLACED' }} onUpdate={onUpdate} />);
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(fetch).toHaveBeenCalledWith('/api/orders/abc123def456/confirm', { method: 'POST' });
    expect(onUpdate).toHaveBeenCalled();
  });

  it('shows an error message when the action fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Invalid transition' }),
    });

    render(<OrderCard order={{ ...baseOrder, status: 'PLACED' }} onUpdate={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(screen.getByText(/Invalid transition/)).toBeInTheDocument();
  });
});
