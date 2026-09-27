import {
  beginPerformanceDiagnosticScene, endPerformanceDiagnosticScene,
  collectAndEndPerformanceDiagnosticScene, registerPerformanceDiagnosticCollector,
  registerPerformanceDiagnosticBackend,
  getPerformanceDiagnosticsSnapshot, recordPerformanceDiagnostic,
  recordPerformanceDiagnosticDuration, setPerformanceDiagnosticGauge,
} from '../src/services/performanceTrace';

test('scene diagnostics are disabled by default and stop without timers or native trace work', () => {
  const timer = jest.spyOn(global, 'setTimeout');
  recordPerformanceDiagnostic('ignored');
  expect(getPerformanceDiagnosticsSnapshot().counters).toEqual({});
  beginPerformanceDiagnosticScene();
  recordPerformanceDiagnostic('views');
  recordPerformanceDiagnostic('views', 2);
  recordPerformanceDiagnosticDuration('view', 5);
  recordPerformanceDiagnosticDuration('view', 3);
  setPerformanceDiagnosticGauge('pendingBytes', 42);
  const snapshot = endPerformanceDiagnosticScene();
  expect(snapshot).toEqual({
    counters: { views: 3 }, gauges: { pendingBytes: 42 },
    durations: { view: { count: 2, totalMs: 8, maxMs: 5 } },
  });
  recordPerformanceDiagnostic('views');
  snapshot.counters.views = 99;
  expect(getPerformanceDiagnosticsSnapshot().counters.views).toBe(3);
  expect(timer).not.toHaveBeenCalled();
  timer.mockRestore();
});

test('metric maps remain bounded even when diagnostic names vary', () => {
  beginPerformanceDiagnosticScene();
  for (let i = 0; i < 300; i += 1) recordPerformanceDiagnostic(`metric-${i}`);
  expect(Object.keys(endPerformanceDiagnosticScene().counters)).toHaveLength(256);
});


test('manual export waits for renderer collection before disabling diagnostics', async () => {
  let acknowledge!: () => void;
  const unsubscribe = registerPerformanceDiagnosticCollector(() => new Promise<void>(resolve => {
    acknowledge = () => { recordPerformanceDiagnostic('lastWrite'); resolve(); };
  }));
  beginPerformanceDiagnosticScene();
  const exported = collectAndEndPerformanceDiagnosticScene();
  acknowledge();
  expect((await exported).counters.lastWrite).toBe(1);
  recordPerformanceDiagnostic('lateWrite');
  expect(getPerformanceDiagnosticsSnapshot().counters.lateWrite).toBeUndefined();
  unsubscribe();
});


test('scene entry starts and stops the registered native backend and exports its snapshot', async () => {
  const begin = jest.fn();
  const end = jest.fn(() => ({ actualProbe: 2 }));
  registerPerformanceDiagnosticBackend({ begin, end });
  beginPerformanceDiagnosticScene();
  expect(begin).toHaveBeenCalledTimes(1);
  const snapshot = await collectAndEndPerformanceDiagnosticScene();
  expect(end).toHaveBeenCalledTimes(1);
  expect(snapshot.native).toEqual({ actualProbe: 2 });
});
