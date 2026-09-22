jest.mock('react-native', () => ({
  NativeModules: {
    HerdrBackground: {
      start: jest.fn(() => Promise.resolve()),
      stop: jest.fn(() => Promise.resolve()),
      updateHostStatus: jest.fn(),
      removeHostStatus: jest.fn(),
      postAgentNotification: jest.fn(() => Promise.resolve()),
      dismissAgentNotification: jest.fn(() => Promise.resolve()),
      getInitialAgentNotificationTarget: jest.fn(() => Promise.resolve(null)),
      armPersistentAlert: jest.fn(() => Promise.resolve()),
      dismissPersistentAlert: jest.fn(() => Promise.resolve()),
    },
  },
  Platform: { OS: 'android' },
}));

import { NativeModules } from 'react-native';

import {
  startBackgroundMonitoring,
  stopBackgroundMonitoring,
  updateBackgroundHostStatus,
  removeBackgroundHostStatus,
} from '../src/services/backgroundMonitoring';

const native = NativeModules.HerdrBackground as {
  start: jest.Mock;
  stop: jest.Mock;
  updateHostStatus: jest.Mock;
  removeHostStatus: jest.Mock;
  postAgentNotification: jest.Mock;
  dismissAgentNotification: jest.Mock;
  getInitialAgentNotificationTarget: jest.Mock;
};

beforeEach(() => {
  native.start.mockClear();
  native.stop.mockClear();
  native.updateHostStatus.mockClear();
  native.removeHostStatus.mockClear();
});

test('starts Android monitoring with the typed effective power mode', async () => {
  await startBackgroundMonitoring(2.8, 'balanced');
  expect(native.start).toHaveBeenCalledWith(2, 'balanced');

  await startBackgroundMonitoring(1, 'realtime');
  expect(native.start).toHaveBeenLastCalledWith(1, 'realtime');
});

test('stops monitoring through the shared service without choosing speech ownership', async () => {
  await stopBackgroundMonitoring();
  expect(native.stop).toHaveBeenCalledTimes(1);
});

test('health updates do not cross the bridge for a static notification', () => {
  updateBackgroundHostStatus('session-1', 'connected', 'connection');
  updateBackgroundHostStatus('session-1', '', 'heartbeat');
  removeBackgroundHostStatus('session-1');
  expect(native.updateHostStatus).not.toHaveBeenCalled();
  expect(native.removeHostStatus).not.toHaveBeenCalled();
});
