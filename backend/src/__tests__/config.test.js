import { describe, it, expect, beforeEach } from 'vitest';

describe('config', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgres://test:test@localhost/test';
    process.env.KEETA_CLIENT_ID = 'test-client-id';
    process.env.KEETA_CLIENT_SECRET = 'test-client-secret';
  });

  it('exports required fields when env vars are set', async () => {
    const { config } = await import('../config.js');
    expect(config.databaseUrl).toBe('postgres://test:test@localhost/test');
    expect(config.keetaClientId).toBe('test-client-id');
    expect(config.keetaClientSecret).toBe('test-client-secret');
    expect(config.port).toBeDefined();
  });
});
