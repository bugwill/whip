import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { FrameInfo } from 'react-native-reanimated';
import { useDecorativeProgress } from '../src/hooks/useDecorativeProgress';

type TestFrameCallback = { run: (info: FrameInfo) => void; active: boolean };
const mockCallbacks = new Set<TestFrameCallback>();

jest.mock('react-native-reanimated', () => {
  const React = require('react') as typeof import('react');
  return {
    useSharedValue: <T,>(initial: T) => React.useRef({ value: initial }).current,
    useFrameCallback: (run: TestFrameCallback['run']) => {
      const ref = React.useRef({
        run,
        active: false,
        setActive(active: boolean) { this.active = active; },
      });
      ref.current.run = run;
      React.useEffect(() => {
        const callback = ref.current;
        mockCallbacks.add(callback);
        return () => { mockCallbacks.delete(callback); };
      }, []);
      return ref.current;
    },
  };
});

describe('decorative animation timing', () => {
  let renderer: ReactTestRenderer;
  let progress: ReturnType<typeof useDecorativeProgress>;
  function Harness({ enabled = true, reverse = false }) {
    progress = useDecorativeProgress(enabled, 1000, reverse);
    return null;
  }
  function frame(timestamp: number) {
    for (const callback of mockCallbacks) {
      if (callback.active) callback.run({ timestamp, timeSincePreviousFrame: null, timeSinceFirstFrame: 0 });
    }
    return progress.value;
  }
  afterEach(() => act(() => renderer.unmount()));

  test.each([60, 90, 120])('limits style changes to 30 per second on a %s Hz display', refreshRate => {
    act(() => { renderer = create(<Harness />); });
    let changes = 0;
    let previous = -1;
    for (let index = 0; index < refreshRate * 2; index += 1) {
      const value = frame(index * 1000 / refreshRate);
      if (value !== previous) changes += 1;
      previous = value;
    }
    expect(changes).toBe(60);
  });

  test('preserves animation speed and skips directly over missed frames', () => {
    act(() => { renderer = create(<Harness />); });
    expect(frame(0)).toBe(0);
    expect(frame(500)).toBe(0.5);
    expect(frame(2750)).toBe(0.75);
  });

  test('preserves the breathing curve and reversal', () => {
    act(() => { renderer = create(<Harness reverse />); });
    expect(frame(0)).toBe(0);
    expect(frame(250)).toBe(0.125);
    expect(frame(1000)).toBe(1);
    expect(frame(1500)).toBe(0.5);
    expect(frame(2000)).toBe(0);
  });

  test('stops and resets disabled motion, then resumes from its starting pose', () => {
    act(() => { renderer = create(<Harness />); });
    frame(0);
    expect(frame(500)).toBe(0.5);
    act(() => { renderer.update(<Harness enabled={false} />); });
    expect([...mockCallbacks].every(callback => !callback.active)).toBe(true);
    expect(frame(800)).toBe(0);
    act(() => { renderer.update(<Harness />); });
    expect(frame(2000)).toBe(0);
    expect(frame(2500)).toBe(0.5);
  });
});
