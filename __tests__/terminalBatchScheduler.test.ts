import { createTerminalBatchActivity, terminalBatchWindow } from '../src/lib/terminalBatchScheduler';

test('passive arrivals change to 500ms after two seconds and reset after one idle second', () => {
  const activity = createTerminalBatchActivity();
  for (let time = 0; time < 2_000; time += 100) expect(terminalBatchWindow(activity, time)).toBe(250);
  for (let time = 2_000; time <= 4_000; time += 100) expect(terminalBatchWindow(activity, time)).toBe(500);
  expect(terminalBatchWindow(activity, 5_000)).toBe(250);
  expect(terminalBatchWindow(activity, 5_100)).toBe(250);
});
