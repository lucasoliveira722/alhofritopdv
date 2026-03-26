import { OrderCard } from './OrderCard.jsx';

export function OrderColumn({ title, orders, onUpdate }) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: '0 0.5rem' }}>
      <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>
        {title} ({orders.length})
      </h2>
      <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 8rem)' }}>
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} onUpdate={onUpdate} />
        ))}
      </div>
    </div>
  );
}
