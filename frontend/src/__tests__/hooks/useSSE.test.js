import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSSE } from '../../hooks/useSSE.js';

describe('useSSE', () => {
  let mockES;

  beforeEach(() => {
    mockES = {
      addEventListener: vi.fn(),
      close: vi.fn(),
      onerror: null,
    };
    vi.stubGlobal('EventSource', vi.fn(() => mockES));
  });

  it('opens an EventSource connection to the given URL', () => {
    renderHook(() => useSSE('/api/events', vi.fn(), vi.fn()));
    expect(EventSource).toHaveBeenCalledWith('/api/events');
  });

  it('registers listeners for order:new and order:updated', () => {
    renderHook(() => useSSE('/api/events', vi.fn(), vi.fn()));
    const events = mockES.addEventListener.mock.calls.map((c) => c[0]);
    expect(events).toContain('order:new');
    expect(events).toContain('order:updated');
  });

  it('closes the connection on unmount', () => {
    const { unmount } = renderHook(() => useSSE('/api/events', vi.fn(), vi.fn()));
    unmount();
    expect(mockES.close).toHaveBeenCalled();
  });

  it('calls onReconnect when an error occurs', () => {
    const onReconnect = vi.fn();
    renderHook(() => useSSE('/api/events', vi.fn(), onReconnect));
    const handler = mockES.onerror;
    expect(typeof handler).toBe('function');
    handler();
    expect(onReconnect).toHaveBeenCalled();
  });

  it('calls onMessage with parsed data when order:new event fires', () => {
    const onMessage = vi.fn();
    renderHook(() => useSSE('/api/events', onMessage, vi.fn()));
    const [, handler] = mockES.addEventListener.mock.calls.find(([event]) => event === 'order:new');
    handler({ data: JSON.stringify({ id: '123', status: 'PLACED' }) });
    expect(onMessage).toHaveBeenCalledWith('order:new', { id: '123', status: 'PLACED' });
  });
});
