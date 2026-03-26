import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { KanbanBoard } from '../../components/KanbanBoard.jsx';

const orders = [
  { id: 'a1', status: 'PLACED', items: [], total_price: '10.00' },
  { id: 'a2', status: 'CONFIRMED', items: [], total_price: '20.00' },
  { id: 'a3', status: 'READY', items: [], total_price: '30.00' },
];

describe('KanbanBoard', () => {
  it('renders three columns', () => {
    render(<KanbanBoard orders={orders} onUpdate={() => {}} />);
    expect(screen.getByText(/Placed/i)).toBeInTheDocument();
    expect(screen.getByText(/Confirmed/i)).toBeInTheDocument();
    expect(screen.getByText(/Ready/i)).toBeInTheDocument();
  });

  it('puts each order in the correct column', () => {
    render(<KanbanBoard orders={orders} onUpdate={() => {}} />);
    // Each column shows its count
    expect(screen.getByText('Placed (1)')).toBeInTheDocument();
    expect(screen.getByText('Confirmed (1)')).toBeInTheDocument();
    expect(screen.getByText('Ready (1)')).toBeInTheDocument();
  });
});
