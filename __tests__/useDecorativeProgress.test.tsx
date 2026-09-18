import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { FrameInfo } from 'react-native-reanimated';
import { useDecorativeProgress } from '../src/hooks/useDecorativeProgress';
import { SpinnerFrameRateProvider, useSpinnerFrameRate } from '../src/hooks/useSpinnerFrameRate';
import { NativeAgentSpinner } from '../src/components/NativeAgentSpinner';
import { AppState } from 'react-native';
import { DisplayProfileProvider } from '../src/lib/displayProfile';

jest.mock('expo-modules-core', () => ({
  requireNativeViewManager: () => 'NativeSpinner',
}));

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
  beforeEach(() => {
    AppState.currentState = 'active';
    jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
  });
  let renderer: ReactTestRenderer;
  let progress: ReturnType<typeof useDecorativeProgress>;
  function Harness({ enabled = true, reverse = false }) {
    const framesPerSecond = useSpinnerFrameRate();
    progress = useDecorativeProgress(enabled, 1000, reverse, framesPerSecond);
    return null;
  }
  function frame(timestamp: number) {
    for (const callback of mockCallbacks) {
      if (callback.active) callback.run({ timestamp, timeSincePreviousFrame: null, timeSinceFirstFrame: 0 });
    }
    return progress.value;
  }
  afterEach(() => act(() => renderer.unmount()));

  test('E-Ink disables both frame scheduling and the native spinner', () => {
    act(() => {
      renderer = create(<DisplayProfileProvider preference="eink">
        <Harness /><NativeAgentSpinner color="#000000" durationMs={700} enabled size={24} />
      </DisplayProfileProvider>);
    });
    expect([...mockCallbacks].every(callback => !callback.active)).toBe(true);
    expect(renderer.root.findByProps({ pointerEvents: 'none' }).props.enabled).toBe(false);
  });

  test('backgrounding stops frame scheduling until active again', () => {
    const subscribe = jest.spyOn(AppState, 'addEventListener');
    subscribe.mockClear();
    act(() => { renderer = create(<Harness />); });
    const change = subscribe.mock.calls.find(([name]) => name === 'change')![1];
    act(() => change('background'));
    expect([...mockCallbacks].every(callback => !callback.active)).toBe(true);
    act(() => change('active'));
    expect([...mockCallbacks].every(callback => callback.active)).toBe(true);
    subscribe.mockRestore();
  });

  test.each([30, 60].flatMap(fps => [60, 90, 120].map(refreshRate => [fps, refreshRate])))
  ('limits style changes to %s per second on a %s Hz display', (fps, refreshRate) => {
    act(() => {
      renderer = create(
        <SpinnerFrameRateProvider smoothSpinners={fps === 60}><Harness /></SpinnerFrameRateProvider>,
      );
    });
    let changes = 0;
    let previous = -1;
    for (let index = 0; index < refreshRate * 2; index += 1) {
      const value = frame((index + 0.1) * 1000 / refreshRate);
      if (value !== previous) changes += 1;
      previous = value;
    }
    expect(changes).toBe(fps * 2);
  });

  test('updates native and React Native spinners immediately without restarting the React Native rotation', () => {
    const render = (smoothSpinners: boolean) => (
      <SpinnerFrameRateProvider smoothSpinners={smoothSpinners}>
        <Harness />
        <NativeAgentSpinner color="#00ff00" durationMs={700} enabled size={24} />
      </SpinnerFrameRateProvider>
    );
    const nativeRate = () => renderer.root.findByProps({ pointerEvents: 'none' }).props.framesPerSecond;
    act(() => { renderer = create(render(false)); });
    expect(nativeRate()).toBe(30);
    frame(0);
    frame(500);
    expect(frame(517)).toBe(0.5);
    act(() => { renderer.update(render(true)); });
    expect(nativeRate()).toBe(60);
    expect(frame(517)).toBeCloseTo(0.517);
    act(() => { renderer.update(render(false)); });
    expect(nativeRate()).toBe(30);
    frame(534);
    expect(frame(551)).toBeCloseTo(0.534);
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
