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
  let lastTranscript = null;
  let lastSnapshotAt = null;
  let einkMode = false;
  const normalDelayMs = delayMs;
  const EINK_MIN_IDLE_INTERVAL_MS = 30_000;

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
    // E-Ink lifecycle force bypasses the idle timer but still requires dirty
    // state. Preserve the prior normal-mode force behavior for callers that
    // explicitly request a snapshot of a clean renderer.
    if (!enabled || (!dirty && (einkMode || !force))) return false;
    const started = now();
    let transcript = null;
    let failed = false;
    try {
      transcript = safeSerialization(serialize({ scrollback }));
    } catch {
      // Snapshot failure must not abort renderer eviction or live rendering.
      dirty = true;
      failed = true;
    }
    if (einkMode && !failed && transcript === lastTranscript) {
      dirty = false;
      lastSnapshotAt = now();
      return false;
    }
    if (!failed) dirty = false;
    send({ type: 'cache-snapshot-start', reason });
    send({
      type: 'cache-snapshot',
      reason,
      durationMs: Math.max(0, now() - started),
      transcript,
    });
    if (!failed) {
      lastTranscript = transcript;
      lastSnapshotAt = now();
    }
    return true;
  };

  return {
    configure(options) {
      einkMode = options?.eink === true;
      delayMs = einkMode ? Math.max(3000, normalDelayMs) : normalDelayMs;
      enabled = options?.enabled === true;
      // serialize() builds the entire ANSI string before safeSerialization can
      // clip it. Keep the synchronous work and WebView bridge payload bounded
      // on E-Ink, where a large restored session can otherwise stall rendering.
      const maximumScrollback = options?.eink ? 500 : 5000;
      scrollback = Math.max(1, Math.min(maximumScrollback, Math.round(Number(options?.scrollback)) || maximumScrollback));
      if (!enabled) {
        dirty = false;
        lastTranscript = null;
        lastSnapshotAt = null;
        clearTimer();
      }
    },
    markDirty() {
      if (!enabled) return;
      dirty = true;
      clearTimer();
      const sinceLastSnapshot = lastSnapshotAt === null
        ? EINK_MIN_IDLE_INTERVAL_MS
        : Math.max(0, now() - lastSnapshotAt);
      const minimumWait = einkMode
        ? Math.max(3000, EINK_MIN_IDLE_INTERVAL_MS - sinceLastSnapshot)
        : delayMs;
      timer = schedule(() => {
        timer = null;
        snapshot('idle');
      }, minimumWait);
    },
    snapshot,
    dispose() {
      clearTimer();
      dirty = false;
    },
  };
}

module.exports = { createTerminalOfflineCache };
