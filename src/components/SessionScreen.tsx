import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Bot,
  ChevronLeft,
  Globe2,
  Layers3,
  PanelRightOpen,
  PanelTop,
  Plus,
  SquareTerminal,
  Trash2,
  X,
} from 'lucide-react-native';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Platform,
  ScrollView,
  View,
  type TextInput as TextInputHandle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import WebView from 'react-native-webview';
import {
  terminalControlBarInset,
  SESSION_WORKSPACE_BAR_HEIGHT,
  terminalSessionChromeHeight,
} from '@/src/lib/floatingChrome';
import { useDisplayAnimationType, useDisplayProfile } from '@/src/lib/displayProfile';
import { runWithInFlightGuard } from '@/src/lib/inFlightSubmission';
import { cn } from '@/src/lib/utils';
import {
  activateCreatedTabLocally,
  includePendingCreatedSelection,
  reconcilePendingCreatedSelection,
  serverFocusMatchesPendingPane,
  shouldFollowServerTerminalFocus,
  type CreatedTabFocusResult,
} from '@/src/lib/terminalFocus';
import { terminalWebLinkTarget } from '@/src/lib/terminalLinks';
import {
  resolveTranscriptFilePath,
  type TranscriptFileLinkTarget,
} from '@/src/lib/transcriptLinks';
import type { TerminalRenderTarget } from '@/src/lib/terminalRenderer';
import { TerminalResidencyEndReason, type TerminalResidencyEnd } from '../lib/terminalResidency';
import {
  resolveTerminalVolumeKeyAction,
  type TerminalVolumeKey,
} from '@/src/lib/volumeKeys';
import type {
  TerminalControlId,
  TerminalControlUsage,
} from '../lib/terminalControls';
import {
  activePaneForTerminal,
  agentChatControlState,
  chatAgentForPane,
  chatAgentDisplayName,
} from '../lib/agentChatSession';
import {
  AgentChatPresentationPhase,
  chatPresentationLoading,
  chatPresentationMountsViewport,
  chatPresentationRequested,
  chatPresentationVisible,
  closeChatPresentation,
  dormantChatPresentation,
  requestChatPresentation,
  revealPreparedChat,
  updateChatTranscriptReadiness,
  type AgentChatPresentation,
} from '../lib/agentChatPresentation';
import {
  reconcileAgentChatViews,
  chatBindingLost,
  confirmedChatExit,
  type AgentChatViewState,
} from '../lib/agentChatReconciliation';
import { useAgentChatOpen } from '../hooks/useAgentChatOpen';
import { useFocusedChatSpeech } from '../hooks/useFocusedChatSpeech';
import type { AgentChatState } from '../agentChat';
import type { HerdrClient } from '../services/HerdrClient';
import {
  agentTranscriptReadiness,
  agentTranscriptService,
  type AgentChatProjection,
} from '../services/NativeTranscriptService';
import {
  agentChatDiagnosticToken,
  recordAgentChatDiagnostic,
} from '../services/agentChatDiagnostics';
import { terminalTabSelectionStarted } from '../services/performanceTrace';
import {
  bestEffortCleanup,
  reportBackgroundFailure,
} from '../services/backgroundOperations';
import type { TerminalSessionsState } from '../terminalSessions';
import type { TerminalSessionStatus } from '../terminalSessions';
import type { TerminalPreferences } from '../services/devicePreferences';
import { addTerminalVolumeKeyListener } from '../services/volumeKeys';
import {
  sessionTabGlassStyle,
  sessionAgentRailStyle,
  sessionTabStatusColor,
  statusColor,
  useTheme,
} from '../theme';
import {
  orderSessionPanes,
  orderSessionTabs,
  orderSessionWorkspaces,
  SessionFocusQueue,
  paneAgentLabel,
  paneLabel,
  paneNavigationLabel,
  createSessionSelectionMemory,
  pruneSessionSelectionMemory,
  rememberSessionWorkspace,
  rememberSessionPane,
  rememberSessionTab,
  restoreSessionPaneId,
  restoreSessionWorkspaceId,
  restoreSessionTabId,
  sessionPaneGroup,
  sessionPaneAgentColor,
  type SessionSelectionMemory,
} from '../lib/sessionNavigation';
import type { HerdrSnapshot, PaneInfo, TabInfo, WorkspaceInfo } from '../types';
import { recordNetworkDiagnostic } from '../services/networkDiagnostics';
import { AnimatedAgentStatusGlyph, hapticPress } from './app-ui';
import { AgentIdentityWarningSheet } from './AgentIdentityWarningSheet';
import { AppAlertPopup, type AppAlertContent } from './AppAlertPopup';
import { ConfirmationPopup } from './ConfirmationPopup';
import { AppBackground } from './AppBackground';
import {
  AttachmentPasteSheet,
  type PastedAttachment,
} from './AttachmentPasteSheet';
import { AgentIntegrationInstallSheet } from './AgentIntegrationInstallSheet';
import {
  ResourceEditorField,
  ResourceEditorSheet,
} from './ResourceEditorSheet';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { Text } from './ui/text';
import { TerminalBackground, TerminalScreen } from './TerminalScreen';
import { AgentChatView } from './AgentChatView';
import { useAppGlassEnabled } from './GlassSurface';

interface Props {
  hostSessionId: string;
  visible: boolean;
  ttsEnabled: boolean;
  snapshot: HerdrSnapshot;
  client: HerdrClient;
  terminalState: TerminalSessionsState;
  terminalTargets: readonly TerminalRenderTarget[];
  appBackgroundImageUri: string | null;
  appBackgroundDimming: number;
  latencyMs: number | null;
  latencyWarningActive: boolean;
  onRefresh: () => Promise<void>;
  onOpenPane: (pane: PaneInfo) => void;
  onActivateTerminal: (pane: PaneInfo) => void;
  onCloseTerminal: (terminalId: string) => void;
  onTerminalStatus: (
    hostSessionId: string,
    terminalId: string,
    status: TerminalSessionStatus,
    error?: string,
    reconnectAttempt?: number,
  ) => void;
  onTerminalFontSizeChange: (
    hostSessionId: string,
    terminalId: string,
    fontSize: number,
  ) => void;
  terminalPreferences: TerminalPreferences;
  terminalControlUsage: TerminalControlUsage;
  terminalHistory: readonly string[];
  onOpenFiles: (terminalId: string, target?: TranscriptFileLinkTarget) => void;
  getComposerDraft: (terminalId: string) => string;
  onComposerDraftChange: (terminalId: string, value: string) => void;
  onTerminalControlUse: (control: TerminalControlId) => void;
  onTerminalHistoryEntry: (entry: string) => void;
  onTerminalOpenLinksInAppChange: (value: boolean) => void;
  onInteraction: (tabId: string) => void;
  onExit: () => void;
}

type EditorMode = 'workspace' | 'tab' | 'rename-tab' | 'rename-pane';
type PendingFocus = {
  previousId: string | null;
};

type PendingResourceClose =
  | { kind: 'tab'; item: TabInfo }
  | { kind: 'pane'; item: PaneInfo };

interface BrowserWebViewHandle {
  goBack: () => void;
}

const BROWSER_WEBVIEW_STYLE = { flex: 1 } as const;

export function SessionScreen({
  hostSessionId,
  visible,
  ttsEnabled,
  snapshot,
  client,
  terminalState,
  terminalTargets,
  appBackgroundImageUri,
  appBackgroundDimming,
  latencyMs,
  latencyWarningActive,
  onRefresh,
  onActivateTerminal,
  onCloseTerminal,
  onTerminalStatus,
  onTerminalFontSizeChange,
  terminalPreferences,
  terminalControlUsage,
  terminalHistory,
  onOpenFiles,
  getComposerDraft,
  onComposerDraftChange,
  onTerminalControlUse,
  onTerminalHistoryEntry,
  onTerminalOpenLinksInAppChange,
  onInteraction,
  onExit,
}: Props) {
  const { colors } = useTheme();
  const { isEink, isTablet } = useDisplayProfile();
  const animationType = useDisplayAnimationType('slide');
  const { t } = useTranslation();
  const appGlassEnabled = useAppGlassEnabled();
  const safeAreaInsets = useSafeAreaInsets();
  const focusedWorkspace =
    snapshot.workspaces.find(item => item.focused) || snapshot.workspaces[0];
  const [workspaceId, setWorkspaceId] = useState(
    focusedWorkspace?.workspace_id || '',
  );
  const [tabId, setTabId] = useState(focusedWorkspace?.active_tab_id || '');
  const initialPane = snapshot.panes.find(
    pane => pane.tab_id === focusedWorkspace?.active_tab_id && pane.focused,
  ) || snapshot.panes.find(
    pane => pane.tab_id === focusedWorkspace?.active_tab_id,
  );
  const [paneId, setPaneId] = useState(initialPane?.pane_id || '');
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const [pendingCreatedSelection, setPendingCreatedSelection] =
    useState<CreatedTabFocusResult | null>(null);
  const [pendingCreatedWorkspace, setPendingCreatedWorkspace] = useState<WorkspaceInfo | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null);
  const [editingPaneId, setEditingPaneId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [workspaceCwd, setWorkspaceCwd] = useState('');
  const workspaceCwdInputRef = useRef<TextInputHandle | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingResourceClose, setPendingResourceClose] =
    useState<PendingResourceClose | null>(null);
  const [terminalSessionChromeBottom, setTerminalSessionChromeBottom] = useState(
    terminalControlBarInset(safeAreaInsets.bottom),
  );
  const [terminalSessionChromeVisible, setTerminalSessionChromeVisible] =
    useState(true);
  const [appAlert, setAppAlert] = useState<AppAlertContent | null>(null);
  const [linkScanRequest, setLinkScanRequest] = useState(0);
  const [linksOpen, setLinksOpen] = useState(false);
  const [terminalLinks, setTerminalLinks] = useState<string[]>([]);
  const [linksBusy, setLinksBusy] = useState(false);
  const [linksError, setLinksError] = useState<string | null>(null);
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  const [browserDisplayUrl, setBrowserDisplayUrl] = useState('');
  const [browserCanGoBack, setBrowserCanGoBack] = useState(false);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [attachmentTerminalId, setAttachmentTerminalId] = useState<
    string | null
  >(null);
  const [chatViews, setChatViews] = useState(
    () => new Map<string, AgentChatViewState>(),
  );
  const [appActive, setAppActive] = useState(() => AppState.currentState !== 'background');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setAppActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  const [pasteRequest, setPasteRequest] = useState<{
    id: number;
    terminalId: string;
    text: string;
    previewUri: string | null;
    dispose: () => void;
  } | null>(null);
  const browserWebView = useRef<BrowserWebViewHandle | null>(null);
  const tunnelPreviewRef = useRef<string | null>(null);
  const browserRequestRef = useRef(0);
  const pendingPaneFocus = useRef<string | null>(null);
  // A local click owns selection until the server snapshot confirms the same
  // workspace/tab/pane. This prevents an older server focus from pulling an
  // empty tab back to the previously active terminal.
  const localSelectionRef = useRef<{
    workspaceId: string;
    tabId: string;
    paneId: string | null;
  } | null>(null);
  // Keep the two selection relationships independent: a workspace remembers a
  // tab, and a tab remembers a pane. A pane must never be restored merely
  // because it happened to be selected in another tab. The outer key also
  // prevents identical resource ids from leaking across hosts during a fast
  // host switch.
  const selectionMemoryByHost = useRef(
    new Map<string, SessionSelectionMemory>(),
  );
  const selectionMemory =
    selectionMemoryByHost.current.get(hostSessionId) || (() => {
      const memory = createSessionSelectionMemory();
      selectionMemoryByHost.current.set(hostSessionId, memory);
      return memory;
    })();
  const focusRequestSerial = useRef(0);
  const focusRequestQueue = useRef(new SessionFocusQueue(error => {
    recordNetworkDiagnostic('error', 'session-focus-queue', { error: String(error) });
  }));
  const lastActivePaneId = useRef<string | null>(null);
  const pendingFocus = useRef<PendingFocus | null>(null);
  const chatViewsRef = useRef(chatViews);
  // Eviction drops hydrated resources, but keeps Chat-mode intent during restore.
  // This holds only transcript identities, never a second residency/capacity policy.
  const [chatRestoreIntents, setChatRestoreIntents] = useState(new Map<string, string>());
  const chatRestoreIntentsRef = useRef(chatRestoreIntents);
  chatRestoreIntentsRef.current = chatRestoreIntents;
  const activeTerminalIdRef = useRef(terminalState.activeTerminalId);
  const chatPresentationGenerationRef = useRef(0);
  const lastActiveChatDiagnosticRef = useRef('');
  const reportedChatFailureGenerationsRef = useRef(new Set<number>());
  const mutationInFlight = useRef(false);

  const nextChatPresentationGeneration = useCallback(() => {
    chatPresentationGenerationRef.current += 1;
    return chatPresentationGenerationRef.current;
  }, []);

  const requestedChatPresentation = useCallback(
    (state: AgentChatState) =>
      requestChatPresentation(
        dormantChatPresentation(),
        agentTranscriptReadiness(state),
        nextChatPresentationGeneration(),
      ),
    [nextChatPresentationGeneration],
  );

  activeTerminalIdRef.current = terminalState.activeTerminalId;

  const showAppAlert = useCallback((title: string, error: unknown) => {
    setAppAlert({ title, message: String(error) });
  }, []);

  const showHerdrError = useCallback(
    (error: unknown) => {
      showAppAlert(t('herd.commandFailed'), error);
    },
    [showAppAlert, t],
  );

  const workspaces = useMemo(() => orderSessionWorkspaces(
    pendingCreatedWorkspace && !snapshot.workspaces.some(item => item.workspace_id === pendingCreatedWorkspace.workspace_id)
      ? [...snapshot.workspaces, pendingCreatedWorkspace]
      : snapshot.workspaces,
  ), [pendingCreatedWorkspace, snapshot.workspaces]);
  const workspace =
    workspaces.find(item => item.workspace_id === workspaceId) ||
    focusedWorkspace;
  const selectableResources = useMemo(() => includePendingCreatedSelection(
    snapshot, pendingCreatedSelection,
  ), [snapshot, pendingCreatedSelection]);
  const tabs = orderSessionTabs(
    selectableResources.tabs.filter(
      item => item.workspace_id === workspace?.workspace_id,
    ),
  );
  const selectedTab =
    tabs.find(item => item.tab_id === tabId) ||
    tabs.find(item => item.tab_id === workspace?.active_tab_id) ||
    tabs.find(item => item.focused) ||
    tabs[0];
  const editorTitle =
    editorMode === 'workspace'
      ? t('rail.newWorkspace')
      : editorMode === 'rename-tab'
      ? t('session.renameTab')
      : editorMode === 'rename-pane'
      ? t('session.renamePane')
      : t('session.newTab');
  const editorContext =
    editorMode === 'workspace'
      ? undefined
      : editorMode === 'rename-pane'
      ? selectedTab?.label || selectedTab?.tab_id
      : workspace?.label || workspace?.workspace_id;
  const panes = orderSessionPanes(selectableResources.panes.filter(
    item => item.tab_id === selectedTab?.tab_id,
  ));
  const sessionChromeInset = terminalSessionChromeHeight(panes.length, Boolean(workspace))
    + (!workspace && snapshot.server.running ? SESSION_WORKSPACE_BAR_HEIGHT : 0);
  const serverWorkspace =
    snapshot.workspaces.find(item => item.focused) || snapshot.workspaces[0];
  const serverTab =
    snapshot.tabs.find(
      item =>
        item.workspace_id === serverWorkspace?.workspace_id &&
        item.tab_id === serverWorkspace.active_tab_id,
    ) ||
    snapshot.tabs.find(
      item =>
        item.workspace_id === serverWorkspace?.workspace_id && item.focused,
    );
  const serverPane =
    snapshot.panes.find(
      item => item.tab_id === serverTab?.tab_id && item.focused,
    ) || snapshot.panes.find(item => item.tab_id === serverTab?.tab_id);
  const serverWorkspaceId = serverWorkspace?.workspace_id || '';
  const serverTabId = serverTab?.tab_id || '';
  const serverPaneId = serverPane?.pane_id || '';
  const pendingCreatedPaneId =
    pendingCreatedSelection?.tab.workspace_id === workspaceId &&
    pendingCreatedSelection.tab.tab_id === tabId
      ? pendingCreatedSelection.root_pane.pane_id
      : null;
  const selectedPane =
    panes.find(item => item.pane_id === paneId) ||
    panes.find(item => item.terminal_id === terminalState.activeTerminalId) ||
    panes.find(item => item.focused) ||
    panes[0];
  const activeTerminalCandidate = terminalState.sessions.find(
    session => session.terminalId === terminalState.activeTerminalId,
  );
  const activeCandidatePane = snapshot.panes.find(
    item => item.pane_id === activeTerminalCandidate?.paneId,
  );
  const activeCandidateInScope =
    activeCandidatePane?.workspace_id === workspace?.workspace_id &&
    activeCandidatePane?.tab_id === selectedTab?.tab_id;
  const pendingSelectedTerminalId = pendingPaneFocus.current && selectedPane
    ? selectedPane.terminal_id
    : null;
  // A global active terminal is usable only when it is in the selected
  // workspace/tab, or when its pane is not in the delayed snapshot yet. An
  // empty selected tab never falls back to an unrelated active terminal.
  const selectedTerminalId = pendingSelectedTerminalId || (
    activeTerminalCandidate && panes.length > 0 &&
    (activeCandidateInScope || !activeCandidatePane)
      ? activeTerminalCandidate.terminalId
      : null
  );
  const activeTerminalSession = terminalState.sessions.find(
    session => session.terminalId === selectedTerminalId,
  );
  const activePane = activePaneForTerminal(
    selectableResources.panes,
    terminalState.sessions,
    selectedTerminalId,
  );
  const activeTarget =
    selectedTerminalId && terminalTargets.find(
      target =>
        target.hostSessionId === hostSessionId &&
        target.session.terminalId === selectedTerminalId,
    ) || null;
  const activeChatView = activeTarget
    ? chatViews.get(activeTarget.key) || null
    : null;
  const chatOpen = useAgentChatOpen({
    hostSessionId,
    terminalId: terminalState.activeTerminalId,
    pane: activePane,
    visible,
    client,
    onRefresh,
    onBound: projection => {
      const presentation = requestedChatPresentation(projection.state);
      if (!activeTarget) return;
      setChatViews(current => new Map(current).set(activeTarget.key, {
        binding: projection.binding, presentation, state: projection.state,
      }));
    },
  });
  const cancelChatOpen = chatOpen.cancel;
  const pendingChatOpenTerminalId = chatOpen.pendingTerminalId;
  const visibleAppAlert = appAlert || (chatOpen.notice?.type === 'error' ? chatOpen.notice : null);
  const restoringChat = Boolean(activeTarget && chatRestoreIntents.has(activeTarget.key));
  const chatControlLoading =
    (restoringChat &&
      !chatPresentationVisible(activeChatView?.presentation)) ||
    chatPresentationLoading(activeChatView?.presentation) ||
    pendingChatOpenTerminalId === activeTerminalSession?.terminalId;
  const activeChatControl = agentChatControlState(
    activePane,
    busy,
    chatControlLoading,
  );
  const followServerFocus = shouldFollowServerTerminalFocus(
    visible,
    activePane?.pane_id || null,
  );
  const chatVisible = chatPresentationVisible(activeChatView?.presentation) || restoringChat;
  const onChatSpeechError = useCallback((error: unknown) => {
    setAppAlert({ title: 'Could not read chat aloud', message: String(error) });
  }, []);
  useFocusedChatSpeech(
    visible && activeChatView && chatPresentationVisible(activeChatView.presentation) && activePane
      ? {
          agent: activeChatView.binding.agent,
          bindingToken: activeChatView.binding.bindingToken,
          hostId: hostSessionId,
          paneId: activePane.pane_id,
          label: chatAgentDisplayName(activeChatView.binding.agent),
        }
      : null,
    ttsEnabled,
    onChatSpeechError,
  );
  const chatViewportMounted = Boolean(
    activeChatView &&
      chatPresentationMountsViewport(activeChatView.presentation) &&
      agentTranscriptReadiness(activeChatView.state) === 'usable',
  );
  const mountedChatViews = [...chatViews.entries()].filter(([, view]) =>
    chatPresentationMountsViewport(view.presentation) &&
    agentTranscriptReadiness(view.state) === 'usable',
  );
  const chatSubscriptionIdentity = [...chatViews.entries()]
    .map(([key, view]) =>
      [key, view.binding.bindingToken, view.presentation.generation].join(':'),
    )
    .sort()
    .join('|');
  chatViewsRef.current = chatViews;

  useEffect(() => {
    if (!activeTerminalSession) return;
    const details = {
      agent: activeChatView?.binding.agent ?? activeChatControl?.agent,
      bindingToken: activeChatView
        ? agentChatDiagnosticToken(activeChatView.binding.bindingToken)
        : null,
      paneId: activePane?.pane_id,
      pendingOpen:
        pendingChatOpenTerminalId === activeTerminalSession.terminalId,
      phase: activeChatView?.presentation.phase ?? null,
      state: activeChatView?.state.status ?? null,
      stateRevision: activeChatView?.state.revision,
      terminalId: activeTerminalSession.terminalId,
      viewportMounted: chatViewportMounted,
      visible: chatVisible,
    };
    const fingerprint = JSON.stringify(details);
    if (lastActiveChatDiagnosticRef.current === fingerprint) return;
    lastActiveChatDiagnosticRef.current = fingerprint;
    recordAgentChatDiagnostic('active-presentation-projected', details);
  }, [
    activeChatControl?.agent,
    activeChatView,
    activePane?.pane_id,
    activeTerminalSession,
    chatViewportMounted,
    chatVisible,
    pendingChatOpenTerminalId,
  ]);
  const registerInteraction = (
    target: TerminalRenderTarget | null = activeTarget,
  ) => {
    if (!target || target.session.kind === 'ssh') return;
    const pane = selectableResources.panes.find(
      item => item.pane_id === target.session.paneId,
    );
    const interactionTabId = pane?.tab_id || selectedTab?.tab_id;
    if (interactionTabId) onInteraction(interactionTabId);
  };

  const closeActiveTunnel = () => {
    const previewId = tunnelPreviewRef.current;
    tunnelPreviewRef.current = null;
    if (previewId !== null) {
      bestEffortCleanup(
        client.native.stopPreview(previewId),
        'web-tunnel-close',
      );
    }
  };

  const scanTerminalLinks = () => {
    browserRequestRef.current += 1;
    setLinksOpen(true);
    setBrowserUrl(null);
    setTerminalLinks([]);
    setLinksError(null);
    setLinksBusy(true);
    closeActiveTunnel();
    setLinkScanRequest(value => value + 1);
  };

  const dismissLinks = () => {
    browserRequestRef.current += 1;
    setLinksOpen(false);
    setBrowserUrl(null);
    setBrowserCanGoBack(false);
    closeActiveTunnel();
  };

  const leaveBrowser = () => {
    browserRequestRef.current += 1;
    setBrowserUrl(null);
    setBrowserCanGoBack(false);
    setBrowserLoading(false);
    closeActiveTunnel();
  };

  const openTerminalLink = async (value: string) => {
    const request = ++browserRequestRef.current;
    setLinksBusy(true);
    setLinksError(null);
    try {
      closeActiveTunnel();
      const target = terminalWebLinkTarget(value);
      if (!terminalPreferences.openLinksInApp) {
        await Linking.openURL(target.url);
        return;
      }
      const tunnel = target.requiresSshTunnel
        ? await client.native.startWebPreview(target.url)
        : null;
      if (request !== browserRequestRef.current) {
        if (tunnel) {
          bestEffortCleanup(
            client.native.stopPreview(tunnel.id),
            'stale-web-tunnel-close',
          );
        }
        return;
      }
      if (tunnel) tunnelPreviewRef.current = tunnel.id;
      setBrowserDisplayUrl(target.url);
      setBrowserUrl(tunnel?.url || target.url);
      setBrowserCanGoBack(false);
      setBrowserLoading(true);
    } catch (reason) {
      if (request === browserRequestRef.current) setLinksError(String(reason));
    } finally {
      if (request === browserRequestRef.current) setLinksBusy(false);
    }
  };

  useEffect(
    () => () => {
      browserRequestRef.current += 1;
      const previewId = tunnelPreviewRef.current;
      tunnelPreviewRef.current = null;
      if (previewId !== null) {
        bestEffortCleanup(
          client.native.stopPreview(previewId),
          'web-tunnel-unmount',
        );
      }
    },
    [client],
  );

  const activateRestoredPane = useEffectEvent((pane: PaneInfo) => onActivateTerminal(pane));

  useEffect(() => {
    pendingPaneFocus.current = null;
    localSelectionRef.current = null;
    focusRequestSerial.current += 1;
    // A stalled request to the previous host must not block this host's focus.
    focusRequestQueue.current.clear();
    focusRequestQueue.current = new SessionFocusQueue(error => {
      recordNetworkDiagnostic('error', 'session-focus-queue', { error: String(error) });
    });
    lastActivePaneId.current = null;
    pendingFocus.current = null;
    setPendingCreatedSelection(null);
    setPendingCreatedWorkspace(null);
    browserRequestRef.current += 1;
    setEditorMode(null);
    setEditingPaneId(null);
    setAppAlert(null);
    setLinksOpen(false);
    setBrowserUrl(null);
    setBrowserCanGoBack(false);
    setBrowserLoading(false);
    setAttachmentsOpen(false);
    setPasteRequest(null);
    const nextSelectionMemory =
      selectionMemoryByHost.current.get(hostSessionId) ||
      createSessionSelectionMemory();
    selectionMemoryByHost.current.set(hostSessionId, nextSelectionMemory);
    const currentSnapshot = snapshotRef.current;
    pruneSessionSelectionMemory(
      nextSelectionMemory,
      currentSnapshot.workspaces,
      currentSnapshot.tabs,
      currentSnapshot.panes,
    );
    const workspaceIds = new Set(
      currentSnapshot.workspaces.map(item => item.workspace_id),
    );
    const rememberedWorkspaceId = restoreSessionWorkspaceId(
      nextSelectionMemory,
      workspaceIds,
    );
    const nextWorkspace = currentSnapshot.workspaces.find(
      item => item.workspace_id === rememberedWorkspaceId,
    ) || currentSnapshot.workspaces.find(item => item.focused) || currentSnapshot.workspaces[0];
    const workspaceTabs = currentSnapshot.tabs.filter(
      item => item.workspace_id === nextWorkspace?.workspace_id,
    );
    const nextTab = workspaceTabs.find(
      item => item.workspace_id === nextWorkspace?.workspace_id && item.tab_id === nextSelectionMemory.workspaceTabs.get(nextWorkspace?.workspace_id || ''),
    ) || currentSnapshot.tabs.find(
      item => item.workspace_id === nextWorkspace?.workspace_id && item.tab_id === nextWorkspace?.active_tab_id,
    ) || workspaceTabs.find(item => item.focused) || workspaceTabs[0];
    const savedPaneId = nextTab
      ? restoreSessionPaneId(
        nextSelectionMemory,
        nextTab.tab_id,
        new Set(currentSnapshot.panes.filter(item => item.tab_id === nextTab.tab_id).map(item => item.pane_id)),
      )
      : null;
    const nextPane = currentSnapshot.panes.find(
      item => item.tab_id === nextTab?.tab_id && item.pane_id === savedPaneId,
    ) || currentSnapshot.panes.find(
      item => item.tab_id === nextTab?.tab_id && item.focused,
    ) || currentSnapshot.panes.find(item => item.tab_id === nextTab?.tab_id);
    if (nextWorkspace) {
      setWorkspaceId(nextWorkspace.workspace_id);
      rememberSessionWorkspace(nextSelectionMemory, nextWorkspace.workspace_id);
      rememberSessionTab(
        nextSelectionMemory,
        nextWorkspace.workspace_id,
        nextTab?.tab_id || '',
      );
    }
    rememberSessionPane(nextSelectionMemory, nextTab?.tab_id || '', nextPane?.pane_id || '');
    setTabId(nextTab?.tab_id || '');
    setPaneId(nextPane?.pane_id || '');
    if (rememberedWorkspaceId && nextWorkspace) {
      localSelectionRef.current = {
        workspaceId: nextWorkspace.workspace_id,
        tabId: nextTab?.tab_id || '',
        paneId: nextPane?.pane_id || null,
      };
      pendingPaneFocus.current = nextPane?.pane_id || null;
      if (nextPane) activateRestoredPane(nextPane);
    }
    reportedChatFailureGenerationsRef.current.clear();
  }, [hostSessionId]);

  useEffect(() => () => {
    focusRequestSerial.current += 1;
    focusRequestQueue.current.clear();
  }, []);

  useEffect(() => {
    pruneSessionSelectionMemory(
      selectionMemory,
      workspaces,
      selectableResources.tabs,
      selectableResources.panes,
    );
    const local = localSelectionRef.current;
    if (local && (
      !workspaces.some(item => item.workspace_id === local.workspaceId)
      || (local.tabId && !selectableResources.tabs.some(item => item.tab_id === local.tabId))
    )) {
      localSelectionRef.current = null;
      pendingPaneFocus.current = null;
    } else if (local?.paneId && !selectableResources.panes.some(item => item.pane_id === local.paneId)) {
      // Keep an explicitly selected empty tab, but discard its deleted pane.
      localSelectionRef.current = { ...local, paneId: null };
      pendingPaneFocus.current = null;
    }
  }, [selectableResources.panes, selectableResources.tabs, selectionMemory, workspaces]);

  useEffect(() => {
    setPendingCreatedSelection(current =>
      reconcilePendingCreatedSelection(current, snapshot),
    );
    setPendingCreatedWorkspace(current => current && snapshot.workspaces.some(
      item => item.workspace_id === current.workspace_id,
    ) ? null : current);
  }, [snapshot]);

  const updateChatRestoreIntent = useCallback((key: string, transcriptKey?: string) => {
    const current = chatRestoreIntentsRef.current;
    if (current.get(key) === transcriptKey) return;
    const next = new Map(current);
    if (transcriptKey) next.set(key, transcriptKey);
    else next.delete(key);
    chatRestoreIntentsRef.current = next;
    setChatRestoreIntents(next);
  }, []);

  const onTerminalResidencyEnd: TerminalResidencyEnd = useCallback((target, reason) => {
    const terminalId = target.session.terminalId;
    const key = target.key;
    const view = chatViewsRef.current.get(key);
    if (reason === TerminalResidencyEndReason.Closed) updateChatRestoreIntent(key);
    if (!view) return;
    if (reason === TerminalResidencyEndReason.Evicted && chatPresentationRequested(view.presentation)) {
      updateChatRestoreIntent(key, view.binding.transcriptKey);
    }
    const next = new Map(chatViewsRef.current);
    next.delete(key);
    chatViewsRef.current = next;
    setChatViews(next);
    agentTranscriptService.closeTerminal(target.hostSessionId, terminalId, target.client.native);
  }, [updateChatRestoreIntent]);

  useEffect(() => {
    const activeId = visible ? activeTarget?.key : null;
    const targets = new Map(terminalTargets.map(target => [target.key, target]));
    const next = new Map(chatViewsRef.current);
    let changed = false;
    for (const key of chatRestoreIntentsRef.current.keys()) {
      const target = targets.get(key);
      if (!target || confirmedChatExit(target.client.native.hostState(), target.session.terminalId) ||
        next.get(key)?.presentation.phase === AgentChatPresentationPhase.Failed ||
        chatPresentationVisible(next.get(key)?.presentation)) {
        updateChatRestoreIntent(key);
      }
    }
    if (activeTarget && activeId && !next.has(activeId) && chatRestoreIntentsRef.current.has(activeId)) {
      const transcriptKey = chatRestoreIntentsRef.current.get(activeId);
      try {
        const projection = agentTranscriptService.activate(hostSessionId, activeTarget.session.terminalId, client.native);
        if (projection.type === 'bound') {
          if (projection.binding.transcriptKey === transcriptKey) {
            next.set(activeId, {
              binding: projection.binding,
              presentation: requestedChatPresentation(projection.state),
              state: projection.state,
            });
            changed = true;
          } else {
            updateChatRestoreIntent(activeId);
            agentTranscriptService.closeTerminal(hostSessionId, activeTarget.session.terminalId, client.native);
          }
        } else if (projection.reason !== 'host-state-unavailable') {
          updateChatRestoreIntent(activeId);
        }
      } catch (error) {
        // A reconnect can replace the native runtime between snapshots. Keep
        // the selection pending for the next host update, without its history.
        const failure = error instanceof Error ? error : new Error(String(error));
        reportBackgroundFailure(Promise.reject(failure), 'agent-chat-resume');
      }
    }
    if (changed) {
      chatViewsRef.current = next;
      setChatViews(next);
    }
  }, [visible, terminalState.activeTerminalId, terminalState.sessions, snapshot.panes,
    client, hostSessionId, requestedChatPresentation, updateChatRestoreIntent, activeTarget, terminalTargets, chatViews]);

  useEffect(() => {
    const targets = new Map(terminalTargets.map(target => [target.key, target]));
    const liveTerminalKeys = new Set(targets.keys());
    const projections = new Map<string, AgentChatProjection>();
    const reboundPresentations = new Map<string, AgentChatPresentation>();
    const exitedTerminalKeys = new Set<string>();
    for (const [key, view] of chatViewsRef.current) {
      const target = targets.get(key);
      if (!target) continue; // The residency callback owns cleanup of removed targets.
      const { client: targetClient, hostSessionId: targetHost, session } = target;
      let projection: AgentChatProjection;
      try {
        projection = agentTranscriptService.reconcile(
          targetHost, session.terminalId, targetClient.native,
        );
      } catch (error) {
        // Runtime replacement can race a snapshot/foreground notification.
        // Wait for the next authoritative projection; never fail Terminal.
        recordAgentChatDiagnostic('reconcile-unavailable', { error: String(error) });
        continue;
      }
      projections.set(key, projection);
      if (confirmedChatExit(targetClient.native.hostState(), session.terminalId)) {
        exitedTerminalKeys.add(key);
      }
      if (
        projection.type === 'bound' &&
        projection.binding.bindingToken !== view.binding.bindingToken &&
        chatPresentationRequested(view.presentation)
      ) {
        reboundPresentations.set(key, requestedChatPresentation(projection.state));
      }
    }
    // Terminal selection/rendering has already committed. Only the selected
    // resident Herdr target may establish a speculative binding; cache and
    // remote work continue independently inside the transcript service.
    // On E-Ink devices the transcript may be tens of MB. Restoring it just to
    // show Terminal can multiply that history across Rust, FFI, JS and SQLite
    // before the Chat viewport exists. Explicit Chat and saved Chat intent
    // still activate normally; terminal startup stays independent of history.
    const preloadTarget = !isEink && visible && appActive && activeTarget &&
      activeTarget.session.kind !== 'ssh' && chatAgentForPane(activePane) &&
      !chatRestoreIntentsRef.current.has(activeTarget.key)
      ? activeTarget : null;
    const existing = preloadTarget && chatViewsRef.current.get(preloadTarget.key);
    const preload = preloadTarget &&
      projections.get(preloadTarget.key)?.type !== 'bound' &&
      (!existing || existing.presentation.phase === AgentChatPresentationPhase.Dormant ||
        existing.presentation.phase === AgentChatPresentationPhase.Warm)
      ? agentTranscriptService.preload(
          preloadTarget.hostSessionId, preloadTarget.session.terminalId, preloadTarget.client.native,
        )
      : null;
    setChatViews(current => {
      const next = reconcileAgentChatViews(
        current,
        liveTerminalKeys,
        projections,
        reboundPresentations,
        exitedTerminalKeys,
      );
      if (preloadTarget && preload?.type === 'bound') {
        return new Map(next).set(preloadTarget.key, {
          binding: preload.binding,
          state: preload.state,
          presentation: dormantChatPresentation(),
        });
      }
      return next;
    });
  }, [
    // Native state may change while JS is paused without a new pane snapshot.
    appActive,
    isEink,
    visible,
    activeTarget,
    activePane,
    client,
    hostSessionId,
    snapshot.panes,
    terminalState.sessions,
    terminalTargets,
    requestedChatPresentation,
  ]);

  useEffect(() => {
    const subscriptions = [...chatViewsRef.current.entries()].flatMap(
      ([key, view]) => {
        const terminalId = view.binding.terminalId;
        const target = terminalTargets.find(item => item.key === key);
        if (!target) return [];
        return [
          agentTranscriptService.subscribe(view.binding.bindingToken, state => {
            const resetGeneration = nextChatPresentationGeneration();
            setChatViews(current => {
              const active = current.get(key);
              if (
                active?.binding.bindingToken !== view.binding.bindingToken ||
                active.state === state
              )
                return current;
              if (state === null) {
                if (confirmedChatExit(target.client.native.hostState(), terminalId)) {
                  const next = new Map(current);
                  next.delete(key);
                  return next;
                }
                return new Map(current).set(key, chatBindingLost(active, false));
              }
              const readiness = agentTranscriptReadiness(state);
              const nextPresentation = updateChatTranscriptReadiness(
                active.presentation,
                readiness,
                resetGeneration,
              );
              recordAgentChatDiagnostic('transcript-update-projected', {
                bindingToken: agentChatDiagnosticToken(
                  view.binding.bindingToken,
                ),
                fromPhase: active.presentation.phase,
                readiness,
                state: state.status,
                stateRevision: state.revision,
                terminalId,
                toPhase: nextPresentation.phase,
              });
              const next = new Map(current);
              next.set(key, {
                ...active,
                presentation: nextPresentation,
                state,
              });
              return next;
            });
          }),
        ];
      },
    );
    return () => subscriptions.forEach(unsubscribe => unsubscribe());
  }, [chatSubscriptionIdentity, nextChatPresentationGeneration, terminalTargets]);

  useEffect(() => {
    const activeKey = visible && appActive ? activeTarget?.key : null;
    for (const [key, view] of chatViews) {
      // Normal displays retain the existing eager Chat consumer behavior.
      // E-Ink is the bounded opt-in suspension policy: only the selected,
      // explicitly requested Chat (or its speech lease) stays remote-active.
      const consumerActive =
        !isEink ||
        (key === activeKey && chatPresentationRequested(view.presentation));
      agentTranscriptService.setConsumerActive(
        view.binding.bindingToken,
        consumerActive,
      );
    }
  }, [activeTarget?.key, appActive, chatViews, isEink, visible]);

  useEffect(() => {
    if (
      !visible || activeChatView?.presentation.phase !== AgentChatPresentationPhase.Failed
    )
      return;
    const generation = activeChatView.presentation.generation;
    if (reportedChatFailureGenerationsRef.current.has(generation)) return;
    reportedChatFailureGenerationsRef.current.add(generation);
    showAppAlert(
      `${
        chatAgentDisplayName(activeChatView.binding.agent)
      } history unavailable`,
      activeChatView.state.error ||
        'The transcript could not be loaded for this session.',
    );
  }, [
    activeTerminalSession?.terminalId,
    activeChatView,
    showAppAlert,
    visible,
  ]);

  useEffect(() => {
    const pending = pendingFocus.current;
    if (pending) {
      const previousStillPresent =
        snapshot.tabs.some(item => item.tab_id === pending.previousId) ||
        pendingCreatedSelection?.tab.tab_id === pending.previousId;
      const focusedServerWorkspace =
        snapshot.workspaces.find(item => item.focused) || workspace;
      const serverTabs = snapshot.tabs.filter(
        item => item.workspace_id === focusedServerWorkspace?.workspace_id,
      );
      const nextTab =
        serverTabs.find(item => item.focused) ||
        serverTabs.find(
          item => item.tab_id === focusedServerWorkspace?.active_tab_id,
        ) ||
        serverTabs[0];
      if (previousStillPresent) return;
      if (focusedServerWorkspace)
        setWorkspaceId(focusedServerWorkspace.workspace_id);
      setTabId(nextTab?.tab_id || '');
      pendingFocus.current = null;
      return;
    }
    if (workspace && workspace.workspace_id !== workspaceId)
      setWorkspaceId(workspace.workspace_id);
    if (selectedTab && selectedTab.tab_id !== tabId)
      setTabId(selectedTab.tab_id);
    if (selectedPane && selectedPane.pane_id !== paneId)
      setPaneId(selectedPane.pane_id);
  }, [
    pendingCreatedSelection,
    paneId,
    selectedPane,
    selectedTab,
    snapshot.tabs,
    snapshot.workspaces,
    tabId,
    workspace,
    workspaceId,
  ]);

  // Follow server focus while hidden or before a usable local selection exists.
  // Once visible, keep the selected terminal stable while startup focus events settle.
  useEffect(() => {
    if (!followServerFocus || !serverWorkspaceId) return;
    const localSelection = localSelectionRef.current;
    if (localSelection) {
      const serverConfirmsSelection =
        serverWorkspaceId === localSelection.workspaceId &&
        serverTabId === localSelection.tabId &&
        (!localSelection.paneId || serverPaneId === localSelection.paneId);
      if (!serverConfirmsSelection) return;
      localSelectionRef.current = null;
    }
    if (!serverTabId) {
      if (pendingCreatedPaneId) return;
      pendingPaneFocus.current = null;
      setWorkspaceId(serverWorkspaceId);
      setTabId('');
      return;
    }
    if (
      !serverFocusMatchesPendingPane(
        serverPaneId,
        pendingCreatedPaneId || pendingPaneFocus.current,
      )
    )
      return;
    setWorkspaceId(serverWorkspaceId);
    setTabId(serverTabId);
    if (serverPaneId) setPaneId(serverPaneId);
  }, [
    followServerFocus,
    pendingCreatedPaneId,
    serverPaneId,
    serverTabId,
    serverWorkspaceId,
  ]);

  // Preserve an explicit terminal choice until Herdr confirms the same pane.
  useEffect(() => {
    if (!visible) {
      pendingPaneFocus.current = null;
      lastActivePaneId.current = null;
      return;
    }
    const activeSession = terminalState.sessions.find(
      item => item.terminalId === terminalState.activeTerminalId,
    );
    const activeSessionPane = snapshot.panes.find(
      item => item.pane_id === activeSession?.paneId,
    );
    const localSelection = localSelectionRef.current;
    if (
      localSelection &&
      (activeSessionPane?.workspace_id !== localSelection.workspaceId ||
        activeSessionPane.tab_id !== localSelection.tabId ||
        (localSelection.paneId && activeSessionPane.pane_id !== localSelection.paneId))
    )
      return;
    if (
      localSelection &&
      activeSessionPane?.workspace_id === localSelection.workspaceId &&
      activeSessionPane?.tab_id === localSelection.tabId &&
      (!localSelection.paneId || activeSessionPane.pane_id === localSelection.paneId)
    ) {
      localSelectionRef.current = null;
    }
    if (
      activeSessionPane?.workspace_id !== workspaceId ||
      activeSessionPane?.tab_id !== selectedTab?.tab_id ||
      activeSessionPane?.pane_id === lastActivePaneId.current
    )
      return;
    lastActivePaneId.current = activeSessionPane.pane_id;
    setPaneId(activeSessionPane.pane_id);
    setWorkspaceId(activeSessionPane.workspace_id);
    setTabId(activeSessionPane.tab_id);
  }, [
    snapshot.panes,
    terminalState.activeTerminalId,
    terminalState.sessions,
    selectedTab?.tab_id,
    visible,
    workspaceId,
  ]);

  const activateServerPane = useEffectEvent((requestedPaneId: string) => {
    const pane = snapshot.panes.find(item => item.pane_id === requestedPaneId);
    if (pane) onActivateTerminal(pane);
  });

  // Keep a hidden or uninitialized terminal aligned with the server-focused pane.
  useEffect(() => {
    if (!followServerFocus || !serverPaneId) return;
    const localSelection = localSelectionRef.current;
    if (
      localSelection &&
      (serverWorkspaceId !== localSelection.workspaceId ||
        serverTabId !== localSelection.tabId ||
        serverPaneId !== localSelection.paneId)
    )
      return;
    if (
      !serverFocusMatchesPendingPane(
        serverPaneId,
        pendingCreatedPaneId || pendingPaneFocus.current,
      )
    )
      return;
    pendingPaneFocus.current = null;
    activateServerPane(serverPaneId);
  }, [
    followServerFocus,
    pendingCreatedPaneId,
    serverPaneId,
    serverTabId,
    serverWorkspaceId,
  ]);

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    try {
      return await runWithInFlightGuard(mutationInFlight, async () => {
        setBusy(true);
        try {
          await action();
        } finally {
          setBusy(false);
        }
      });
    } catch (error) {
      showHerdrError(error);
      return false;
    }
  };

  const requestSessionFocus = (
    nextWorkspaceId: string,
    nextTabId: string,
    nextPaneId: string,
  ) => {
    const request = ++focusRequestSerial.current;
    focusRequestQueue.current.enqueue(async () => {
        if (request !== focusRequestSerial.current) return;
        try {
          // pane.focus already selects its parent tab and workspace. Sending
          // all three exposes intermediate focus states and causes extra paints.
          if (nextPaneId) {
            await client.native.requestHerdrApi({
              method: 'pane.focus',
              params: { pane_id: nextPaneId },
            });
          } else if (nextTabId) {
            await client.native.requestHerdrApi({
              method: 'tab.focus',
              params: { tab_id: nextTabId },
            });
          } else {
            await client.native.requestHerdrApi({
              method: 'workspace.focus',
              params: { workspace_id: nextWorkspaceId },
            });
          }
        } catch (error) {
          if (request === focusRequestSerial.current) showHerdrError(error);
        }
      });
  };

  const chooseWorkspace = (item: (typeof workspaces)[number]) => {
    if (item.workspace_id === workspaceId && activeTarget) return;
    const workspaceTabs = orderSessionTabs(
      selectableResources.tabs.filter(tab => tab.workspace_id === item.workspace_id),
    );
    const savedTabId = restoreSessionTabId(
      selectionMemory,
      item.workspace_id,
      new Set(workspaceTabs.map(tab => tab.tab_id)),
    );
    const nextTab = workspaceTabs.find(tab => tab.tab_id === savedTabId)
      || workspaceTabs.find(tab => tab.tab_id === item.active_tab_id)
      || workspaceTabs.find(tab => tab.focused)
      || workspaceTabs[0];
    const nextPanes = selectableResources.panes.filter(
      pane => pane.tab_id === nextTab?.tab_id,
    );
    const savedPaneId = nextTab
      ? restoreSessionPaneId(
        selectionMemory,
        nextTab.tab_id,
        new Set(nextPanes.map(pane => pane.pane_id)),
      )
      : null;
    const nextPane = nextPanes.find(pane => pane.pane_id === savedPaneId)
      || nextPanes.find(pane => pane.focused)
      || nextPanes[0];
    localSelectionRef.current = {
      workspaceId: item.workspace_id,
      tabId: nextTab?.tab_id || '',
      paneId: nextPane?.pane_id || null,
    };
    setWorkspaceId(item.workspace_id);
    setTabId(nextTab?.tab_id || '');
    setPaneId(nextPane?.pane_id || '');
    rememberSessionWorkspace(selectionMemory, item.workspace_id);
    rememberSessionTab(selectionMemory, item.workspace_id, nextTab?.tab_id || '');
    rememberSessionPane(selectionMemory, nextTab?.tab_id || '', nextPane?.pane_id || '');
    pendingPaneFocus.current = nextPane?.pane_id || null;
    if (nextPane) {
      terminalTabSelectionStarted(nextPane.terminal_id);
      onActivateTerminal(nextPane);
    }
    requestSessionFocus(
      item.workspace_id,
      nextTab?.tab_id || '',
      nextPane?.pane_id || '',
    );
  };

  const chooseTab = (item: TabInfo) => {
    if (item.tab_id === selectedTab?.tab_id && activeTarget) return;
    const nextPanes = selectableResources.panes.filter(
      pane => pane.tab_id === item.tab_id,
    );
    const savedPaneId = restoreSessionPaneId(
      selectionMemory,
      item.tab_id,
      new Set(nextPanes.map(pane => pane.pane_id)),
    );
    const nextPane = nextPanes.find(pane => pane.pane_id === savedPaneId)
      || nextPanes.find(pane => pane.focused)
      || nextPanes[0];
    localSelectionRef.current = {
      workspaceId: item.workspace_id,
      tabId: item.tab_id,
      paneId: nextPane?.pane_id || null,
    };
    if (nextPane) terminalTabSelectionStarted(nextPane.terminal_id);
    setWorkspaceId(item.workspace_id);
    setTabId(item.tab_id);
    setPaneId(nextPane?.pane_id || '');
    rememberSessionWorkspace(selectionMemory, item.workspace_id);
    rememberSessionTab(selectionMemory, item.workspace_id, item.tab_id);
    rememberSessionPane(selectionMemory, item.tab_id, nextPane?.pane_id || '');
    pendingPaneFocus.current = nextPane?.pane_id || null;
    if (nextPane) onActivateTerminal(nextPane);
    requestSessionFocus(
      item.workspace_id,
      item.tab_id,
      nextPane?.pane_id || '',
    );
  };

  const tabNavigationContextRef = useRef({
    tabs,
    selectedTab,
  });
  tabNavigationContextRef.current = {
    tabs,
    selectedTab,
  };
  const chooseTabRef = useRef(chooseTab);
  chooseTabRef.current = chooseTab;

  const handleVolumeKey = useEffectEvent((key: TerminalVolumeKey) => {
    if (!visible) return;
    const configured =
      key === 'up'
        ? terminalPreferences.volumeUpAction
        : terminalPreferences.volumeDownAction;
    const action = resolveTerminalVolumeKeyAction(configured, key);
    if (action?.type !== 'terminal-tab') return;
    const context = tabNavigationContextRef.current;
    const currentIndex = context.tabs.findIndex(
      item => item.tab_id === context.selectedTab?.tab_id,
    );
    const targetTab = context.tabs[currentIndex + action.direction];
    if (targetTab) chooseTabRef.current(targetTab);
  });

  useEffect(() => {
    const subscription = addTerminalVolumeKeyListener(handleVolumeKey);
    return () => subscription.remove();
  }, []);

  const choosePane = (pane: PaneInfo) => {
    if (pane.pane_id === activePane?.pane_id) return;
    localSelectionRef.current = {
      workspaceId: pane.workspace_id,
      tabId: pane.tab_id,
      paneId: pane.pane_id,
    };
    terminalTabSelectionStarted(pane.terminal_id);
    setWorkspaceId(pane.workspace_id);
    setTabId(pane.tab_id);
    setPaneId(pane.pane_id);
    rememberSessionWorkspace(selectionMemory, pane.workspace_id);
    rememberSessionTab(selectionMemory, pane.workspace_id, pane.tab_id);
    rememberSessionPane(selectionMemory, pane.tab_id, pane.pane_id);
    pendingPaneFocus.current = pane.pane_id;
    onActivateTerminal(pane);
    requestSessionFocus(
      pane.workspace_id,
      pane.tab_id,
      pane.pane_id,
    );
  };

  const create = async () => {
    if (mutationInFlight.current) return;
    let succeeded = true;
    if (editorMode === 'workspace') {
      pendingFocus.current = null;
      succeeded = await run(async () => {
        const created = await client.native.requestHerdrApi({
          method: 'workspace.create',
          params: { label: name.trim() || null, cwd: workspaceCwd.trim() || null, focus: true },
        });
        if (created.type !== 'workspace_created') {
          throw new Error(`Unexpected workspace.create result: ${created.type}`);
        }
        setPendingCreatedWorkspace(created.workspace);
        setPendingCreatedSelection(created);
        localSelectionRef.current = {
          workspaceId: created.workspace.workspace_id,
          tabId: created.tab.tab_id,
          paneId: created.root_pane.pane_id,
        };
        rememberSessionWorkspace(selectionMemory, created.workspace.workspace_id);
        rememberSessionTab(selectionMemory, created.workspace.workspace_id, created.tab.tab_id);
        rememberSessionPane(selectionMemory, created.tab.tab_id, created.root_pane.pane_id);
        pendingPaneFocus.current = created.root_pane.pane_id;
        setPaneId(created.root_pane.pane_id);
        activateCreatedTabLocally(created, {
          select: (createdWorkspaceId, createdTabId) => {
            setWorkspaceId(createdWorkspaceId);
            setTabId(createdTabId);
          },
          terminalSelectionStarted: terminalTabSelectionStarted,
          activateTerminal: onActivateTerminal,
        });
      });
    } else if (editorMode === 'rename-tab' && selectedTab) {
      succeeded = await run(() =>
        client.native.requestHerdrApi({
          method: 'tab.rename',
          params: { tab_id: selectedTab.tab_id, label: name },
        }),
      );
    } else if (editorMode === 'rename-pane' && editingPaneId) {
      succeeded = await run(() =>
        client.native.requestHerdrApi({
          method: 'pane.rename',
          params: { pane_id: editingPaneId, label: name.trim() || null },
        }),
      );
    } else if (workspace) {
      pendingFocus.current = null;
      succeeded = await run(async () => {
        const created = await client.native.requestHerdrApi({
          method: 'tab.create',
          params: {
            workspace_id: workspace.workspace_id,
            label: name.trim() || null,
            focus: true,
          },
        });
        if (created.type !== 'tab_created') {
          throw new Error(`Unexpected tab.create result: ${created.type}`);
        }
        setPendingCreatedSelection(created);
        pendingPaneFocus.current = created.root_pane.pane_id;
        activateCreatedTabLocally(created, {
          select: (selectedWorkspaceId, createdTabId) => {
            setWorkspaceId(selectedWorkspaceId);
            setTabId(createdTabId);
          },
          terminalSelectionStarted: terminalTabSelectionStarted,
          activateTerminal: onActivateTerminal,
        });
      });
    }
    if (!succeeded) {
      pendingFocus.current = null;
      return;
    }
    setName('');
    setWorkspaceCwd('');
    setEditingPaneId(null);
    setEditorMode(null);
  };

  const openRenameTab = (item: TabInfo | undefined = selectedTab) => {
    if (!item) return;
    if (item.tab_id !== selectedTab?.tab_id) chooseTab(item);
    setName(item.label);
    setEditingPaneId(null);
    setEditorMode('rename-tab');
  };

  const performCloseTab = async (item: TabInfo | undefined = selectedTab) => {
    if (!item) return;
    // Herdr focuses a surviving tab after closing the current one.
    pendingPaneFocus.current = null;
    pendingFocus.current = { previousId: item.tab_id };
    if (
      !(await run(() =>
        client.native.requestHerdrApi({
          method: 'tab.close',
          params: { tab_id: item.tab_id },
        }),
      ))
    ) {
      pendingFocus.current = null;
    } else if (pendingCreatedSelection?.tab.tab_id === item.tab_id) {
      setPendingCreatedSelection(null);
    }
  };

  const openRenamePane = (pane: PaneInfo) => {
    if (pane.pane_id !== selectedPane?.pane_id) choosePane(pane);
    setName(pane.label || '');
    setEditingPaneId(pane.pane_id);
    setEditorMode('rename-pane');
  };

  const performClosePane = async (pane: PaneInfo) => {
    if (editingPaneId === pane.pane_id) {
      setEditingPaneId(null);
      setEditorMode(null);
    }
    await run(() =>
      client.native.requestHerdrApi({
        method: 'pane.close',
        params: { pane_id: pane.pane_id },
      }),
    );
  };

  const requestCloseTab = (item: TabInfo | undefined = selectedTab) => {
    if (!item || busy) return;
    setPendingResourceClose({ kind: 'tab', item });
  };

  const requestClosePane = (pane: PaneInfo) => {
    if (busy) return;
    setPendingResourceClose({ kind: 'pane', item: pane });
  };

  const confirmResourceClose = async () => {
    const pending = pendingResourceClose;
    if (!pending) return;
    setPendingResourceClose(null);
    if (pending.kind === 'tab') {
      await performCloseTab(pending.item);
    } else {
      await performClosePane(pending.item);
    }
  };

  const addPane = async () => {
    if (!selectedPane) return;
    await run(() => client.native.requestHerdrApi({
      method: 'pane.split',
      params: { target_pane_id: selectedPane.pane_id, direction: 'right', focus: true },
    }));
  };

  const closeEditor = () => {
    setName('');
    setWorkspaceCwd('');
    setEditingPaneId(null);
    setEditorMode(null);
  };

  const openFileManager = () => {
    if (activeTerminalSession) onOpenFiles(activeTerminalSession.terminalId);
  };

  const openChatFile = (target: TranscriptFileLinkTarget) => {
    if (!activeTerminalSession || !activePane) return;
    const activeWorkspace = snapshot.workspaces.find(
      item => item.workspace_id === activePane.workspace_id,
    );
    const directory =
      activeChatView?.state.transcript.info?.directory ||
      activePane.foreground_cwd ||
      activePane.cwd ||
      activeWorkspace?.worktree?.checkout_path;
    onOpenFiles(activeTerminalSession.terminalId, {
      ...target,
      path: resolveTranscriptFilePath(target.path, directory || undefined),
    });
  };

  const openAttachments = () => {
    if (activeTerminalSession?.status !== 'connected') return;
    setAttachmentTerminalId(activeTerminalSession.terminalId);
    setAttachmentsOpen(true);
  };

  const closeActiveChat = useCallback(() => {
    const terminalId = activeTerminalSession?.terminalId;
    if (!terminalId) return;
    cancelChatOpen();
    if (!activeTarget) return;
    updateChatRestoreIntent(activeTarget.key);
    setChatViews(current => {
      const view = current.get(activeTarget.key);
      if (!view) return current;
      return new Map(current).set(activeTarget.key, {
        ...view, presentation: closeChatPresentation(view.presentation),
      });
    });
  }, [activeTerminalSession?.terminalId, activeTarget, cancelChatOpen, updateChatRestoreIntent]);

  const openAgentChat = () => {
    if (activeChatView && chatPresentationRequested(activeChatView.presentation)) return;
    if (activeTarget && activeChatView) {
      try {
        const projection = agentTranscriptService.reconcile(
          activeTarget.hostSessionId, activeTarget.session.terminalId, activeTarget.client.native,
        );
        if (projection.type === 'bound' && agentTranscriptReadiness(projection.state) !== 'failed') {
          const generation = nextChatPresentationGeneration();
          const presentation = requestChatPresentation(
            projection.binding.bindingToken === activeChatView.binding.bindingToken
              ? updateChatTranscriptReadiness(
                  activeChatView.presentation,
                  agentTranscriptReadiness(projection.state),
                  generation,
                )
              : dormantChatPresentation(),
            agentTranscriptReadiness(projection.state),
            generation,
          );
          setChatViews(current => new Map(current).set(activeTarget.key, {
            binding: projection.binding, state: projection.state, presentation,
          }));
          return;
        }
      } catch (error) {
        recordAgentChatDiagnostic('warm-binding-unavailable', { error: String(error) });
      }
    }
    return chatOpen.open();
  };

  const agentPanes = panes.filter(pane => sessionPaneGroup(pane) === 'agent');
  const ordinaryPanes = panes.filter(pane => sessionPaneGroup(pane) === 'ordinary');
  const renderPaneChip = (pane: PaneInfo) => {
    const active = pane.pane_id === selectedPane?.pane_id;
    const agent = paneAgentLabel(pane);
    const label = paneLabel(pane);
    const navigationLabel = paneNavigationLabel(pane);
    const accent = agent
      ? sessionPaneAgentColor(agent, colors, isEink)
      : statusColor(pane.agent_status, colors);
    return (
      <View
        key={pane.pane_id}
        className="h-10 shrink-0 flex-row items-center rounded-full border"
        style={agent ? sessionAgentRailStyle(active, accent, colors) : sessionTabGlassStyle(active, colors)}
      >
        <Button
          accessibilityLabel={t('session.openPane', { pane: navigationLabel })}
          className={cn(
            'h-10 shrink-0 flex-row justify-start gap-1 rounded-none px-2 py-0',
            isTablet && 'px-2.5',
          )}
          variant="ghost"
          onPress={hapticPress(() => choosePane(pane))}
          onLongPress={hapticPress(() => openRenamePane(pane))}
        >
          <AnimatedAgentStatusGlyph
            status={pane.agent_status}
            color={accent}
            size={isTablet ? 14 : 11}
          />
          {agent && <Bot size={isTablet ? 14 : 13} color={active ? colors.activeSurfaceForeground : colors.text} />}
          {agent && (
            <Text
              numberOfLines={1}
              className={cn(
                'shrink-0 pb-0.5 text-[10px] font-black leading-4',
                isTablet && 'text-[11px]',
              )}
              style={{ color: active ? colors.activeSurfaceForeground : accent }}
            >
              {agent}
            </Text>
          )}
          <Text
            numberOfLines={1}
            className={cn(
              'shrink-0 pb-0.5 text-[10px] font-semibold leading-4 text-muted-foreground',
              isTablet && 'text-[12px]',
              active && (isEink ? 'text-foreground' : 'text-primary-foreground'),
            )}
          >
            {label}
          </Text>
        </Button>
        <Button
          accessibilityLabel={t('session.closePane', { pane: navigationLabel })}
          className="size-10 rounded-none px-0"
          disabled={busy}
          variant="ghost"
          onPress={hapticPress(() => requestClosePane(pane))}
        >
          <X
            size={13}
            color={active ? colors.activeSurfaceForeground : colors.textSecondary}
          />
        </Button>
      </View>
    );
  };

  return (
            <View
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      pointerEvents={visible ? 'auto' : 'none'}
      style={
        !visible && terminalPreferences.fullscreen && safeAreaInsets.top > 0
          ? { bottom: -safeAreaInsets.top }
          : undefined
      }
      className={cn(
        'flex-1 bg-terminal-canvas',
        !visible && 'absolute inset-0',
      )}
    >
      <TerminalBackground preferences={terminalPreferences} />
      <View
        className="absolute inset-x-0 z-30"
        style={{ bottom: terminalSessionChromeBottom, backgroundColor: colors.canvas }}
      >
        {(workspace || snapshot.server.running) && (
          <View
            testID="session-workspace-row"
            accessibilityElementsHidden={!terminalSessionChromeVisible}
            importantForAccessibility={terminalSessionChromeVisible ? 'auto' : 'no-hide-descendants'}
            pointerEvents={terminalSessionChromeVisible ? 'auto' : 'none'}
            className="h-10 flex-row bg-transparent"
            style={terminalSessionChromeVisible ? undefined : { display: 'none' }}
          >
            <Button
              accessibilityLabel={t('session.backToHerd')}
              className="h-10 w-10 items-center justify-center rounded-none px-0 py-0"
              size="content"
              variant="ghost"
              onPress={hapticPress(onExit)}
            >
              <ChevronLeft size={Platform.OS === 'ios' ? 22 : 20} color={colors.text} />
            </Button>
            <ScrollView
              testID="session-workspaces"
              className="min-w-0 flex-1"
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="items-center gap-1 px-1"
            >
              {workspaces.map(item => {
                const active = item.workspace_id === workspace?.workspace_id;
                const label = item.label || item.workspace_id;
                return (
                  <View
                    key={item.workspace_id}
                    className="h-10 shrink-0 flex-row items-center rounded-full border"
                    style={sessionTabGlassStyle(active, colors)}
                  >
                    <Button
                      accessibilityLabel={t('rail.workspaceStatus', {
                        workspace: label,
                        status: item.agent_status,
                      })}
                      className="h-10 shrink-0 flex-row justify-start gap-1.5 rounded-full px-2.5 py-0"
                      variant="ghost"
                      onPress={hapticPress(() => chooseWorkspace(item))}
                    >
                      <AnimatedAgentStatusGlyph
                        status={item.agent_status}
                        color={statusColor(item.agent_status, colors)}
                        size={isTablet ? 13 : 10}
                      />
                      <Text
                        numberOfLines={1}
                        className={cn(
                          'shrink-0 text-[10px] font-semibold text-muted-foreground',
                          isTablet && 'text-[11px]',
                          active && (isEink ? 'text-foreground' : 'text-primary-foreground'),
                        )}
                      >
                        {label}
                      </Text>
                      <Text className={cn(
                        'font-mono text-[7px] text-muted-foreground',
                        isTablet && 'text-[9px]',
                        active && (isEink ? 'text-foreground' : 'text-primary-foreground'),
                      )}>
                        {item.tab_count}
                      </Text>
                    </Button>
                  </View>
                );
              })}
            </ScrollView>
            <Button
              accessibilityLabel={t('rail.newWorkspace')}
              className="h-10 w-10 items-center justify-center rounded-none px-0 py-0"
              disabled={busy || !snapshot.server.running}
              size="content"
              variant="ghost"
              onPress={hapticPress(() => setEditorMode('workspace'))}
            >
              <Plus size={Platform.OS === 'ios' ? 23 : 16} color={colors.text} />
            </Button>
          </View>
        )}

        <View
          testID="session-tab-row"
          accessibilityElementsHidden={!terminalSessionChromeVisible}
          importantForAccessibility={terminalSessionChromeVisible ? 'auto' : 'no-hide-descendants'}
          pointerEvents={terminalSessionChromeVisible ? 'auto' : 'none'}
          className="h-12 flex-row bg-transparent"
          style={terminalSessionChromeVisible ? undefined : { display: 'none' }}
        >
          {workspace ? (
            <>
              <View className="h-12 w-10 items-center justify-center" accessibilityLabel={t('session.tab')}>
                <PanelTop size={18} color={colors.text} />
              </View>
              <ScrollView
                testID="session-tabs"
                className="min-w-0 flex-1"
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="items-center gap-1 px-1"
              >
                {tabs.map(item => {
                  const active = item.tab_id === selectedTab?.tab_id;
                  const itemPanes = selectableResources.panes.filter(pane => pane.tab_id === item.tab_id);
                  const itemSession = terminalState.sessions.find(session =>
                    itemPanes.some(pane => pane.terminal_id === session.terminalId),
                  );
                  const label = item.label || item.tab_id;
                  return (
                    <View
                      key={item.tab_id}
                      className="h-10 shrink-0 flex-row items-center rounded-full border"
                      style={sessionTabGlassStyle(active, colors)}
                    >
                      <Button
                        accessibilityLabel={t('session.openTab', { tab: label })}
                        className={cn(
                          'h-10 shrink-0 justify-start gap-1.5 rounded-none px-2 py-0 pr-1 active:bg-transparent active:opacity-70 dark:active:bg-transparent',
                          isTablet && 'px-2.5',
                        )}
                        variant="ghost"
                        onPress={hapticPress(() => chooseTab(item))}
                        onLongPress={hapticPress(() => openRenameTab(item))}
                      >
                        <AnimatedAgentStatusGlyph
                          status={item.agent_status}
                          color={sessionTabStatusColor(item.agent_status, itemSession?.status, colors)}
                          size={isTablet ? 14 : 11}
                        />
                        <Text
                          numberOfLines={1}
                          className={cn(
                            'shrink-0 pb-0.5 text-[10px] font-semibold leading-4 text-muted-foreground',
                            isTablet && 'text-[12px] leading-[18px]',
                            active && (isEink ? 'text-foreground' : 'text-primary-foreground'),
                          )}
                        >
                          {label}
                        </Text>
                        {item.pane_count > 1 && (
                          <Text className={cn(
                            'font-mono text-[7px] text-muted-foreground',
                            isTablet && 'text-[9px]',
                            active && (isEink ? 'text-foreground' : 'text-primary-foreground'),
                          )}>
                            {item.pane_count}
                          </Text>
                        )}
                      </Button>
                      <Button
                        accessibilityLabel={t('session.closeTab', { tab: label })}
                        className="size-10 rounded-none px-0 active:bg-transparent active:opacity-70 dark:active:bg-transparent"
                        variant="ghost"
                        onPress={hapticPress(() => requestCloseTab(item))}
                      >
                        <X
                          size={isTablet ? 16 : 13}
                          color={active ? colors.activeSurfaceForeground : colors.textSecondary}
                        />
                      </Button>
                    </View>
                  );
                })}
              </ScrollView>
              <Button
                accessibilityLabel={t('session.newTab')}
                className={cn(
                  'h-12 items-center justify-center rounded-none px-0 py-0',
                  Platform.OS === 'ios' ? 'w-12' : 'w-10',
                )}
                disabled={busy}
                size="content"
                variant="ghost"
                onPress={hapticPress(() => setEditorMode('tab'))}
              >
                <Plus size={Platform.OS === 'ios' ? 23 : 16} color={colors.text} />
              </Button>
            </>
          ) : activeTerminalSession?.kind === 'ssh' ? (
            <>
              <Button
                accessibilityLabel={t('session.backToHerd')}
                className="h-12 w-10 items-center justify-center rounded-none px-0"
                size="content"
                variant="ghost"
                onPress={hapticPress(onExit)}
              >
                <ChevronLeft size={20} color={colors.text} />
              </Button>
              <Text className="flex-1 self-center px-2 font-mono text-[10px] font-semibold text-foreground">
                {t('terminal.sshShell')}
              </Text>
              <Button
                accessibilityLabel={t('terminal.closeSession')}
                className="h-12 w-10 rounded-none px-0"
                variant="ghost"
                onPress={hapticPress(() => onCloseTerminal(activeTerminalSession.terminalId))}
              >
                <X size={17} color={colors.text} />
              </Button>
            </>
          ) : null}
        </View>

        <ResourceEditorSheet
          busy={busy}
          context={editorContext}
          icon={editorMode === 'workspace' ? Layers3 : SquareTerminal}
          onClose={closeEditor}
          onSave={create}
          title={editorTitle}
          visible={editorMode !== null}
        >
          <ResourceEditorField
            label={
              editorMode === 'workspace'
                ? t('herd.labelOptional')
                : editorMode === 'rename-pane' ? t('pane.label') : t('herd.tabName')
            }
          >
            <Input
              accessibilityLabel={
                editorMode === 'workspace'
                  ? t('herd.labelOptional')
                  : editorMode === 'rename-pane'
                  ? t('pane.label')
                  : t('herd.tabName')
              }
              autoFocus
              autoCorrect={false}
              editable={!busy}
              returnKeyType={editorMode === 'workspace' ? 'next' : 'done'}
              selectTextOnFocus={editorMode?.startsWith('rename')}
              value={name}
              onChangeText={setName}
              onSubmitEditing={() => {
                if (editorMode === 'workspace') workspaceCwdInputRef.current?.focus();
                else reportBackgroundFailure(create(), 'session-resource-create');
              }}
              placeholder={
                editorMode === 'tab'
                  ? t('herd.tabNamePlaceholder')
                  : t('herd.labelOptional')
              }
              placeholderTextColor={colors.textTertiary}
            />
          </ResourceEditorField>
          {editorMode === 'workspace' && (
            <ResourceEditorField label={t('herd.workingDirectoryOptional')}>
              <Input
                ref={workspaceCwdInputRef}
                accessibilityLabel={t('herd.workingDirectoryOptional')}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                returnKeyType="done"
                value={workspaceCwd}
                onChangeText={setWorkspaceCwd}
                onSubmitEditing={() => {
                  reportBackgroundFailure(create(), 'session-workspace-create');
                }}
                placeholder="~"
                placeholderTextColor={colors.textTertiary}
              />
            </ResourceEditorField>
          )}
        </ResourceEditorSheet>

        {terminalSessionChromeVisible && workspace && (
          <View testID="session-pane-row" className="h-10 flex-row bg-transparent">
            <View className="h-10 w-10 items-center justify-center" accessibilityLabel={t('session.pane')}>
              <PanelRightOpen size={18} color={colors.text} />
            </View>
            <ScrollView
              testID="session-panes"
              className="min-w-0 flex-1"
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="items-center gap-1 px-1"
            >
              {agentPanes.map(renderPaneChip)}
              {agentPanes.length > 0 && ordinaryPanes.length > 0 && (
                <View
                  className="mx-1 h-6 shrink-0 flex-row items-center gap-1.5 px-1"
                  accessibilityLabel={t('session.pane')}
                >
                  <View className="h-5 w-[2px]" style={{ backgroundColor: colors.textSecondary }} />
                  <SquareTerminal size={isTablet ? 16 : 14} color={colors.text} />
                </View>
              )}
              {ordinaryPanes.map(renderPaneChip)}
            </ScrollView>
            <Button
              accessibilityLabel={t('session.newPane')}
              className="h-10 w-10 items-center justify-center rounded-none px-0 py-0"
              disabled={busy || !selectedPane}
              size="content"
              variant="ghost"
              onPress={hapticPress(() => { void addPane(); })}
            >
              <Plus size={Platform.OS === 'ios' ? 23 : 16} color={colors.text} />
            </Button>
          </View>
        )}
      </View>

      <View
        className="relative flex-1 overflow-hidden bg-transparent"
        onTouchStart={() => registerInteraction()}
      >
        <View pointerEvents="box-none" className="absolute inset-0">
          <TerminalScreen
            onResidencyEnd={onTerminalResidencyEnd}
            activeTarget={activeTarget}
            targets={terminalTargets}
            compact
            sessionChromeInset={sessionChromeInset}
            onSessionChromeVisibilityChange={setTerminalSessionChromeVisible}
            onSessionChromeBottomChange={setTerminalSessionChromeBottom}
            latencyMs={latencyMs}
            latencyWarningActive={latencyWarningActive}
            visible={visible && Boolean(activeTarget)}
            preferences={terminalPreferences}
            controlUsage={terminalControlUsage}
            historyEntries={terminalHistory}
            getComposerDraft={getComposerDraft}
            onComposerDraftChange={onComposerDraftChange}
            linkScanRequest={linkScanRequest}
            pasteRequest={
              pasteRequest &&
              pasteRequest.terminalId === activeTerminalSession?.terminalId
                ? {
                    id: pasteRequest.id,
                    text: pasteRequest.text,
                    previewUri: pasteRequest.previewUri,
                    dispose: pasteRequest.dispose,
                  }
                : undefined
            }
            onRequestAttachment={openAttachments}
            onRequestFiles={openFileManager}
            onRequestLinks={scanTerminalLinks}
            chatControl={
              activeChatControl
                ? {
                    accessibilityLabel: activeChatControl.loading
                      ? chatOpen.installing
                        ? `Installing ${chatAgentDisplayName(activeChatControl.agent)} integration`
                        : `Preparing ${
                            chatAgentDisplayName(activeChatControl.agent)
                          } Chat`
                      : chatVisible
                      ? 'Open Terminal view'
                      : `Open ${
                          chatAgentDisplayName(activeChatControl.agent)
                        } Chat view`,
                    active: chatVisible,
                    disabled: activeChatControl.disabled,
                    loading: activeChatControl.loading,
                    onPress: hapticPress(
                      chatVisible ? closeActiveChat : openAgentChat,
                    ),
                  }
                : undefined
            }
            chatViewEnabled={chatVisible}
            renderViewportOverlay={
              mountedChatViews.length
                ? (insets, latestButtonBottom) => mountedChatViews.map(([key, chatView]) => {
                    const selected = key === activeTarget?.key;
                    const shown = visible && selected && chatPresentationVisible(chatView.presentation);
                    const terminalId = chatView.binding.terminalId;
                    return (
                      <View
                        key={key}
                        className="absolute inset-0"
                        style={{ opacity: shown ? 1 : 0 }}
                        pointerEvents={shown ? 'auto' : 'none'}
                        accessibilityElementsHidden={!shown}
                        importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
                      >
                        <AgentChatView
                          key={[
                            chatView.binding.bindingToken,
                            chatView.presentation.generation,
                          ].join(':')}
                          state={chatView.state}
                          active={visible && selected && chatView.presentation.phase !== AgentChatPresentationPhase.Warm}
                          agent={chatView.binding.agent}
                          agentStatus={selected && activePane ? activePane.agent_status : 'idle'}
                          contentInsets={insets}
                          latestButtonBottom={latestButtonBottom}
                          onOpenFile={openChatFile}
                          onInitialViewportReady={() => {
                            const generation =
                              chatView.presentation.generation;
                            recordAgentChatDiagnostic(
                              'initial-viewport-callback-received',
                              {
                                activeTerminalId: activeTerminalIdRef.current,
                                bindingToken: agentChatDiagnosticToken(
                                  chatView.binding.bindingToken,
                                ),
                                generation,
                                terminalId,
                              },
                            );
                            setChatViews(current => {
                              const view = current.get(key);
                              if (
                                view?.binding.bindingToken !==
                                  chatView.binding.bindingToken ||
                                agentTranscriptReadiness(view.state) !== 'usable'
                              ) {
                                recordAgentChatDiagnostic(
                                  'initial-viewport-callback-rejected',
                                  {
                                    reason: 'binding-or-readiness-changed',
                                    terminalId,
                                  },
                                );
                                return current;
                              }
                              const presentation = revealPreparedChat(
                                view.presentation,
                                generation,
                              );
                              if (presentation === view.presentation)
                                return current;
                              recordAgentChatDiagnostic(
                                'chat-open-visible',
                                {
                                  bindingToken: agentChatDiagnosticToken(
                                    view.binding.bindingToken,
                                  ),
                                  generation,
                                  terminalId,
                                },
                              );
                              const next = new Map(current);
                              next.set(key, { ...view, presentation });
                              return next;
                            });
                          }}
                        />
                      </View>
                    );
                  })
                : undefined
            }
            viewportOverlayBackground={
              chatVisible && appGlassEnabled ? (
                <AppBackground
                  uri={appBackgroundImageUri}
                  dimming={appBackgroundDimming}
                />
              ) : undefined
            }
            onOpenLink={link => {
              if (terminalPreferences.openLinksInApp) setLinksOpen(true);
              reportBackgroundFailure(
                openTerminalLink(link),
                'terminal-link-open',
              );
            }}
            onLinksScanned={links => {
              setTerminalLinks(links);
              setLinksBusy(false);
            }}
            onControlUse={onTerminalControlUse}
            onHistoryEntry={onTerminalHistoryEntry}
            onInteraction={registerInteraction}
            onFontSizeChange={(target, fontSize) => {
              onTerminalFontSizeChange(
                target.hostSessionId,
                target.session.terminalId,
                fontSize,
              );
            }}
            onClose={() => {
              if (activeTerminalSession)
                onCloseTerminal(activeTerminalSession.terminalId);
            }}
            onStatus={(target, status, error, reconnectAttempt) => {
              onTerminalStatus(
                target.hostSessionId,
                target.session.terminalId,
                status,
                error,
                reconnectAttempt,
              );
            }}
          />
        </View>
        {!activeTarget && !snapshot.server.running && (
          <View className="flex-1 items-center justify-center p-[30px]">
            <Text className="font-black text-terminal-text">
              {t('session.serverUnavailable')}
            </Text>
            <Text className="mt-2 text-center text-terminal-muted">
              {t('session.serverUnavailableCopy')}
            </Text>
            <Button
              className="mt-5 rounded-full px-5"
              variant="secondary"
              onPress={hapticPress(onExit)}
            >
              <Text>{t('session.backToHerd')}</Text>
            </Button>
          </View>
        )}
        {!activeTarget && snapshot.server.running && !selectedTab && (
          <View className="flex-1 items-center justify-center p-[30px]">
            <Text className="font-black text-terminal-text">
              {workspace
                ? t('session.emptyWorkspace')
                : t('session.noWorkspaces')}
            </Text>
            <Text className="mt-2 text-center text-terminal-muted">
              {workspace
                ? t('session.createTab')
                : t('session.createWorkspace')}
            </Text>
          </View>
        )}
        {!activeTarget &&
          snapshot.server.running &&
          selectedTab &&
          panes.length === 0 && (
            <View className="flex-1 items-center justify-center p-[30px]">
              <Text className="font-black text-terminal-text">
                {t('session.emptyTab')}
              </Text>
              <Text className="mt-2 text-center text-terminal-muted">
                {t('session.emptyTabCopy')}
              </Text>
            </View>
          )}
        <AttachmentPasteSheet
          client={client}
          visible={attachmentsOpen}
          onClose={() => setAttachmentsOpen(false)}
          onPaste={(attachment: PastedAttachment) => {
            if (!attachmentTerminalId) {
              attachment.dispose();
              return;
            }
            setPasteRequest(current => ({
              id: (current?.id || 0) + 1,
              terminalId: attachmentTerminalId,
              text: attachment.remotePath,
              previewUri: attachment.previewUri,
              dispose: attachment.dispose,
            }));
          }}
        />
        <AgentIntegrationInstallSheet
          integration={chatOpen.notice?.type === 'integration' ? chatOpen.notice.integration : null}
          onCancel={chatOpen.dismissNotice}
          onInstall={chatOpen.install}
        />
        <AgentIdentityWarningSheet
          warning={chatOpen.notice?.type === 'identity' ? chatOpen.notice : null}
          onClose={chatOpen.dismissNotice}
        />
        <Modal
          animationType={animationType}
          onRequestClose={browserUrl ? leaveBrowser : dismissLinks}
          statusBarTranslucent
          visible={linksOpen}
        >
          <View
            className="flex-1 bg-background"
            style={{
              paddingTop: safeAreaInsets.top,
              paddingBottom: safeAreaInsets.bottom,
            }}
          >
            {browserUrl ? (
              <>
                <View className="h-12 flex-row items-center border-b border-border bg-background">
                  <Button
                    accessibilityLabel={t('terminal.browserBack')}
                    className="h-12 w-12 rounded-none px-0"
                    variant="ghost"
                    onPress={() =>
                      browserCanGoBack
                        ? browserWebView.current?.goBack()
                        : leaveBrowser()
                    }
                  >
                    <ChevronLeft size={21} color={colors.text} />
                  </Button>
                  <View className="min-w-0 flex-1 px-1">
                    <Text
                      numberOfLines={1}
                      className="text-[11px] font-semibold text-foreground"
                    >
                      {terminalWebLinkTarget(browserDisplayUrl).hostname}
                    </Text>
                    <Text
                      numberOfLines={1}
                      className="font-mono text-[8px] text-muted-foreground"
                    >
                      {browserDisplayUrl}
                    </Text>
                  </View>
                  <Button
                    accessibilityLabel={t('terminal.closeBrowser')}
                    className="h-12 w-12 rounded-none px-0"
                    variant="ghost"
                    onPress={dismissLinks}
                  >
                    <X size={19} color={colors.text} />
                  </Button>
                </View>
                <View className="relative flex-1 bg-white">
                  <WebView
                    ref={value => {
                      browserWebView.current = value;
                    }}
                    source={{ uri: browserUrl }}
                    javaScriptEnabled
                    onLoadStart={() => setBrowserLoading(true)}
                    onLoadEnd={() => setBrowserLoading(false)}
                    onNavigationStateChange={state =>
                      setBrowserCanGoBack(state.canGoBack)
                    }
                    style={BROWSER_WEBVIEW_STYLE}
                  />
                  {browserLoading && (
                    <View
                      pointerEvents="none"
                      className="absolute inset-x-0 top-0 items-center py-2"
                    >
                      <ActivityIndicator color={colors.primary} />
                    </View>
                  )}
                </View>
              </>
            ) : (
              <>
                <View className="h-14 flex-row items-center border-b border-border px-4">
                  <View className="min-w-0 flex-1">
                    <Text className="text-[17px] font-bold text-foreground">
                      {t('terminal.linksTitle')}
                    </Text>
                    <Text className="text-[8px] uppercase tracking-[1px] text-muted-foreground">
                      {t('terminal.linksLatestFirst')}
                    </Text>
                  </View>
                  <Button
                    accessibilityLabel={t('terminal.closeLinks')}
                    className="size-11 rounded-full px-0"
                    variant="ghost"
                    onPress={dismissLinks}
                  >
                    <X size={19} color={colors.text} />
                  </Button>
                </View>
                <View className="min-h-[66px] flex-row items-center border-b border-border px-4 py-3">
                  <View className="min-w-0 flex-1 pr-4">
                    <Text className="text-[14px] font-semibold text-foreground">
                      {t('terminal.openLinksInApp')}
                    </Text>
                    <Text className="mt-0.5 text-[10px] leading-[14px] text-muted-foreground">
                      {t('terminal.openLinksInAppCopy')}
                    </Text>
                  </View>
                  <Switch
                    accessibilityLabel={t('terminal.openLinksInApp')}
                    checked={terminalPreferences.openLinksInApp}
                    onCheckedChange={onTerminalOpenLinksInAppChange}
                  />
                </View>
                {linksBusy ? (
                  <View className="flex-1 items-center justify-center gap-3 p-8">
                    <ActivityIndicator color={colors.primary} />
                    <Text className="text-[12px] text-muted-foreground">
                      {t('terminal.scanningLinks')}
                    </Text>
                  </View>
                ) : linksError ? (
                  <View className="flex-1 items-center justify-center p-8">
                    <Text className="text-center text-[13px] font-semibold text-destructive">
                      {t('terminal.linkOpenFailed')}
                    </Text>
                    <Text className="mt-2 text-center text-[9px] text-muted-foreground">
                      {linksError}
                    </Text>
                  </View>
                ) : terminalLinks.length ? (
                  <ScrollView
                    className="flex-1"
                    contentContainerClassName="px-4 py-2"
                  >
                    {terminalLinks.map((link, index) => {
                      const target = terminalWebLinkTarget(link);
                      return (
                        <Button
                          key={`${link}-${index}`}
                          className="h-auto min-h-[66px] flex-row justify-start gap-3 rounded-none border-b border-border px-0 py-3"
                          variant="ghost"
                          onPress={() => openTerminalLink(link)}
                        >
                          <View className="size-9 items-center justify-center rounded-full bg-muted">
                            <Globe2 size={17} color={colors.text} />
                          </View>
                          <View className="min-w-0 flex-1 items-start">
                            <View className="flex-row items-center gap-2">
                              <Text
                                numberOfLines={1}
                                className="max-w-[220px] text-[12px] font-bold text-foreground"
                              >
                                {target.hostname}
                              </Text>
                              {target.requiresSshTunnel && (
                                <Text className="rounded-full bg-primary px-2 py-0.5 font-mono text-[7px] font-black text-primary-foreground">
                                  {t('terminal.sshTunnel')}
                                </Text>
                              )}
                            </View>
                            <Text
                              numberOfLines={2}
                              className="mt-1 text-left font-mono text-[9px] leading-[13px] text-muted-foreground"
                            >
                              {link}
                            </Text>
                          </View>
                        </Button>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <View className="flex-1 items-center justify-center p-8">
                    <Globe2 size={28} color={colors.textSecondary} />
                    <Text className="mt-3 text-[14px] font-semibold text-foreground">
                      {t('terminal.noLinks')}
                    </Text>
                    <Text className="mt-1 text-center text-[11px] text-muted-foreground">
                      {t('terminal.noLinksCopy')}
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        </Modal>
      </View>
      <AppAlertPopup
        message={visibleAppAlert?.message}
        title={visibleAppAlert?.title || ''}
        visible={visibleAppAlert !== null}
        onClose={() => { setAppAlert(null); chatOpen.dismissNotice(); }}
      />
      <ConfirmationPopup
        busy={busy}
        confirmLabel={t('common.close')}
        copy={pendingResourceClose?.kind === 'tab'
          ? t('session.closeTab', { tab: pendingResourceClose.item.label || pendingResourceClose.item.tab_id })
          : pendingResourceClose?.kind === 'pane'
          ? t('session.closePane', { pane: paneNavigationLabel(pendingResourceClose.item) })
          : ''}
        icon={Trash2}
        title={pendingResourceClose?.kind === 'tab'
          ? t('session.closeTab', { tab: pendingResourceClose.item.label || pendingResourceClose.item.tab_id })
          : t('pane.closeTitle')}
        visible={pendingResourceClose !== null}
        onCancel={() => setPendingResourceClose(null)}
        onConfirm={() => {
          reportBackgroundFailure(
            confirmResourceClose(),
            'session-resource-close',
          );
        }}
      />
    </View>
  );
}
