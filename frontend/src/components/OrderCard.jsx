import { useState } from 'react';

export function OrderCard({ order, onUpdate }) {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(null);

  async function doAction(type) {
    setLoading(type);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/${type}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Action failed');
      } else {
        onUpdate();
      }
    } catch {
      setError('Network error — check your connection');
    } finally {
      setLoading(null);
    }
  }

  const items = Array.isArray(order.items) ? order.items.filter(Boolean) : [];

  return (
    <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: '0.75rem', marginBottom: '0.5rem' }}>
      <p style={{ margin: '0 0 0.25rem', fontWeight: 'bold', fontSize: '0.8rem', opacity: 0.6 }}>
        #{order.id.slice(-6)}
      </p>
      <ul style={{ margin: '0 0 0.5rem', padding: '0 0 0 1.1rem' }}>
        {items.map((item, i) => (
          <li key={i}>
            {item.quantity}× {item.name}
            {item.notes ? <span style={{ opacity: 0.6 }}> ({item.notes})</span> : null}
          </li>
        ))}
      </ul>
      <p style={{ margin: '0 0 0.5rem', fontWeight: 'bold' }}>
        R$ {Number(order.total_price).toFixed(2)}
      </p>
      {error && (
        <p style={{ color: 'red', margin: '0 0 0.5rem', fontSize: '0.85rem' }}>{error}</p>
      )}
      {order.status === 'PLACED' && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => doAction('confirm')} disabled={!!loading}>Confirm</button>
          <button onClick={() => doAction('cancel')}  disabled={!!loading}>Cancel</button>
        </div>
      )}
      {order.status === 'CONFIRMED' && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => doAction('ready')}  disabled={!!loading}>Mark Ready</button>
          <button onClick={() => doAction('cancel')} disabled={!!loading}>Cancel</button>
        </div>
      )}
    </div>
  );
}
