import { useEffect, useEffectEvent } from 'react';
import { AppState } from 'react-native';

import { flushLatencyDiagnosticWrites } from '../services/latencyDiagnostics';
import { reportBackgroundFailure } from '../services/backgroundOperations';
import { recordNetworkDiagnostic } from '../services/networkDiagnostics';
import type { BackgroundPowerMode } from '../services/devicePreferences';
import {
  startBackgroundMonitoring,
  stopBackgroundMonitoring,
} from '../services/backgroundMonitoring';

interface LiveHostMonitoringOptions {
  liveHostCount: number;
  alertsEnabled: boolean;
  restoreComplete: boolean;
  hostsVisible: boolean;
  appAccessLocked: boolean;
  isEink: boolean;
  backgroundPowerMode: BackgroundPowerMode;
  setRuntimeMonitoringState: (
    appActive: boolean,
    hostsVisible: boolean,
    accessLocked: boolean,
    isEink: boolean,
  ) => void;
  onBackgroundMonitoringError: (error: unknown) => void;
}

/** Forwards coarse platform lifecycle signals to Rust-owned runtime policy. */
export function useLiveHostMonitoring({
  liveHostCount,
  alertsEnabled,
  restoreComplete,
  hostsVisible,
  appAccessLocked,
  isEink,
  backgroundPowerMode,
  setRuntimeMonitoringState,
  onBackgroundMonitoringError,
}: LiveHostMonitoringOptions): void {
  const updateRuntimeMonitoring = useEffectEvent(setRuntimeMonitoringState);
  const reportBackgroundError = useEffectEvent(onBackgroundMonitoringError);
  const handleAppStateChange = useEffectEvent((state: string, previousState: string) => {
    if (liveHostCount === 0) return;
    recordNetworkDiagnostic('info', 'app-state-changed', {
      from: previousState,
      to: state,
      liveHostCount,
    });
    updateRuntimeMonitoring(state === 'active', hostsVisible, appAccessLocked, isEink);
    if (state !== 'active') {
      reportBackgroundFailure(flushLatencyDiagnosticWrites(), 'latency-diagnostics-flush');
    }
  });

  useEffect(() => {
    if (!restoreComplete) return;
    const operation =
      alertsEnabled && liveHostCount > 0
        ? startBackgroundMonitoring(liveHostCount, backgroundPowerMode)
        : stopBackgroundMonitoring();
    operation.catch(reportBackgroundError);
  }, [alertsEnabled, backgroundPowerMode, liveHostCount, restoreComplete]);

  useEffect(() => {
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', state => {
      if (state === previousState) return;
      handleAppStateChange(state, previousState);
      previousState = state;
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    updateRuntimeMonitoring(
      AppState.currentState === 'active',
      hostsVisible,
      appAccessLocked,
      isEink,
    );
  }, [appAccessLocked, hostsVisible, isEink, liveHostCount]);
}
