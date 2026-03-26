import { useState } from 'react';

export function RefundBanner({ orders, onUpdate }) {
  const [loading, setLoading] = useState(null);
  const [errors, setErrors] = useState({});

  if (!orders.length) return null;

  async function doAction(orderId, type) {
    setLoading(`${orderId}:${type}`);
    try {
      const res = await fetch(`/api/orders/${orderId}/${type}`, { method: 'POST' });
      if (!res.ok) {
        let errorMsg = 'Action failed';
        try {
          const data = await res.json();
          errorMsg = data.error ?? errorMsg;
        } catch {
          // non-JSON error body — keep generic message
        }
        setErrors((prev) => ({ ...prev, [orderId]: errorMsg }));
      } else {
        setErrors((prev) => { const next = { ...prev }; delete next[orderId]; return next; });
        onUpdate();
      }
    } catch {
      setErrors((prev) => ({ ...prev, [orderId]: 'Network error' }));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ background: '#fff3cd', borderBottom: '2px solid #ffc107', padding: '0.75rem 1rem' }}>
      <strong>Pending Refund Requests</strong>
      {orders.map((order) => (
        <div key={order.id} style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.5rem' }}>
          <span>Order #{order.id.slice(-6)} — R$ {Number(order.total_price).toFixed(2)}</span>
          {errors[order.id] && <span style={{ color: 'red' }}>{errors[order.id]}</span>}
          <button
            onClick={() => doAction(order.id, 'acceptRefund')}
            disabled={loading === `${order.id}:acceptRefund` || loading === `${order.id}:rejectRefund`}
          >
            Accept
          </button>
          <button
            onClick={() => doAction(order.id, 'rejectRefund')}
            disabled={loading === `${order.id}:acceptRefund` || loading === `${order.id}:rejectRefund`}
          >
            Reject
          </button>
        </div>
      ))}
    </div>
  );
}
