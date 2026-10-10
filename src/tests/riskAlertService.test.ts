import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, rpcMock, response } = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn(), response: { data: [] as unknown, error: null as unknown } }));
vi.mock('../lib/supabase/client', () => ({ supabase: { from: fromMock, rpc: rpcMock } }));

import { getRiskAlertEvents, getRiskAlerts, transitionRiskAlert } from '../services/riskAlertService';

function queryFor(table: string) {
  const query: Record<string, any> = {};
  for (const method of ['select','order','limit','in','eq']) query[method] = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(response.data ?? (table === 'risk_alerts' || table === 'alert_events' ? [] : null))
      .then((data) => ({ data, error: response.error })).then(resolve, reject);
  return query;
}

describe('resource risk alert workflow', () => {
  beforeEach(() => {
    response.data = [];
    response.error = null;
    fromMock.mockImplementation((table: string) => queryFor(table));
    rpcMock.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('loads alerts and their append-only action history from Supabase', async () => {
    const alerts = [{ alert_id: 'a1', status: 'open' }];
    const history = [{ event_id: 'e1', alert_id: 'a1', action: 'opened' }];
    response.data = alerts;
    await expect(getRiskAlerts()).resolves.toEqual(alerts);
    expect(fromMock).toHaveBeenCalledWith('risk_alerts');
    response.data = history;
    await expect(getRiskAlertEvents(['a1'])).resolves.toEqual(history);
    expect(fromMock).toHaveBeenLastCalledWith('alert_events');
  });

  it('filters active and historical alerts in Supabase before applying the list limit', async () => {
    const activeQuery = queryFor('risk_alerts');
    fromMock.mockReturnValueOnce(activeQuery);
    await getRiskAlerts('active');
    expect(activeQuery.in).toHaveBeenCalledWith('status', ['open', 'acknowledged']);
    expect(activeQuery.limit).toHaveBeenCalledWith(100);

    const resolvedQuery = queryFor('risk_alerts');
    fromMock.mockReturnValueOnce(resolvedQuery);
    await getRiskAlerts('resolved');
    expect(resolvedQuery.eq).toHaveBeenCalledWith('status', 'resolved');
  });

  it('does not request event history when the visible alert list is empty', async () => {
    await expect(getRiskAlertEvents([])).resolves.toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('requires a resolution note before calling the transition RPC', async () => {
    await expect(transitionRiskAlert('a1','resolved','  ')).rejects.toThrow('Add a resolution note.');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('rejects free-text action notes that could contain patient or contact details', async () => {
    await expect(transitionRiskAlert('a1','acknowledged','Patient Jane called 555-1234')).rejects.toThrow('Choose an approved review note');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('sends a trimmed decision note to the trusted transaction and requires a returned row', async () => {
    const alert = { alert_id: 'a1', status: 'acknowledged' };
    rpcMock.mockResolvedValue({ data: alert, error: null });
    await expect(transitionRiskAlert('a1','acknowledged','  Inventory verified  ')).resolves.toEqual(alert);
    expect(rpcMock).toHaveBeenCalledWith('transition_risk_alert', {
      p_alert_id: 'a1', p_action: 'acknowledged', p_note: 'Inventory verified'
    });
  });

  it('surfaces authorization and database failures instead of assuming success', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(transitionRiskAlert('a1','dismissed','Duplicate alert')).rejects.toThrow('Could not update resource risk alert: permission denied');
  });
});
