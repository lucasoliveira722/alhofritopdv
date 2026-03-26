import { useState, useEffect, useCallback } from 'react';
import { KanbanBoard } from './components/KanbanBoard.jsx';
import { RefundBanner } from './components/RefundBanner.jsx';
import { useSSE } from './hooks/useSSE.js';

export default function App() {
  const [orders, setOrders] = useState([]);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/orders');
      const data = await res.json();
      setOrders(data);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useSSE(
    '/api/events',
    (type, order) => {
      setOrders((prev) => {
        if (type === 'order:new') return [...prev, order];
        if (type === 'order:updated') return prev.map((o) => (o.id === order.id ? order : o));
        return prev;
      });
    },
    fetchOrders // called on SSE reconnect to fill any missed events
  );

  const activeOrders = orders.filter((o) =>
    ['PLACED', 'CONFIRMED', 'READY'].includes(o.status)
  );
  const refundPending = orders.filter((o) => o.refund_status === 'PENDING');

  return (
    <div>
      <header style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #ddd', fontWeight: 'bold' }}>
        PDV — Gestão de Pedidos
      </header>
      <RefundBanner orders={refundPending} onUpdate={fetchOrders} />
      <KanbanBoard orders={activeOrders} onUpdate={fetchOrders} />
    </div>
  );
}
