import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RefundBanner } from '../../components/RefundBanner.jsx';

const pendingOrders = [
  { id: 'abc123def456', total_price: '55.00', refund_status: 'PENDING' },
];

describe('RefundBanner', () => {
  beforeEach(() => { global.fetch = vi.fn(); });

  it('renders nothing when there are no pending refunds', () => {
    const { container } = render(<RefundBanner orders={[]} onUpdate={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows order info and Accept/Reject buttons for each pending refund', () => {
    render(<RefundBanner orders={pendingOrders} onUpdate={() => {}} />);
    expect(screen.getByText(/def456/i)).toBeInTheDocument();
    expect(screen.getByText(/55\.00/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
  });

  it('calls acceptRefund endpoint and onUpdate when Accept is clicked', async () => {
    const onUpdate = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

    render(<RefundBanner orders={pendingOrders} onUpdate={onUpdate} />);
    await userEvent.click(screen.getByRole('button', { name: /accept/i }));

    expect(fetch).toHaveBeenCalledWith('/api/orders/abc123def456/acceptRefund', { method: 'POST' });
    expect(onUpdate).toHaveBeenCalled();
  });

  it('calls rejectRefund endpoint and onUpdate when Reject is clicked', async () => {
    const onUpdate = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

    render(<RefundBanner orders={pendingOrders} onUpdate={onUpdate} />);
    await userEvent.click(screen.getByRole('button', { name: /reject/i }));

    expect(fetch).toHaveBeenCalledWith('/api/orders/abc123def456/rejectRefund', { method: 'POST' });
    expect(onUpdate).toHaveBeenCalled();
  });

  it('shows error message when action fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Refund already processed' }),
    });

    render(<RefundBanner orders={pendingOrders} onUpdate={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /accept/i }));

    expect(screen.getByText(/Refund already processed/)).toBeInTheDocument();
  });
});
