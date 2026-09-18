jest.mock('react-native', () => ({
  NativeModules: {
    HerdrBackground: {
      start: jest.fn(() => Promise.resolve()),
      stop: jest.fn(() => Promise.resolve()),
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
} from '../src/services/backgroundMonitoring';

const native = NativeModules.HerdrBackground as {
  start: jest.Mock;
  stop: jest.Mock;
};

beforeEach(() => {
  native.start.mockClear();
  native.stop.mockClear();
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
