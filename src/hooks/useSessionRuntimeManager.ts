import {
  startTransition,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import type { TFunction } from 'i18next';
import {
  NativeAppCore,
  type AppCoreProjection,
  type HerdProjection,
  type HerdSessionMetadata,
} from 'react-native-whip-ssh';

import type { AppNavigationController } from './useAppNavigation';
import type { useAgentNotifications } from './useAgentNotifications';
import {
  useAgentNotificationNavigation,
  useAgentNotificationSideEffects,
} from './useAgentNotificationSideEffects';
import type { useApplicationSecurity } from './useApplicationSecurity';
import type { HostManagementController } from './useHostManagement';
import type { useLiveHostTelemetry } from './useLiveHostTelemetry';
import { useLiveHostMonitoring } from './useLiveHostMonitoring';
import { useSessionConnectionLifecycle } from './useSessionConnectionLifecycle';
import { useSessionRuntimeTelemetry } from './useSessionRuntimeTelemetry';
import { useSessionStartupRestore } from './useSessionStartupRestore';
import { useSessionTerminalLifecycle } from './useSessionTerminalLifecycle';
import { useDeviceLockState } from './useDeviceLockState';
import type { useTerminalSessions } from './useTerminalSessions';
import type { LoadState } from './useStartupStorage';
import type {
  ConnectOptions,
  LiveRuntime,
  SessionRuntimeStore,
} from './sessionRuntimeTypes';
import {
  captureAppCoreHostSnapshots,
  emptyLiveHostSessions,
  getActiveLiveHostSession,
  projectAppCoreSessions,
  type LiveHostSessionsState,
} from '../liveHostSessions';
import '../services/powerDiagnostics';
import {
  createRuntimeProjectionScheduler,
  publishRuntimeProjection,
  type RuntimeProjectionPriority,
} from '../lib/runtimeProjectionScheduler';
import { isPerformanceDiagnosticsEnabled, recordPerformanceDiagnostic, recordPerformanceDiagnosticDuration } from '../services/performanceTrace';
import type { TerminalRenderTarget } from '../lib/terminalRenderer';
import type { TabLaunchIntent } from '../lib/herdrCreationFlows';
import type { HerdrClient } from '../services/HerdrClient';
import type { StartupStorageSnapshot } from '../services/startupStorage';
import { dismissAgentAlerts } from '../services/alerts';
import { reportBackgroundFailure } from '../services/backgroundOperations';
import { resumeMonitoringAfterUnlock } from '../services/backgroundMonitoring';
import type {
  AgentAlertLevel,
  BackgroundPowerMode,
} from '../services/devicePreferences';
import type {
  AgentInfo,
  ConnectionProfile,
  HerdrSnapshot,
  HostProfile,
  PaneInfo,
} from '../types';

interface SessionRuntimeManagerOptions {
  startupStorage: LoadState<StartupStorageSnapshot>;
  deferredHydrationReady: boolean;
  preferencesLoaded: boolean;
  terminalHistoryLoaded: boolean;
  reopenTerminalOnLaunch: boolean;
  alertsEnabled: boolean;
  agentAlertLevel: AgentAlertLevel;
  persistentAlertDurationSeconds: number;
  ttsEnabled: boolean;
  isEink: boolean;
  backgroundPowerMode: BackgroundPowerMode;
  appAccessLocked: boolean;
  hostsVisible: boolean;
  t: TFunction;
  hosts: HostManagementController;
  navigation: AppNavigationController;
  security: ReturnType<typeof useApplicationSecurity>;
  notifications: ReturnType<typeof useAgentNotifications>;
  terminals: ReturnType<typeof useTerminalSessions>;
  telemetry: ReturnType<typeof useLiveHostTelemetry>;
}

export interface SessionRuntimeController {
  state: LiveHostSessionsState;
  activeSession: ReturnType<typeof getActiveLiveHostSession>;
  activeClient: HerdrClient | undefined;
  connectingHostIds: ReadonlySet<string>;
  restoreComplete: boolean;
  terminalTargets: TerminalRenderTarget[];
  herdView: (
    metadata: HerdSessionMetadata[],
    selectedHostId?: string,
    selectedWorkspaceId?: string,
  ) => HerdProjection;
  getState: () => LiveHostSessionsState;
  getClient: (sessionId: string) => HerdrClient | undefined;
  select: (sessionId: string, tab?: 'herd' | 'terminal') => void;
  connect: (
    profile: ConnectionProfile,
    options?: ConnectOptions,
  ) => Promise<boolean>;
  connectSavedHost: (host: HostProfile) => Promise<void>;
  close: (sessionId: string, recordDisconnect?: boolean) => Promise<void>;
  closeHostById: (hostId: string, recordDisconnect?: boolean) => Promise<void>;
  refresh: (sessionId: string) => Promise<void>;
  refreshSnapshot: (sessionId: string) => Promise<HerdrSnapshot | null>;
  exitTerminalToHerd: (sessionId: string) => void;
  activatePaneTerminal: (sessionId: string, pane: PaneInfo) => void;
  openPaneTerminal: (
    sessionId: string,
    pane: PaneInfo,
    focusAgent?: boolean,
  ) => void;
  openAgentTerminal: (sessionId: string, agent: AgentInfo) => void;
  openSshShell: (sessionId: string) => void;
  closeTerminal: (sessionId: string, terminalId: string) => void;
  selectWorkspace: (sessionId: string, workspaceId: string) => void;
  focusWorkspace: (sessionId: string, workspaceId: string) => Promise<void>;
  openWorkspace: (sessionId: string, workspaceId: string) => Promise<void>;
  createWorkspace: (
    sessionId: string,
    name: string,
    cwd: string,
  ) => Promise<HerdrSnapshot['workspaces'][number]>;
  renameWorkspace: (
    sessionId: string,
    workspaceId: string,
    name: string,
  ) => Promise<void>;
  closeWorkspace: (sessionId: string, workspaceId: string) => Promise<void>;
  closeTab: (sessionId: string, tabId: string) => Promise<void>;
  launchTab: (
    sessionId: string,
    workspaceId: string,
    tabName: string,
    launch: TabLaunchIntent,
  ) => Promise<void>;
  startServer: (sessionId: string) => Promise<void>;
}

/** Coordinates the independently-owned session runtime concerns. */
export function useSessionRuntimeManager({
  startupStorage,
  deferredHydrationReady,
  preferencesLoaded,
  terminalHistoryLoaded,
  reopenTerminalOnLaunch,
  alertsEnabled,
  agentAlertLevel,
  persistentAlertDurationSeconds,
  ttsEnabled,
  isEink,
  backgroundPowerMode,
  appAccessLocked,
  hostsVisible,
  t,
  hosts,
  navigation,
  security,
  notifications,
  terminals,
  telemetry,
}: SessionRuntimeManagerOptions): SessionRuntimeController {
  const [state, setState] = useState(emptyLiveHostSessions);
  const nativeDeviceLock = useDeviceLockState();
  const deviceLocked = !nativeDeviceLock.ready || nativeDeviceLock.locked;
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [resumeAllowed, setResumeAllowed] = useState(Platform.OS !== 'android');
  const [resumeRetryTick, setResumeRetryTick] = useState(0);
  const monitoringPaused = deviceLocked || !resumeAllowed;
  // Only commits update this ref: a stale render must never overwrite a synchronous refresh.
  const stateRef = useRef(state);
  const runtimesRef = useRef(new Map<string, LiveRuntime>());
  const appCoreRef = useRef(new NativeAppCore());
  const sessionProfilesRef = useRef(new Map<string, HostProfile>());
  const restoredTerminalHostIdsRef = useRef(new Set<string>());
  const suspendedHostIdsRef = useRef(new Set<string>());
  const monitoringPausedRef = useRef(monitoringPaused);
  const resumeInFlightRef = useRef(false);
  monitoringPausedRef.current = monitoringPaused;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      projectionSchedulerRef.current?.setActive(nextState === 'active');
      setAppActive(nextState === 'active');
    });
    return () => subscription.remove();
  }, []);
  const reportUnlockResumeError = useEffectEvent((error: unknown) => {
    hosts.setError(String(error));
  });
  useEffect(() => {
    if (deviceLocked) {
      setResumeAllowed(false);
      return;
    }
    if (!appActive) return;
    let cancelled = false;
    resumeMonitoringAfterUnlock().then(
      resumed => {
        if (!cancelled && resumed) setResumeAllowed(true);
      },
      resumeError => {
        if (!cancelled) reportUnlockResumeError(resumeError);
      },
    );
    return () => { cancelled = true; };
  }, [appActive, deviceLocked]);
  for (const host of hosts.getHosts()) {
    sessionProfilesRef.current.set(host.id, host);
  }
  const projectionSchedulerRef = useRef<ReturnType<typeof createRuntimeProjectionScheduler<AppCoreProjection>> | null>(null);
  const projectTerminalAppCore = terminals.projectAppCore;
  const commitAppCore = useCallback<SessionRuntimeStore['commitAppCore']>(
    view => {
      projectionSchedulerRef.current?.committed();
      const diagnosticStarted = isPerformanceDiagnosticsEnabled() ? performance.now() : null;
      const phase = AppState.currentState === 'active' ? 'foreground' : 'background';
      recordPerformanceDiagnostic(`runtime.projection.${phase}`);
      const hostSnapshots = captureAppCoreHostSnapshots(
        view,
        (sessionId, hostState) => {
          const runtime = runtimesRef.current.get(sessionId);
          if (!runtime) {
            throw new Error(
              `Rust AppCore projected host state without runtime ${sessionId}`,
            );
          }
          return runtime.client.snapshotFromHostState(hostState);
        },
      );
      projectTerminalAppCore(view);
      const next = projectAppCoreSessions(
        view,
        sessionProfilesRef.current,
        stateRef.current,
        hostSnapshots,
      );
      publishRuntimeProjection(stateRef, next, setState);
      if (diagnosticStarted !== null) recordPerformanceDiagnosticDuration(
        `runtime.projection.${phase}`, performance.now() - diagnosticStarted,
      );
    },
    [projectTerminalAppCore],
  );
  const projectRuntime = useCallback((existingView?: AppCoreProjection) => {
    if (existingView) { commitAppCore(existingView); return; }
    const phase = AppState.currentState === 'active' ? 'foreground' : 'background';
    const started = isPerformanceDiagnosticsEnabled() ? performance.now() : null;
    recordPerformanceDiagnostic(`runtime.view.${phase}`);
    const view = appCoreRef.current.view();
    if (started !== null) recordPerformanceDiagnosticDuration(
      `runtime.view.${phase}`, performance.now() - started,
    );
    commitAppCore(view);
  }, [commitAppCore]);
  const projectRuntimeRef = useRef(projectRuntime);
  projectRuntimeRef.current = projectRuntime;
  if (!projectionSchedulerRef.current) {
    projectionSchedulerRef.current = createRuntimeProjectionScheduler<AppCoreProjection>(
      (view, priority) => {
        // stateRef is still published synchronously inside the commit; only the
        // React render of frequent host-state updates yields to input.
        if (priority === 'transition') startTransition(() => projectRuntimeRef.current(view));
        else projectRuntimeRef.current(view);
      },
      AppState.currentState === 'active',
    );
  }
  const requestRuntimeProjection = useCallback((
    view?: AppCoreProjection,
    priority?: RuntimeProjectionPriority,
  ) => {
    projectionSchedulerRef.current!.request(view, priority);
  }, []);
  const refreshRuntimeProjection = useCallback(() => {
    projectionSchedulerRef.current!.setActive(AppState.currentState === 'active');
  }, []);
  terminals.bindAppCore(appCoreRef.current, commitAppCore, requestRuntimeProjection);
  const store: SessionRuntimeStore = {
    state,
    stateRef,
    runtimesRef,
    appCoreRef,
    sessionProfilesRef,
    commitAppCore,
    requestRuntimeProjection,
  };

  const handleAgentStateChange = useAgentNotificationSideEffects({
    alertsEnabled,
    monitoringPaused,
    agentAlertLevel,
    persistentAlertDurationSeconds,
    ttsEnabled,
  });
  const runtimeTelemetry = useSessionRuntimeTelemetry({
    runtimesRef,
    telemetry,
  });
  const connection = useSessionConnectionLifecycle({
    ...store,
    restoredTerminalHostIdsRef,
    alertsEnabled,
    monitoringPaused,
    hosts,
    navigation,
    security,
    terminals,
    clearLatency: runtimeTelemetry.clearLatency,
    handleAgentStateChange,
    handleLatencyMeasurement: runtimeTelemetry.handleLatencyMeasurement,
    handleRuntimeDiagnostic: runtimeTelemetry.handleRuntimeDiagnostic,
    handleReconnectRecovered: runtimeTelemetry.handleReconnectRecovered,
    t,
  });
  const restoreComplete = useSessionStartupRestore({
    state,
    stateRef,
    appCoreRef,
    sessionProfilesRef,
    commitAppCore,
    restoredTerminalHostIdsRef,
    startupStorage,
    deferredHydrationReady,
    preferencesLoaded,
    terminalHistoryLoaded,
    reopenTerminalOnLaunch,
    hosts,
    navigation,
    security,
    connect: connection.connect,
    t,
  });

  const handleDeviceLockLifecycle = useEffectEvent(async () => {
    if (monitoringPaused) {
      for (const session of stateRef.current.sessions) {
        suspendedHostIdsRef.current.add(session.hostId);
      }
      for (const sessionId of runtimesRef.current.keys()) {
        suspendedHostIdsRef.current.add(sessionId);
      }
      reportBackgroundFailure(dismissAgentAlerts(), 'device-lock-dismiss-alerts');
      await connection.pauseForDeviceLock();
      return;
    }
    if (
      !appActive ||
      !restoreComplete ||
      suspendedHostIdsRef.current.size === 0 ||
      resumeInFlightRef.current
    ) {
      return;
    }

    resumeInFlightRef.current = true;
    const suspendedHostIds = [...suspendedHostIdsRef.current];
    const activeSessionId = stateRef.current.activeSessionId;
    try {
      for (const hostId of suspendedHostIds) {
        if (monitoringPausedRef.current) return;
        const session = stateRef.current.sessions.find(item => item.hostId === hostId);
        if (!session) {
          suspendedHostIdsRef.current.delete(hostId);
          continue;
        }
        try {
          const profile = await hosts.loadProfileForConnection(session.host);
          if (!profile) {
            suspendedHostIdsRef.current.delete(hostId);
            continue;
          }
          if (monitoringPausedRef.current) return;
          const connected = await connection.connect(profile, {
            persistProfile: false,
            navigate: false,
            trackConnecting: true,
            activateSession: session.id === activeSessionId,
            reuseConnectingSession: true,
            recoverTransientFailure: true,
          });
          if (connected || !monitoringPausedRef.current) {
            suspendedHostIdsRef.current.delete(hostId);
          }
        } catch (resumeError) {
          if (!monitoringPausedRef.current) {
            suspendedHostIdsRef.current.delete(hostId);
          }
          hosts.setError(String(resumeError));
        }
      }
    } finally {
      resumeInFlightRef.current = false;
      if (
        !monitoringPausedRef.current &&
        AppState.currentState === 'active' &&
        suspendedHostIdsRef.current.size > 0
      ) {
        setResumeRetryTick(current => current + 1);
      }
    }
  });
  useEffect(() => {
    handleDeviceLockLifecycle().catch(reportUnlockResumeError);
  }, [
    appActive,
    monitoringPaused,
    resumeRetryTick,
    restoreComplete,
    state.sessions.length,
  ]);

  useLiveHostMonitoring({
    liveHostCount: state.sessions.length,
    alertsEnabled,
    monitoringPaused,
    restoreComplete,
    hostsVisible,
    appAccessLocked,
    isEink,
    backgroundPowerMode,
    setRuntimeMonitoringState: runtimeTelemetry.setMonitoringState,
    onBackgroundMonitoringError: monitoringError => {
      hosts.setError(
        t('app.backgroundUnavailable', { error: String(monitoringError) }),
      );
    },
  });

  const terminal = useSessionTerminalLifecycle({
    ...store,
    terminals,
    navigation,
    select: connection.select,
    scheduleReconnect: connection.scheduleReconnect,
    refreshSnapshot: connection.refreshSnapshot,
    t,
  });
  useAgentNotificationNavigation({
    notifications,
    restoreComplete,
    state,
    stateRef,
    hosts,
    openPaneTerminal: terminal.openPaneTerminal,
    refreshRuntimeProjection,
  });

  const activeSession = getActiveLiveHostSession(state);
  return useMemo(
    () => ({
      state,
      activeSession,
      activeClient: activeSession
        ? connection.getClient(activeSession.id)
        : undefined,
      connectingHostIds: connection.connectingHostIds,
      restoreComplete,
      terminalTargets: terminal.terminalTargets,
      herdView: (metadata, selectedHostId, selectedWorkspaceId) =>
        appCoreRef.current.herdView(
          metadata,
          selectedHostId,
          selectedWorkspaceId,
        ),
      getState: connection.getState,
      getClient: connection.getClient,
      select: connection.select,
      connect: connection.connect,
      connectSavedHost: connection.connectSavedHost,
      close: connection.close,
      closeHostById: connection.closeHostById,
      refresh: connection.refresh,
      refreshSnapshot: connection.refreshSnapshot,
      exitTerminalToHerd: terminal.exitTerminalToHerd,
      activatePaneTerminal: terminal.activatePaneTerminal,
      openPaneTerminal: terminal.openPaneTerminal,
      openAgentTerminal: terminal.openAgentTerminal,
      openSshShell: terminal.openSshShell,
      closeTerminal: terminal.closeTerminal,
      selectWorkspace: terminal.selectWorkspace,
      focusWorkspace: terminal.focusWorkspace,
      openWorkspace: terminal.openWorkspace,
      createWorkspace: terminal.createWorkspace,
      renameWorkspace: terminal.renameWorkspace,
      closeWorkspace: terminal.closeWorkspace,
      closeTab: terminal.closeTab,
      launchTab: terminal.launchTab,
      startServer: terminal.startServer,
    }),
    [activeSession, connection, restoreComplete, state, terminal],
  );
}
