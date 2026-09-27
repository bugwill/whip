import { createRuntimeProjectionScheduler, publishRuntimeProjection } from '../src/lib/runtimeProjectionScheduler';

test('background events preserve work without reading a view; active reads latest once', () => {
  let revision = 0;
  const observed: number[] = [];
  const view = jest.fn(() => observed.push(revision));
  const scheduler = createRuntimeProjectionScheduler(view, false);
  for (revision = 1; revision <= 20; revision += 1) scheduler.request();
  expect(view).not.toHaveBeenCalled();
  scheduler.setActive(true);
  expect(observed).toEqual([21]);
  scheduler.setActive(true);
  expect(view).toHaveBeenCalledTimes(1);
});

test('explicit commit clears pending work and quick lifecycle changes cannot repeat it', () => {
  const view = jest.fn();
  const scheduler = createRuntimeProjectionScheduler(view, true);
  scheduler.request();
  scheduler.setActive(false);
  scheduler.request();
  scheduler.committed();
  scheduler.setActive(true);
  scheduler.setActive(false);
  scheduler.setActive(true);
  expect(view).toHaveBeenCalledTimes(1);
  scheduler.request();
  expect(view).toHaveBeenCalledTimes(2);
});


test('active refresh publishes stateRef synchronously before scheduling React rendering', () => {
  const stateRef = { current: { revision: 0 } };
  const publish = jest.fn(next => expect(stateRef.current).toBe(next));
  const scheduler = createRuntimeProjectionScheduler(() => {
    publishRuntimeProjection(stateRef, { revision: 20 }, publish);
  }, false);
  scheduler.request();
  scheduler.setActive(true);
  // The app-state listener can immediately begin recovery/navigation after this return.
  expect(stateRef.current.revision).toBe(20);
  expect(publish).toHaveBeenCalledTimes(1);
});

test('automatic host-state projections keep their priority; resume flushes urgently', () => {
  const calls: Array<[number | undefined, string]> = [];
  const scheduler = createRuntimeProjectionScheduler<number>(
    (view, priority) => calls.push([view, priority]), true,
  );
  scheduler.request(1, 'transition');
  scheduler.request(2);
  scheduler.setActive(false);
  scheduler.request(3, 'transition');
  scheduler.setActive(true);
  expect(calls).toEqual([[1, 'transition'], [2, 'urgent'], [undefined, 'urgent']]);
});
