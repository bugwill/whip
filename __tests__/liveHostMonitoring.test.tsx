import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import { useLiveHostMonitoring } from '../src/hooks/useLiveHostMonitoring';
import { startBackgroundMonitoring } from '../src/services/backgroundMonitoring';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('../src/services/backgroundMonitoring', () => ({
  startBackgroundMonitoring: jest.fn(async () => undefined),
  stopBackgroundMonitoring: jest.fn(async () => undefined),
}));
jest.mock('../src/services/latencyDiagnostics', () => ({
  flushLatencyDiagnosticWrites: jest.fn(async () => undefined),
}));
jest.mock('../src/services/networkDiagnostics', () => ({ recordNetworkDiagnostic: jest.fn() }));

test('page switches reuse the lifecycle listener and foreground service', () => {
  (AppState as { currentState: string }).currentState = 'active';
  let change!: (state: AppStateStatus) => void;
  const remove = jest.fn();
  const subscribe = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    change = listener;
    return { remove };
  });
  const update = jest.fn();
  function Host({ hostsVisible }: { hostsVisible: boolean }) {
    useLiveHostMonitoring({
      liveHostCount: 1, alertsEnabled: true, restoreComplete: true,
      hostsVisible, appAccessLocked: false, isEink: true,
      backgroundPowerMode: 'balanced', setRuntimeMonitoringState: update,
      onBackgroundMonitoringError: jest.fn(),
    });
    return null;
  }
  let renderer!: ReactTestRenderer;
  try {
    act(() => { renderer = create(<Host hostsVisible />); });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenLastCalledWith(true, true, false, true);
    act(() => renderer.update(<Host hostsVisible={false} />));
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenLastCalledWith(true, false, false, true);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(startBackgroundMonitoring).toHaveBeenCalledTimes(1);
    act(() => change('background'));
    expect(update).toHaveBeenLastCalledWith(false, false, false, true);
    act(() => change('background'));
    expect(update).toHaveBeenCalledTimes(3);
    act(() => change('active'));
    expect(update).toHaveBeenLastCalledWith(true, false, false, true);
    act(() => renderer.unmount());
    expect(remove).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(4);
  } finally {
    subscribe.mockRestore();
  }
});
