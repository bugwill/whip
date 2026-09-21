import { act, create } from 'react-test-renderer';
import { useAgentNotificationSideEffects } from '../src/hooks/useAgentNotificationSideEffects';
import { alertAgent, dismissAgentAlertsForPane } from '../src/services/alerts';
import type { HerdrSnapshot, PaneInfo } from '../src/types';

jest.mock('react-native', () => ({
  AppState: { currentState: 'background' },
}));
jest.mock('react-native-css-interop/jsx-runtime', () =>
  jest.requireActual('react/jsx-runtime'),
);
jest.mock('expo-notifications', () => ({}));
jest.mock('../src/services/alerts', () => ({
  alertAgent: jest.fn(() => Promise.resolve()),
  dismissAgentAlertsForPane: jest.fn(() => Promise.resolve()),
}));
jest.mock('../src/services/backgroundOperations', () => ({
  reportBackgroundFailure: jest.fn(),
}));
jest.mock('../src/services/devicePreferences', () => ({
  defaultDevicePreferences: {
    agentAlertLevel: 'persistent',
    persistentAlertDurationSeconds: 30,
  },
}));
jest.mock('../src/services/networkDiagnostics', () => ({
  recordNetworkDiagnostic: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

const pane: PaneInfo = {
  pane_id: 'pane-1',
  terminal_id: 'terminal-1',
  workspace_id: 'workspace-1',
  tab_id: 'tab-1',
  focused: false,
  agent: 'codex',
  agent_status: 'done',
  revision: 2,
};

test('does not notify from a pane when the Agents list has no matching entry', () => {
  let onChange!: ReturnType<typeof useAgentNotificationSideEffects>;
  function Harness() {
    onChange = useAgentNotificationSideEffects({
      alertsEnabled: true,
      agentAlertLevel: 'persistent',
      persistentAlertDurationSeconds: 30,
      ttsEnabled: false,
    });
    return null;
  }
  act(() => { create(<Harness />); });

  const snapshot = {
    server: { running: true },
    focused_workspace_id: null,
    focused_tab_id: null,
    focused_pane_id: null,
    agents: [],
    workspaces: [],
    tabs: [],
    panes: [pane],
    layouts: [],
  } satisfies HerdrSnapshot;
  act(() => onChange({
    sessionId: 'host-1',
    snapshot,
    transitions: [{ paneId: pane.pane_id, previous: 'working', current: 'done', revision: 2 }],
  }));

  expect(alertAgent).not.toHaveBeenCalled();
});

test.each(['blocked', 'done', 'idle'] as const)(
  'notifies an Agent for working to %s', currentStatus => {
  let onChange!: ReturnType<typeof useAgentNotificationSideEffects>;
  function Harness() {
    onChange = useAgentNotificationSideEffects({
      alertsEnabled: true,
      agentAlertLevel: 'persistent',
      persistentAlertDurationSeconds: 30,
      ttsEnabled: false,
    });
    return null;
  }
  act(() => { create(<Harness />); });

  const currentAgent = { ...pane, agent_status: currentStatus };
  const snapshot = {
    server: { running: true },
    focused_workspace_id: null,
    focused_tab_id: null,
    focused_pane_id: null,
    agents: [currentAgent],
    workspaces: [],
    tabs: [],
    panes: [{ ...currentAgent, agent_status: 'idle' as const }],
    layouts: [],
  } satisfies HerdrSnapshot;
  act(() => onChange({
    sessionId: 'host-1',
    snapshot,
    transitions: [{ paneId: pane.pane_id, previous: 'working', current: 'idle', revision: 3 }],
  }));

  expect(alertAgent).toHaveBeenCalledWith(
    currentAgent,
    false,
    { hostId: 'host-1', paneId: pane.pane_id },
    pane.tab_id,
    'persistent',
    30_000,
  );
  expect(dismissAgentAlertsForPane).not.toHaveBeenCalled();
  },
);

test('does not notify an initial idle state or clear a done notification on idle', () => {
  let onChange!: ReturnType<typeof useAgentNotificationSideEffects>;
  function Harness() {
    onChange = useAgentNotificationSideEffects({
      alertsEnabled: true,
      agentAlertLevel: 'persistent',
      persistentAlertDurationSeconds: 30,
      ttsEnabled: false,
    });
    return null;
  }
  act(() => { create(<Harness />); });

  const idlePane = { ...pane, agent_status: 'idle' as const };
  const snapshot = {
    server: { running: true },
    focused_workspace_id: null,
    focused_tab_id: null,
    focused_pane_id: null,
    agents: [idlePane],
    workspaces: [],
    tabs: [],
    panes: [idlePane],
    layouts: [],
  } satisfies HerdrSnapshot;
  act(() => onChange({
    sessionId: 'host-1',
    snapshot,
    transitions: [{ paneId: pane.pane_id, previous: undefined, current: 'idle', revision: 1 }],
  }));
  expect(alertAgent).not.toHaveBeenCalled();
  expect(dismissAgentAlertsForPane).not.toHaveBeenCalled();

  const doneAgent = { ...pane, agent_status: 'done' as const };
  act(() => onChange({
    sessionId: 'host-1',
    snapshot: { ...snapshot, agents: [doneAgent], panes: [{ ...doneAgent, agent_status: 'idle' as const }] },
    transitions: [{ paneId: pane.pane_id, previous: 'working', current: 'done', revision: 2 }],
  }));
  expect(alertAgent).toHaveBeenCalledWith(
    doneAgent,
    false,
    { hostId: 'host-1', paneId: pane.pane_id },
    pane.tab_id,
    'persistent',
    30_000,
  );
  jest.mocked(alertAgent).mockClear();
  jest.mocked(dismissAgentAlertsForPane).mockClear();

  act(() => onChange({
    sessionId: 'host-1',
    snapshot: { ...snapshot, agents: [idlePane] },
    transitions: [{ paneId: pane.pane_id, previous: 'done', current: 'idle', revision: 3 }],
  }));
  expect(alertAgent).not.toHaveBeenCalled();
  expect(dismissAgentAlertsForPane).not.toHaveBeenCalled();
});
