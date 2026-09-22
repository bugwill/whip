import { useState } from 'react';
import { act, create } from 'react-test-renderer';
import {
  useAgentNotificationNavigation,
  useAgentNotificationSideEffects,
} from '../src/hooks/useAgentNotificationSideEffects';
import { alertAgent, dismissAgentAlertsForPane } from '../src/services/alerts';
import type { LiveHostSessionsState } from '../src/liveHostSessions';
import type { HerdrSnapshot, PaneInfo } from '../src/types';

jest.mock('react-native', () => ({
  AppState: { currentState: 'background' },
}));
jest.mock('react-native-css-interop/jsx-runtime', () =>
  jest.requireActual('react/jsx-runtime'),
);
jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
}));
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

function renderAgentSideEffectsHarness(): ReturnType<typeof useAgentNotificationSideEffects> {
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
  return onChange;
}

test('does not notify from a pane when the Agents list has no matching entry', () => {
  const onChange = renderAgentSideEffectsHarness();

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
  const onChange = renderAgentSideEffectsHarness();

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
  const onChange = renderAgentSideEffectsHarness();

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

test('retries a notification target after the host snapshot arrives', () => {
  const response = {
    actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    notification: {
      request: {
        identifier: 'notification-1',
        content: { data: { hostId: 'host-1', paneId: pane.pane_id } },
      },
    },
  };
  const notifications = {
    response,
    wasHandled: jest.fn(() => false),
    consume: jest.fn(),
  };
  const hosts = {
    closeEditor: jest.fn(),
    setError: jest.fn(),
  };
  const openPaneTerminal = jest.fn();
  let updateState!: (value: LiveHostSessionsState) => void;
  const emptyState: LiveHostSessionsState = { sessions: [], activeSessionId: null };
  const sessionState: LiveHostSessionsState = {
    sessions: [{
      id: 'host-1',
      hostId: 'host-1',
      host: {} as LiveHostSessionsState['sessions'][number]['host'],
      status: 'ready',
      connectionError: null,
      reconnectAttempt: 0,
      snapshot: {
        server: { running: true },
        focused_workspace_id: null,
        focused_tab_id: null,
        focused_pane_id: pane.pane_id,
        agents: [],
        workspaces: [],
        tabs: [],
        panes: [pane],
        layouts: [],
      },
      sync: {
        status: 'synced',
        generation: 1,
        connectionGeneration: 1,
        revision: 1,
        freshness: 'fresh',
        error: null,
        lastSyncedAt: null,
      },
      selection: { workspaceId: null, tabId: null, paneId: null },
    }],
    activeSessionId: 'host-1',
  };

  function Harness() {
    const [state, setState] = useState(emptyState);
    updateState = setState;
    useAgentNotificationNavigation({
      notifications,
      restoreComplete: true,
      state,
      stateRef: { current: state },
      hosts,
      openPaneTerminal,
    });
    return null;
  }

  act(() => { create(<Harness />); });
  expect(openPaneTerminal).not.toHaveBeenCalled();

  act(() => updateState(sessionState));
  expect(openPaneTerminal).toHaveBeenCalledWith('host-1', pane, true);
  expect(notifications.consume).toHaveBeenCalledWith('notification-1');
});
