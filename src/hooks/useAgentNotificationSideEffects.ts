import { useCallback, useEffect, useEffectEvent, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { RuntimeAgentStatusTransition } from 'react-native-whip-ssh';

import type { HostManagementController } from './useHostManagement';
import type { useAgentNotifications } from './useAgentNotifications';
import type { SessionRuntimeStore } from './sessionRuntimeTypes';
import type { LiveHostSessionsState } from '../liveHostSessions';
import {
  foregroundUsesBriefAlerts,
  isAgentNotificationTransition,
  tabNameForAgent,
} from '../lib/agentStatusEvents';
import {
  parseAgentNotificationTarget,
  resolveAgentNotificationTarget,
} from '../lib/notificationNavigation';
import { alertAgent, dismissAgentAlertsForPane } from '../services/alerts';
import { reportBackgroundFailure } from '../services/backgroundOperations';
import {
  defaultDevicePreferences,
  type AgentAlertLevel,
} from '../services/devicePreferences';
import { recordNetworkDiagnostic } from '../services/networkDiagnostics';
import type { HerdrSnapshot, PaneInfo } from '../types';

interface AgentStateChange {
  sessionId: string;
  snapshot: HerdrSnapshot;
  transitions: RuntimeAgentStatusTransition[];
}

export function useAgentNotificationSideEffects({
  alertsEnabled,
  monitoringPaused,
  agentAlertLevel,
  persistentAlertDurationSeconds,
  ttsEnabled,
}: {
  alertsEnabled: boolean;
  monitoringPaused: boolean;
  agentAlertLevel: AgentAlertLevel;
  persistentAlertDurationSeconds: number;
  ttsEnabled: boolean;
}) {
  const alertsEnabledRef = useRef(alertsEnabled);
  const monitoringPausedRef = useRef(monitoringPaused);
  const agentAlertLevelRef = useRef(defaultDevicePreferences.agentAlertLevel);
  const persistentAlertDurationSecondsRef = useRef(
    defaultDevicePreferences.persistentAlertDurationSeconds,
  );
  const ttsEnabledRef = useRef(ttsEnabled);
  alertsEnabledRef.current = alertsEnabled;
  monitoringPausedRef.current = monitoringPaused;
  agentAlertLevelRef.current = agentAlertLevel;
  persistentAlertDurationSecondsRef.current = persistentAlertDurationSeconds;
  ttsEnabledRef.current = ttsEnabled;

  return useCallback(
    ({
      sessionId,
      snapshot,
      transitions,
    }: AgentStateChange): void => {
      for (const transition of transitions) {
        const { paneId, previous } = transition;
        // Notifications are driven only by the Agent projection. Pane rows
        // can describe the same terminal with a stale or aggregated status.
        const agent = snapshot.agents.find(item => item.pane_id === paneId);
        const status = agent?.agent_status;
        // A new Agent run clears an older alert for the same Pane. Keep a
        // completion alert while the Agent settles in idle after completion.
        if (!status || status === 'working') {
          reportBackgroundFailure(
            dismissAgentAlertsForPane(sessionId, paneId),
            'pane-alert-dismiss',
          );
        }
        if (
          status &&
          agent &&
          !monitoringPausedRef.current &&
          alertsEnabledRef.current &&
          isAgentNotificationTransition(previous, status)
        ) {
          const delivery = agentAlertLevelRef.current === 'regular'
            ? 'regular'
            : foregroundUsesBriefAlerts(AppState.currentState === 'active')
              ? 'brief'
              : 'persistent';
          reportBackgroundFailure(
            alertAgent(
              agent,
              ttsEnabledRef.current,
              { hostId: sessionId, paneId },
              tabNameForAgent(agent, snapshot.tabs),
              delivery,
              persistentAlertDurationSecondsRef.current * 1_000,
            ),
            'agent-alert-schedule',
          );
        }
        recordNetworkDiagnostic('info', 'agent-status-state-change', {
          sessionId,
          paneId,
          status,
          previousStatus: transition.previous,
          revision: transition.revision,
        });
      }
    },
    [],
  );
}

export function useAgentNotificationNavigation({
  notifications,
  restoreComplete,
  state,
  stateRef,
  hosts,
  openPaneTerminal,
}: {
  notifications: ReturnType<typeof useAgentNotifications>;
  restoreComplete: boolean;
  /** Re-run resolution as host snapshots arrive after a notification tap. */
  state: LiveHostSessionsState;
  stateRef: SessionRuntimeStore['stateRef'];
  hosts: Pick<HostManagementController, 'closeEditor' | 'setError'>;
  openPaneTerminal: (
    sessionId: string,
    pane: PaneInfo,
    focusAgent?: boolean,
  ) => void;
}): void {
  const openNotificationTarget = useEffectEvent(() => {
    if (!notifications.response) return false;
    const target = parseAgentNotificationTarget(
      notifications.response,
      Notifications.DEFAULT_ACTION_IDENTIFIER,
    );
    if (!target || notifications.wasHandled(target.notificationId)) {
      return false;
    }
    const resolved = resolveAgentNotificationTarget(stateRef.current, target);
    if (!resolved) return false;
    hosts.closeEditor();
    hosts.setError(null);
    openPaneTerminal(resolved.sessionId, resolved.pane, true);
    notifications.consume(target.notificationId);
    return true;
  });

  useEffect(() => {
    if (!restoreComplete || !notifications.response) return;
    openNotificationTarget();
  }, [notifications.response, restoreComplete, state]);
}
