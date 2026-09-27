import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { NativeAppCore, AppCoreProjection } from 'react-native-whip-ssh';

import { createRuntimeProjectionScheduler } from '../src/lib/runtimeProjectionScheduler';
import { useTerminalSessions } from '../src/hooks/useTerminalSessions';
import { loadPersistedTerminals, type PersistedTerminalRestore } from '../src/services/persistedTerminals';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('../src/services/persistedTerminals', () => ({
  loadPersistedTerminals: jest.fn(),
  PersistedTerminalsWriter: jest.fn(() => ({ retainSessions: jest.fn() })),
}));

test('cancelled storage reads cannot restore terminal selections into a replacement session', async () => {
  let finishRead!: (value: PersistedTerminalRestore) => void;
  jest.mocked(loadPersistedTerminals).mockReturnValueOnce(new Promise(resolve => {
    finishRead = resolve;
  }));
  let terminals!: ReturnType<typeof useTerminalSessions>;
  let renderer!: ReactTestRenderer;
  const restoreTerminals = jest.fn();
  function Harness() {
    terminals = useTerminalSessions();
    return null;
  }
  act(() => { renderer = create(<Harness />); });
  terminals.bindAppCore({ restoreTerminals } as unknown as NativeAppCore, jest.fn());
  let current = true;
  const restoring = terminals.restore('thinker', 'thinker', () => current);
  current = false;
  await act(async () => {
    finishRead({ terminalIds: ['old-pane'], activeTerminalId: 'old-pane', fontSizes: new Map() });
    await restoring;
  });
  expect(restoreTerminals).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});


test('automatic terminal lifecycle updates mutate Rust while background projections remain gated', () => {
  let terminals!: ReturnType<typeof useTerminalSessions>;
  function Harness() { terminals = useTerminalSessions(); return null; }
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<Harness />); });
  const view = jest.fn();
  const commit = jest.fn();
  const updateTerminalLifecycle = jest.fn(() => ({ revision: 1, sessions: [] }));
  const scheduler = createRuntimeProjectionScheduler<AppCoreProjection>(() => { view(); commit(); }, false);
  terminals.bindAppCore({ updateTerminalLifecycle } as unknown as NativeAppCore, commit, scheduler.request);
  act(() => terminals.updateLifecycle('host', 'terminal', 'failed', true));
  expect(updateTerminalLifecycle).toHaveBeenCalledWith('host', 'terminal', 'failed', true, undefined, 0);
  expect(view).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
  act(() => scheduler.setActive(true));
  expect(commit).toHaveBeenCalledTimes(1);
  const foregroundScheduler = createRuntimeProjectionScheduler<AppCoreProjection>(
    supplied => {
      if (!supplied) view();
      commit(supplied);
    }, true,
  );
  terminals.bindAppCore({ updateTerminalLifecycle } as unknown as NativeAppCore, commit, foregroundScheduler.request);
  view.mockClear();
  act(() => terminals.updateLifecycle('host', 'terminal', 'attached', false));
  expect(view).not.toHaveBeenCalled();
  expect(commit).toHaveBeenLastCalledWith({ revision: 1, sessions: [] });
  act(() => renderer.unmount());
});
