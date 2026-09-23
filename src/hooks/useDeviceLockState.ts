import { useEffect, useState } from 'react';
import { DeviceEventEmitter, Platform } from 'react-native';

import {
  DEVICE_LOCK_STATE_CHANGED_EVENT,
  getDeviceLockState,
} from '../services/backgroundMonitoring';

interface DeviceLockState {
  locked: boolean;
  ready: boolean;
}

const INITIAL_STATE: DeviceLockState = Platform.OS === 'android'
  ? { locked: true, ready: false }
  : { locked: false, ready: true };

/** Reads Android's keyguard state and follows screen lock/unlock broadcasts. */
export function useDeviceLockState(): DeviceLockState {
  const [state, setState] = useState(INITIAL_STATE);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    let receivedNativeEvent = false;
    const subscription = DeviceEventEmitter.addListener(
      DEVICE_LOCK_STATE_CHANGED_EVENT,
      (value: unknown) => {
        receivedNativeEvent = true;
        setState({ locked: value === true, ready: true });
      },
    );
    Promise.resolve().then(getDeviceLockState).then(
      locked => {
        if (!receivedNativeEvent) {
          setState({ locked: locked === true, ready: true });
        }
      },
      () => {
        if (!receivedNativeEvent) setState({ locked: false, ready: true });
      },
    );

    return () => subscription.remove();
  }, []);

  return state;
}
