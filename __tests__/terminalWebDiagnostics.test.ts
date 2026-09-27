import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { TextEncoder } from 'node:util';

test('WebView diagnostics collect cumulative snapshots and isolate scenario callbacks without timers', () => {
  const generator = readFileSync(resolve(__dirname, '../scripts/sync-terminal-assets.mjs'), 'utf8');
  const start = generator.indexOf('    let performanceDiagnostics = false;');
  const end = generator.indexOf('    window.herdrWrite =', start);
  const completions: (() => void)[] = [];
  const send = jest.fn();
  let now = 0;
  const api = runInNewContext(`${generator.slice(start, end)}; ({ write: diagnosticWrite, enable: window.herdrSetPerformanceDiagnostics, collect: window.herdrCollectPerformanceDiagnostics })`, {
    window: {}, TextEncoder, send, performance: { now: () => now },
    terminal: { write: (_data: unknown, callback: () => void) => completions.push(callback) },
  });
  api.write('off', () => {});
  api.collect();
  expect(send).not.toHaveBeenCalled();
  api.enable(true);
  api.write('中', () => {});
  api.collect();
  expect(send.mock.calls[0][0].counters).toMatchObject({ writes: 1, bytes: 3, completed: 0, pendingWriteBytes: 3 });
  now = 25;
  completions[1]();
  api.collect();
  expect(send.mock.calls[1][0].counters).toMatchObject({ writes: 1, completed: 1, totalWriteMs: 25, maxWriteMs: 25, pendingWriteBytes: 0 });
  api.write('old', () => {});
  api.enable(false);
  api.enable(true);
  completions[2]();
  api.collect();
  expect(send.mock.calls[2][0].counters).toMatchObject({ writes: 0, completed: 0, pendingWriteBytes: 0 });
});
