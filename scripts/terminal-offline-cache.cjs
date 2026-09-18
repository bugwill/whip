'use strict';

/**
 * Creates the renderer-local offline cache scheduler used inside each terminal
 * iframe. Keep this function self-contained: sync-terminal-assets embeds it in
 * the generated WebView runtime with Function#toString.
 */
function createTerminalOfflineCache({
  serialize,
  send,
  delayMs = 750,
  maxCharacters = 1_000_000,
  now = () => performance.now(),
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = timer => clearTimeout(timer),
}) {
  let enabled = false;
  let dirty = false;
  let timer = null;
  let scrollback = 5000;
  const normalDelayMs = delayMs;

  const clearTimer = () => {
    if (timer === null) return;
    cancel(timer);
    timer = null;
  };

  const safeSerialization = value => {
    // SerializeAddon emits terminal state, not arbitrary input, but OSC is not
    // needed for reconstruction and can carry clipboard/title/link side effects.
    const withoutOsc = String(value || '').replace(
      /\u001b\](?:[^\u0007\u001b]|\u001b(?!\\))*(?:\u0007|\u001b\\)/g,
      '',
    );
    if (withoutOsc.length <= maxCharacters) return withoutOsc;
    const clipped = withoutOsc.slice(-maxCharacters);
    // Avoid starting restoration in the middle of a serialized row or escape.
    const firstRowBoundary = clipped.indexOf('\r\n');
    return firstRowBoundary >= 0 ? clipped.slice(firstRowBoundary + 2) : clipped;
  };

  const snapshot = (reason = 'idle', force = false) => {
    clearTimer();
    if (!enabled || (!dirty && !force)) return false;
    dirty = false;
    send({ type: 'cache-snapshot-start', reason });
    const started = now();
    let transcript = null;
    try {
      transcript = safeSerialization(serialize({ scrollback }));
    } catch {
      // Snapshot failure must not abort renderer eviction or live rendering.
      dirty = true;
    }
    send({
      type: 'cache-snapshot',
      reason,
      durationMs: Math.max(0, now() - started),
      transcript,
    });
    return true;
  };

  return {
    configure(options) {
      delayMs = options?.eink ? Math.max(3000, normalDelayMs) : normalDelayMs;
      enabled = options?.enabled === true;
      // serialize() builds the entire ANSI string before safeSerialization can
      // clip it. Keep the synchronous work and WebView bridge payload bounded
      // on E-Ink, where a large restored session can otherwise stall rendering.
      const maximumScrollback = options?.eink ? 500 : 5000;
      scrollback = Math.max(1, Math.min(maximumScrollback, Math.round(Number(options?.scrollback)) || maximumScrollback));
      if (!enabled) {
        dirty = false;
        clearTimer();
      }
    },
    markDirty() {
      if (!enabled) return;
      dirty = true;
      clearTimer();
      timer = schedule(() => {
        timer = null;
        snapshot('idle');
      }, delayMs);
    },
    snapshot,
    dispose() {
      clearTimer();
      dirty = false;
    },
  };
}

module.exports = { createTerminalOfflineCache };
