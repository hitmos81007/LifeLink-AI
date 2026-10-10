import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { limitMock, selectMock, fromMock, createClientMock } = vi.hoisted(() => {
  const limitMock = vi.fn();
  const selectMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  const createClientMock = vi.fn((_url: string, _key: string, _options: unknown) => ({ from: fromMock }));
  return { limitMock, selectMock, fromMock, createClientMock };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

async function loadClient(configured = true, prefix: 'VITE' | 'NEXT_PUBLIC' = 'VITE') {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', prefix === 'VITE' && configured ? 'https://synthetic-test.supabase.co' : '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', prefix === 'VITE' && configured ? 'test-anon-key' : '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', prefix === 'NEXT_PUBLIC' && configured ? 'https://synthetic-test.supabase.co' : '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', prefix === 'NEXT_PUBLIC' && configured ? 'test-anon-key' : '');
  return import('../lib/supabase/client');
}

describe('Supabase connection status', () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it('fails closed without sending a request when Supabase configuration is missing', async () => {
    const client = await loadClient(false);
    expect(client.isSupabaseConfigured).toBe(false);
    expect(createClientMock).toHaveBeenCalledWith(
      'https://supabase-not-configured.invalid',
      'supabase-not-configured',
      expect.objectContaining({ global: { fetch: expect.any(Function) } })
    );
    const [, , options] = createClientMock.mock.calls[0] as [string, string, { global: { fetch: typeof fetch } }];
    await expect(options.global.fetch('https://supabase-not-configured.invalid/rest/v1/hospitals'))
      .rejects.toThrow('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');

    await expect(client.testSupabaseConnection()).resolves.toEqual({
      connected: false,
      message: 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('reports a reachable database after a valid zero-row count probe', async () => {
    const client = await loadClient();
    limitMock.mockResolvedValue({ data: null, error: null, count: 0 });

    await expect(client.testSupabaseConnection()).resolves.toEqual({ connected: true, message: 'Database reachable' });
    expect(client.isSupabaseConfigured).toBe(true);
    expect(createClientMock).toHaveBeenCalledWith(
      'https://synthetic-test.supabase.co',
      'test-anon-key',
      expect.objectContaining({ auth: expect.objectContaining({ persistSession: true }) })
    );
    expect(fromMock).toHaveBeenCalledWith('hospitals');
    expect(selectMock).toHaveBeenCalledWith('hospital_id', { count: 'exact', head: true });
    expect(limitMock).toHaveBeenCalledWith(0);
  });

  it('supports the public Supabase variable names already configured in Vercel', async () => {
    const client = await loadClient(true, 'NEXT_PUBLIC');
    limitMock.mockResolvedValue({ data: null, error: null, count: 0 });
    await expect(client.testSupabaseConnection()).resolves.toEqual({ connected: true, message: 'Database reachable' });
    expect(createClientMock).toHaveBeenCalledWith(
      'https://synthetic-test.supabase.co', 'test-anon-key',
      expect.objectContaining({ auth: expect.objectContaining({ persistSession: true }) })
    );
  });

  it('reports database query failures instead of treating local auth state as connectivity', async () => {
    const client = await loadClient();
    limitMock.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    await expect(client.testSupabaseConnection()).resolves.toEqual({
      connected: false,
      message: 'Supabase database check failed: permission denied'
    });
  });

  it('reports transport exceptions as unavailable', async () => {
    const client = await loadClient();
    limitMock.mockRejectedValue(new Error('network unavailable'));

    await expect(client.testSupabaseConnection()).resolves.toEqual({
      connected: false,
      message: 'Failed to reach Supabase: network unavailable'
    });
  });
});
