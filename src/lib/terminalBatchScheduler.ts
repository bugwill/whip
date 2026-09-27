/** Arrival-based policy; no idle polling and no trailing debounce. */
export function createTerminalBatchActivity() {
  return { startedMs: null as number | null, lastArrivalMs: null as number | null };
}
export function terminalBatchWindow(activity: ReturnType<typeof createTerminalBatchActivity>, now: number): number {
  if (activity.lastArrivalMs === null || now - activity.lastArrivalMs >= 1_000) activity.startedMs = now;
  activity.lastArrivalMs = now;
  return now - (activity.startedMs ?? now) >= 2_000 ? 500 : 250;
}
export function terminalMonotonicNow(): number {
  return performance.now();
}
