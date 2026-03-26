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
    mockES.onerror();
    expect(onReconnect).toHaveBeenCalled();
  });
});
