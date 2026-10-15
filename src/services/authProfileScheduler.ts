export type AuthProfileScheduler = (task: () => void, delayMs: number) => unknown;

/** Schedule profile I/O after Supabase has returned from its auth event callback. */
export function scheduleAuthProfileLookup<T>(
  userId: string,
  lookup: (userId: string) => Promise<T>,
  onComplete: (userId: string, result: T) => void,
  schedule: AuthProfileScheduler
): void {
  schedule(() => {
    void lookup(userId).then((result) => onComplete(userId, result));
  }, 0);
}
