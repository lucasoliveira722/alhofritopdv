import { OrderColumn } from './OrderColumn.jsx';

export function KanbanBoard({ orders, onUpdate }) {
  const byStatus = (status) => orders.filter((o) => o.status === status);

  return (
    <div style={{ display: 'flex', gap: '1rem', padding: '1rem', alignItems: 'flex-start' }}>
      <OrderColumn title="Placed"     orders={byStatus('PLACED')}    onUpdate={onUpdate} />
      <OrderColumn title="Confirmed"  orders={byStatus('CONFIRMED')} onUpdate={onUpdate} />
      <OrderColumn title="Ready"      orders={byStatus('READY')}     onUpdate={onUpdate} />
    </div>
  );
}
