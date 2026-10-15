import { afterEach, describe, expect, it, vi } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock('../lib/supabase/client', () => ({ supabase: { rpc: rpcMock } }));

import { getPublicResourceDirectory } from '../services/publicResourceService';

const directory = {
  hospitals: [{ oxygen: [], medicines: [] }],
  blood_banks: [{ stock: [] }],
  ambulance_providers: []
};

describe('public resource directory contract', () => {
  afterEach(() => vi.resetAllMocks());

  it('returns all supported resource groups from the Supabase RPC', async () => {
    rpcMock.mockResolvedValue({ data: directory, error: null });

    await expect(getPublicResourceDirectory()).resolves.toEqual(directory);
    expect(rpcMock).toHaveBeenCalledWith('get_public_resource_directory');
  });

  it('surfaces the Supabase RPC error instead of returning an empty directory', async () => {
    rpcMock.mockResolvedValue({ data: null, error: {
      code: 'PGRST202',
      message: 'Could not find the function public.get_public_resource_directory without parameters in the schema cache'
    } });

    await expect(getPublicResourceDirectory()).rejects.toThrow(
      'The public resource directory is not configured in this Supabase project yet. A project administrator must reconcile the schema and migration history before this feature can be used.'
    );
  });

  it('preserves unrelated RPC errors', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } });

    await expect(getPublicResourceDirectory()).rejects.toThrow('Could not load the public resource directory: permission denied');
  });

  it('rejects responses that omit a resource group', async () => {
    rpcMock.mockResolvedValue({ data: { hospitals: [], blood_banks: [] }, error: null });

    await expect(getPublicResourceDirectory()).rejects.toThrow('The public resource directory response is incomplete. Ask a project administrator');
  });

  it('rejects nested inventory arrays that do not match the UI contract', async () => {
    rpcMock.mockResolvedValue({
      data: { hospitals: [{ oxygen: null, medicines: [] }], blood_banks: [], ambulance_providers: [] },
      error: null
    });

    await expect(getPublicResourceDirectory()).rejects.toThrow('The public resource directory response does not match the current data contract.');
  });
});
