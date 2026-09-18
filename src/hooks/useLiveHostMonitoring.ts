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

  useEffect(() => {
    if (!restoreComplete) return;
    const operation =
      alertsEnabled && liveHostCount > 0
        ? startBackgroundMonitoring(liveHostCount, backgroundPowerMode)
        : stopBackgroundMonitoring();
    operation.catch(reportBackgroundError);
  }, [alertsEnabled, backgroundPowerMode, liveHostCount, restoreComplete]);

  useEffect(() => {
    if (liveHostCount === 0) return;
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', state => {
      recordNetworkDiagnostic('info', 'app-state-changed', {
        from: previousState,
        to: state,
        liveHostCount,
      });
      previousState = state;
      if (state === 'active') {
        updateRuntimeMonitoring(true, hostsVisible, appAccessLocked, isEink);
      } else {
        updateRuntimeMonitoring(false, hostsVisible, appAccessLocked, isEink);
        reportBackgroundFailure(
          flushLatencyDiagnosticWrites(),
          'latency-diagnostics-flush',
        );
      }
    });
    updateRuntimeMonitoring(
      AppState.currentState === 'active',
      hostsVisible,
      appAccessLocked,
      isEink,
    );
    return () => {
      subscription.remove();
      updateRuntimeMonitoring(false, false, appAccessLocked, isEink);
    };
  }, [appAccessLocked, hostsVisible, isEink, liveHostCount]);

  useEffect(() => {
    updateRuntimeMonitoring(
      AppState.currentState === 'active',
      hostsVisible,
      appAccessLocked,
      isEink,
    );
  }, [appAccessLocked, hostsVisible, isEink, liveHostCount]);
}
