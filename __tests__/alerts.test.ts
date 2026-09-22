jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 'default', HIGH: 'high' },
  AndroidNotificationPriority: { DEFAULT: 'default', MAX: 'max' },
  dismissNotificationAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
}));
jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
}));
jest.mock('react-native', () => ({
  AppState: { currentState: 'active' },
  Platform: { OS: 'android' },
  Vibration: { vibrate: jest.fn() },
}));
jest.mock('../src/services/backgroundMonitoring', () => ({
  armPersistentAgentAlert: jest.fn(),
  dismissBackgroundAgentNotification: jest.fn(() => Promise.resolve()),
  dismissPersistentAgentAlert: jest.fn(),
  postBackgroundAgentNotification: jest.fn(() => Promise.resolve()),
}));
jest.mock('../src/i18n', () => ({
  __esModule: true,
  default: {
    resolvedLanguage: 'en',
    t: (key: string, options?: { name?: string; status?: string }) => {
      if (key === 'alerts.needsYou') return `${options?.name} needs you`;
      if (key === 'alerts.finished') return `${options?.name} finished`;
      if (key === 'alerts.agentState') return `Agent is ${options?.status}`;
      return key;
    },
  },
}));

import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';
import { AppState } from 'react-native';

import type { AgentInfo } from '../src/types';
import {
  alertAgent,
  dismissAgentAlerts,
  dismissAgentAlertsForPane,
  dismissAgentAlertsForTab,
  prepareAlerts,
} from '../src/services/alerts';
import {
  armPersistentAgentAlert,
  dismissBackgroundAgentNotification,
  dismissPersistentAgentAlert,
  postBackgroundAgentNotification,
} from '../src/services/backgroundMonitoring';

const agent: AgentInfo = {
  terminal_id: 'terminal-1',
  agent: 'codex',
  agent_status: 'blocked',
  workspace_id: 'workspace-1',
  tab_id: 'tab-1',
  pane_id: 'pane-1',
  focused: false,
  revision: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(Speech.stop).mockResolvedValue();
  jest.mocked(Notifications.scheduleNotificationAsync).mockResolvedValue('notification-1');
  jest.mocked(Notifications.dismissNotificationAsync).mockResolvedValue();
  jest.mocked(armPersistentAgentAlert).mockResolvedValue();
  jest.mocked(dismissBackgroundAgentNotification).mockResolvedValue();
  jest.mocked(dismissPersistentAgentAlert).mockResolvedValue();
  jest.mocked(postBackgroundAgentNotification).mockResolvedValue();
  (AppState as { currentState: string }).currentState = 'active';
});

test('delays the noisy notification and persistent alert until speech finishes', async () => {
  const pending = alertAgent(agent, true, {
    hostId: 'host-1',
    paneId: agent.pane_id,
  }, 'work');
  await Promise.resolve();
  await Promise.resolve();

  expect(Speech.stop).toHaveBeenCalledTimes(1);
  expect(Speech.speak).toHaveBeenCalledTimes(1);
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  expect(armPersistentAgentAlert).not.toHaveBeenCalled();

  const options = jest.mocked(Speech.speak).mock.calls[0][1];
  options?.onDone?.();
  await pending;

  expect(postBackgroundAgentNotification).toHaveBeenCalledWith(
    expect.stringMatching(/^agent-/),
    'work · codex needs you',
    'Agent is blocked',
    'agent-state-v3',
    'host-1',
    agent.pane_id,
    'persistent',
  );
  expect(armPersistentAgentAlert).toHaveBeenCalledWith(
    expect.stringMatching(/^agent-/),
    'agent-state-v3',
    30_000,
  );
});

test('posts the notification immediately when speech is disabled', async () => {
  await alertAgent(agent, false, {
    hostId: 'host-1',
    paneId: agent.pane_id,
  });

  expect(Speech.stop).not.toHaveBeenCalled();
  expect(Speech.speak).not.toHaveBeenCalled();
  expect(postBackgroundAgentNotification).toHaveBeenCalledTimes(1);
});

test('posts directly through Android while the app is backgrounded', async () => {
  (AppState as { currentState: string }).currentState = 'background';

  await alertAgent(agent, false, {
    hostId: 'host-1',
    paneId: agent.pane_id,
  }, 'work', 'persistent');

  expect(postBackgroundAgentNotification).toHaveBeenCalledWith(
    expect.stringMatching(/^agent-/),
    'work · codex needs you',
    'Agent is blocked',
    'agent-state-v3',
    'host-1',
    agent.pane_id,
    'persistent',
  );
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  expect(armPersistentAgentAlert).toHaveBeenCalledWith(
    expect.stringMatching(/^agent-/),
    'agent-state-v3',
    30_000,
  );
});

test('does not wait for speech before posting a background notification', async () => {
  (AppState as { currentState: string }).currentState = 'background';

  await alertAgent(agent, true, {
    hostId: 'host-1',
    paneId: agent.pane_id,
  }, 'work', 'persistent');

  expect(Speech.speak).not.toHaveBeenCalled();
  expect(postBackgroundAgentNotification).toHaveBeenCalledTimes(1);
});

test('uses the configured persistent alert timeout', async () => {
  await alertAgent(agent, false, {
    hostId: 'host-1',
    paneId: agent.pane_id,
  }, 'work', 'persistent', 45_000);

  expect(armPersistentAgentAlert).toHaveBeenCalledWith(
    expect.stringMatching(/^agent-/),
    'agent-state-v3',
    45_000,
  );
});

test('uses a short vibration without arming a persistent alert for a brief notification', async () => {
  await alertAgent(agent, false, {
    hostId: 'host-1',
    paneId: agent.pane_id,
  }, 'work', 'brief');

  expect(postBackgroundAgentNotification).toHaveBeenCalledWith(
    expect.stringMatching(/^agent-/),
    'work · codex needs you',
    'Agent is blocked',
    'agent-state-brief-v1',
    'host-1',
    agent.pane_id,
    'brief',
  );
  expect(armPersistentAgentAlert).not.toHaveBeenCalled();
});

test('uses the regular channel without custom sound, vibration, or persistent feedback', async () => {
  await alertAgent(agent, false, {
    hostId: 'host-1',
    paneId: agent.pane_id,
  }, 'work', 'regular');

  expect(postBackgroundAgentNotification).toHaveBeenCalledWith(
    expect.stringMatching(/^agent-/),
    'work · codex needs you',
    'Agent is blocked',
    'agent-state-regular-v1',
    'host-1',
    agent.pane_id,
    'regular',
  );
  expect(armPersistentAgentAlert).not.toHaveBeenCalled();
});

test('creates a default-importance channel for regular notifications', async () => {
  await prepareAlerts();

  expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
    'agent-state-regular-v1',
    {
      name: 'alerts.regularChannelName',
      importance: 'default',
    },
  );
});

test('still posts the alert when speech reports an error', async () => {
  const pending = alertAgent(agent, true, {
    hostId: 'host-1',
    paneId: agent.pane_id,
  });
  await Promise.resolve();
  await Promise.resolve();

  const options = jest.mocked(Speech.speak).mock.calls[0][1];
  options?.onError?.(new Error('TTS unavailable'));
  await pending;

  expect(postBackgroundAgentNotification).toHaveBeenCalledTimes(1);
});

test('dismisses delivered agent notifications and persistent feedback', async () => {
  await alertAgent(agent, false, {
    hostId: 'host-1',
    paneId: agent.pane_id,
  });

  await dismissAgentAlerts();

  expect(dismissBackgroundAgentNotification).toHaveBeenCalledWith(
    expect.stringMatching(/^agent-/),
  );
  expect(dismissPersistentAgentAlert).toHaveBeenCalledTimes(1);
  expect(Speech.stop).toHaveBeenCalledTimes(1);
});

test('dismisses an agent notification that finishes posting during foregrounding', async () => {
  let finishPosting: (() => void) | undefined;
  jest.mocked(postBackgroundAgentNotification).mockImplementationOnce(() => new Promise(resolve => {
    finishPosting = resolve;
  }));
  const pendingAlert = alertAgent(agent, false, {
    hostId: 'host-1',
    paneId: agent.pane_id,
  });
  await Promise.resolve();

  await dismissAgentAlerts();
  finishPosting?.();
  await pendingAlert;

  expect(dismissBackgroundAgentNotification).toHaveBeenCalledWith(
    expect.stringMatching(/^agent-/),
  );
  expect(armPersistentAgentAlert).not.toHaveBeenCalled();
});

test('cancels a native background alert that finishes posting after pane dismissal', async () => {
  (AppState as { currentState: string }).currentState = 'background';
  let finishPosting: (() => void) | undefined;
  jest.mocked(postBackgroundAgentNotification).mockImplementationOnce(
    () => new Promise(resolve => {
      finishPosting = resolve;
    }),
  );
  const pendingAlert = alertAgent(agent, false, {
    hostId: 'host-1',
    paneId: agent.pane_id,
  });

  await dismissAgentAlertsForPane('host-1', agent.pane_id);
  finishPosting?.();
  await pendingAlert;

  expect(dismissBackgroundAgentNotification).toHaveBeenCalledWith(
    expect.stringMatching(/^agent-/),
  );
  expect(armPersistentAgentAlert).not.toHaveBeenCalled();
});

test('dismisses only notifications for the tab being interacted with', async () => {
  await dismissAgentAlerts();
  jest.clearAllMocks();
  jest.mocked(postBackgroundAgentNotification)
    .mockResolvedValueOnce()
    .mockResolvedValueOnce();

  await alertAgent(agent, false, { hostId: 'host-1', paneId: agent.pane_id }, 'work', 'brief');
  await alertAgent(
    { ...agent, tab_id: 'tab-2', pane_id: 'pane-2' },
    false,
    { hostId: 'host-1', paneId: 'pane-2' },
    'review',
    'brief',
  );
  jest.mocked(Notifications.dismissNotificationAsync).mockClear();

  await dismissAgentAlertsForTab('host-1', 'tab-1');

  expect(dismissBackgroundAgentNotification).toHaveBeenCalledWith(
    expect.stringMatching(/^agent-/),
  );
  await dismissAgentAlerts();
});

test('cancels a matching tab alert that finishes posting during interaction', async () => {
  await dismissAgentAlerts();
  jest.clearAllMocks();
  let finishPosting: (() => void) | undefined;
  jest.mocked(postBackgroundAgentNotification).mockImplementationOnce(() => new Promise(resolve => {
    finishPosting = resolve;
  }));
  const pendingAlert = alertAgent(
    agent,
    false,
    { hostId: 'host-1', paneId: agent.pane_id },
    'work',
    'brief',
  );

  await dismissAgentAlertsForTab('host-1', agent.tab_id);
  finishPosting?.();
  await pendingAlert;

  expect(dismissBackgroundAgentNotification).toHaveBeenCalledWith(
    expect.stringMatching(/^agent-/),
  );
});

test('dismisses only the resolved pane alert when a tab has multiple agents', async () => {
  await dismissAgentAlerts();
  jest.clearAllMocks();
  jest.mocked(postBackgroundAgentNotification)
    .mockResolvedValueOnce()
    .mockResolvedValueOnce();

  await alertAgent(agent, false, { hostId: 'host-1', paneId: 'pane-1' }, 'work', 'brief');
  await alertAgent(
    { ...agent, pane_id: 'pane-2' },
    false,
    { hostId: 'host-1', paneId: 'pane-2' },
    'work',
    'brief',
  );
  jest.mocked(Notifications.dismissNotificationAsync).mockClear();

  await dismissAgentAlertsForPane('host-1', 'pane-1');

  expect(dismissBackgroundAgentNotification).toHaveBeenCalledWith(
    expect.stringMatching(/^agent-/),
  );
  await dismissAgentAlerts();
});

test('prevents a resolved pane alert from posting after speech finishes', async () => {
  await dismissAgentAlerts();
  jest.clearAllMocks();
  const pendingAlert = alertAgent(agent, true, {
    hostId: 'host-1',
    paneId: agent.pane_id,
  });
  await Promise.resolve();
  await Promise.resolve();

  const options = jest.mocked(Speech.speak).mock.calls[0][1];
  await dismissAgentAlertsForPane('host-1', agent.pane_id);
  options?.onStopped?.();
  await pendingAlert;

  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  expect(armPersistentAgentAlert).not.toHaveBeenCalled();
});

test('diagnoses notification initialization rejection', async () => {
  const consoleError = jest.spyOn(console, 'error').mockImplementation();
  jest.mocked(Notifications.setNotificationChannelAsync)
    .mockRejectedValueOnce(new Error('notification service unavailable'));

  await expect(prepareAlerts()).rejects.toThrow('notification service unavailable');

  expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('notification-setup-failed'));
  expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('android-channels'));
  consoleError.mockRestore();
});

test('waits for notification setup before posting the first alert', async () => {
  let finishSetup!: () => void;
  const setupFinished = new Promise<null>(resolve => {
    finishSetup = () => resolve(null);
  });
  jest.mocked(Notifications.setNotificationChannelAsync)
    .mockImplementationOnce(() => setupFinished);

  const setup = prepareAlerts();
  const alert = alertAgent(agent, false, {
    hostId: 'host-1',
    paneId: agent.pane_id,
  });
  await Promise.resolve();

  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();

  finishSetup();
  await setup;
  await alert;

  expect(postBackgroundAgentNotification).toHaveBeenCalledTimes(1);
});

test('keeps expected notification dismissal races quiet', async () => {
  const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
  await alertAgent(agent, false, {
    hostId: 'host-1',
    paneId: agent.pane_id,
  });
  jest.mocked(Notifications.dismissNotificationAsync).mockRejectedValueOnce(
    Object.assign(new Error('notification already dismissed'), {
      code: 'ERR_NOTIFICATION_NOT_FOUND',
    }),
  );

  await dismissAgentAlerts();

  expect(consoleWarn).not.toHaveBeenCalledWith(expect.stringContaining('notification-dismiss-failed'));
  consoleWarn.mockRestore();
});
