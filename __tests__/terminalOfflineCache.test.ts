const { createTerminalOfflineCache } = require('../scripts/terminal-offline-cache.cjs') as {
  createTerminalOfflineCache: (options: Record<string, unknown>) => {
    configure: (options: { enabled: boolean; scrollback: number; eink?: boolean }) => void;
    markDirty: () => void;
    snapshot: (reason: string, force?: boolean) => boolean;
    dispose: () => void;
  };
};

describe('terminal offline cache scheduler', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('E-Ink uses the normal first delay and enforces 30 seconds between idle writes', () => {
    const serialize = jest.fn(() => 'latest state');
    const cache = createTerminalOfflineCache({ serialize, send: jest.fn() });
    cache.configure({ enabled: true, scrollback: 5000, eink: true });
    cache.markDirty();
    jest.advanceTimersByTime(2999);
    expect(serialize).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(serialize).toHaveBeenCalledTimes(1);
    expect(serialize).toHaveBeenCalledWith({ scrollback: 500 });
    cache.markDirty();
    jest.advanceTimersByTime(29999);
    expect(serialize).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    // The serialized transcript is unchanged, so lifecycle flush does no
    // duplicate bridge work even though the idle interval has elapsed.
    expect(serialize).toHaveBeenCalledTimes(2);
    jest.runOnlyPendingTimers();
    expect(serialize).toHaveBeenCalledTimes(2);
  });

  test('limits E-Ink serialization before building a large transcript', () => {
    const serialize = jest.fn(() => 'bounded state');
    const cache = createTerminalOfflineCache({ serialize, send: jest.fn() });
    cache.configure({ enabled: true, scrollback: 20000, eink: true });
    cache.markDirty();
    cache.snapshot('background', true);
    expect(serialize).toHaveBeenCalledWith({ scrollback: 500 });
    cache.configure({ enabled: true, scrollback: 20000, eink: false });
    cache.markDirty();
    cache.snapshot('background', true);
    expect(serialize).toHaveBeenLastCalledWith({ scrollback: 5000 });
  });

  test('serializes once after an output burst instead of on every frame', () => {
    const serialize = jest.fn(() => 'cached state');
    const send = jest.fn();
    const cache = createTerminalOfflineCache({ serialize, send, now: () => 10 });
    cache.configure({ enabled: true, scrollback: 2000 });

    cache.markDirty();
    jest.advanceTimersByTime(500);
    cache.markDirty();
    jest.advanceTimersByTime(749);
    expect(serialize).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(serialize).toHaveBeenCalledTimes(1);
    expect(serialize).toHaveBeenCalledWith({ scrollback: 2000 });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'cache-snapshot',
      reason: 'idle',
      transcript: 'cached state',
    }));
  });

  test('forces a dirty snapshot at an eviction boundary without a recurring timer', () => {
    const serialize = jest.fn(() => 'latest state');
    const send = jest.fn();
    const cache = createTerminalOfflineCache({ serialize, send, now: () => 10 });
    cache.configure({ enabled: true, scrollback: 5000 });
    cache.markDirty();

    expect(cache.snapshot('eviction')).toBe(true);
    expect(serialize).toHaveBeenCalledTimes(1);
    jest.runOnlyPendingTimers();
    expect(serialize).toHaveBeenCalledTimes(1);
  });

  test('does no cache work when disabled for SSH terminals', () => {
    const serialize = jest.fn(() => 'ssh state');
    const cache = createTerminalOfflineCache({ serialize, send: jest.fn() });
    cache.configure({ enabled: false, scrollback: 5000 });

    cache.markDirty();
    jest.runOnlyPendingTimers();
    expect(cache.snapshot('background', true)).toBe(false);
    expect(serialize).not.toHaveBeenCalled();
  });

  test('skips unchanged dirty snapshots while still clearing the pending timer', () => {
    const serialize = jest.fn(() => 'same state');
    const send = jest.fn();
    const cache = createTerminalOfflineCache({ serialize, send });
    cache.configure({ enabled: true, scrollback: 5000, eink: true });

    cache.markDirty();
    jest.advanceTimersByTime(3000);
    expect(serialize).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(2);

    cache.markDirty();
    expect(cache.snapshot('hide', true)).toBe(false);
    expect(serialize).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(2);
    jest.runOnlyPendingTimers();
    expect(serialize).toHaveBeenCalledTimes(2);
  });

  test('counts an unchanged E-Ink serialization toward the next 30-second CPU interval', () => {
    const serialize = jest.fn(() => 'same state');
    const cache = createTerminalOfflineCache({ serialize, send: jest.fn() });
    cache.configure({ enabled: true, scrollback: 5000, eink: true });

    cache.markDirty();
    jest.advanceTimersByTime(3000);
    expect(serialize).toHaveBeenCalledTimes(1);
    cache.markDirty();
    jest.advanceTimersByTime(29999);
    expect(serialize).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(serialize).toHaveBeenCalledTimes(2);

    cache.markDirty();
    jest.advanceTimersByTime(29999);
    expect(serialize).toHaveBeenCalledTimes(2);
  });

  test('contains serialization failures so lifecycle cleanup can continue', () => {
    const send = jest.fn();
    const cache = createTerminalOfflineCache({
      serialize: () => { throw new Error('serialize failed'); },
      send,
      now: () => 10,
    });
    cache.configure({ enabled: true, scrollback: 5000 });
    cache.markDirty();

    expect(() => cache.snapshot('eviction', true)).not.toThrow();
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'cache-snapshot',
      transcript: null,
    }));
    cache.markDirty();
    expect(() => cache.snapshot('retry', true)).not.toThrow();
    expect(send).toHaveBeenCalledTimes(4);
  });
});
