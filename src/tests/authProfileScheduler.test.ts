import { describe, expect, it, vi } from 'vitest';
import { scheduleAuthProfileLookup } from '../services/authProfileScheduler';

describe('Supabase auth profile scheduling', () => {
  it('does not start the database lookup until after the auth callback returns', async () => {
    const scheduledTasks: Array<() => void> = [];
    const schedule = vi.fn((task: () => void, delayMs: number) => {
      expect(delayMs).toBe(0);
      scheduledTasks.push(task);
    });
    const lookup = vi.fn().mockResolvedValue({ user_id: 'synthetic-user' });
    const onComplete = vi.fn();

    scheduleAuthProfileLookup('synthetic-user', lookup, onComplete, schedule);

    expect(schedule).toHaveBeenCalledOnce();
    expect(lookup).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();

    scheduledTasks[0]();
    await Promise.resolve();

    expect(lookup).toHaveBeenCalledWith('synthetic-user');
    expect(onComplete).toHaveBeenCalledWith('synthetic-user', { user_id: 'synthetic-user' });
  });
});
