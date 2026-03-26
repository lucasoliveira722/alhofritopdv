import { describe, it, expect, vi } from 'vitest';
import { sseManager } from '../../services/sseManager.js';

function mockRes() {
  return { write: vi.fn(), end: vi.fn() };
}

describe('sseManager', () => {
  it('pushes a message to all connected clients', () => {
    const res1 = mockRes();
    const res2 = mockRes();

    sseManager.add(res1);
    sseManager.add(res2);
    sseManager.push('order:new', { id: 'abc' });

    expect(res1.write).toHaveBeenCalledWith(
      'event: order:new\ndata: {"id":"abc"}\n\n'
    );
    expect(res2.write).toHaveBeenCalledWith(
      'event: order:new\ndata: {"id":"abc"}\n\n'
    );

    // Clean up to avoid state leaking between tests
    sseManager.remove(res1);
    sseManager.remove(res2);
  });

  it('does not push to removed clients', () => {
    const res = mockRes();
    sseManager.add(res);
    sseManager.remove(res);
    sseManager.push('order:new', { id: 'abc' });

    expect(res.write).not.toHaveBeenCalled();
  });
});
