import type { PaneInfo, TabInfo, WorkspaceInfo } from '../types';

export type SessionPaneGroup = 'agent' | 'ordinary';

/** One in-flight focus plus one replaceable pending choice, never a promise chain. */
export class SessionFocusQueue {
  private pending: (() => Promise<void>) | null = null;
  private running = false;

  constructor(private readonly onError: (error: unknown) => void) {}

  enqueue(task: () => Promise<void>): void {
    this.pending = task;
    if (this.running) return;
    this.running = true;
    void this.drain();
  }

  clear(): void { this.pending = null; }

  private async drain(): Promise<void> {
    // Coalesce clicks delivered in the same JS turn before starting native work.
    await Promise.resolve();
    try {
      while (this.pending) {
        const task = this.pending;
        this.pending = null;
        try { await task(); } catch (error) { this.onError(error); }
      }
    } finally { this.running = false; }
  }
}

export type SessionSelectionMemory = {
  selectedWorkspaceId: string | null;
  workspaceTabs: Map<string, string>;
  tabPanes: Map<string, string>;
};

export function createSessionSelectionMemory(): SessionSelectionMemory {
  return { selectedWorkspaceId: null, workspaceTabs: new Map(), tabPanes: new Map() };
}

export function rememberSessionWorkspace(
  memory: SessionSelectionMemory,
  workspaceId: string,
): void {
  memory.selectedWorkspaceId = workspaceId || null;
}

export function restoreSessionWorkspaceId(
  memory: SessionSelectionMemory,
  workspaceIds: ReadonlySet<string>,
): string | null {
  return memory.selectedWorkspaceId && workspaceIds.has(memory.selectedWorkspaceId)
    ? memory.selectedWorkspaceId
    : null;
}

export function rememberSessionTab(
  memory: SessionSelectionMemory,
  workspaceId: string,
  tabId: string,
): void {
  if (workspaceId && tabId) memory.workspaceTabs.set(workspaceId, tabId);
  else if (workspaceId) memory.workspaceTabs.delete(workspaceId);
}

export function rememberSessionPane(
  memory: SessionSelectionMemory,
  tabId: string,
  paneId: string,
): void {
  if (tabId && paneId) memory.tabPanes.set(tabId, paneId);
  else if (tabId) memory.tabPanes.delete(tabId);
}

export function restoreSessionTabId(
  memory: SessionSelectionMemory,
  workspaceId: string,
  tabIds: ReadonlySet<string>,
): string | null {
  const tabId = memory.workspaceTabs.get(workspaceId);
  return tabId && tabIds.has(tabId) ? tabId : null;
}

export function restoreSessionPaneId(
  memory: SessionSelectionMemory,
  tabId: string,
  paneIds: ReadonlySet<string>,
): string | null {
  const paneId = memory.tabPanes.get(tabId);
  return paneId && paneIds.has(paneId) ? paneId : null;
}

export function pruneSessionSelectionMemory(
  memory: SessionSelectionMemory,
  workspaces: readonly WorkspaceInfo[],
  tabs: readonly TabInfo[],
  panes: readonly PaneInfo[],
): void {
  const workspaceIds = new Set(workspaces.map(workspace => workspace.workspace_id));
  if (memory.selectedWorkspaceId && !workspaceIds.has(memory.selectedWorkspaceId)) {
    memory.selectedWorkspaceId = null;
  }
  const tabsById = new Map(tabs.map(tab => [tab.tab_id, tab.workspace_id]));
  for (const [workspaceId, tabId] of memory.workspaceTabs) {
    if (!workspaceIds.has(workspaceId) || tabsById.get(tabId) !== workspaceId) memory.workspaceTabs.delete(workspaceId);
  }
  const panesById = new Map(panes.map(pane => [pane.pane_id, pane.tab_id]));
  for (const [tabId, paneId] of memory.tabPanes) {
    if (!tabsById.has(tabId) || panesById.get(paneId) !== tabId) memory.tabPanes.delete(tabId);
  }
}

export function sessionPaneMatchesSelection(
  pane: PaneInfo | undefined,
  workspaceId: string,
  tabId: string | undefined,
  paneId: string | undefined,
): boolean {
  return pane?.workspace_id === workspaceId &&
    pane.tab_id === tabId &&
    pane.pane_id === paneId;
}

/**
 * Herdr already assigns stable numbers to these resources.  Keep navigation
 * order independent from status updates, which otherwise makes a tab jump
 * while the user is trying to select it.
 */
export function stableSessionOrder<T extends { number: number }>(
  items: readonly T[],
  idOf: (item: T) => string,
): T[] {
  return [...items].sort((left, right) =>
    left.number - right.number || idOf(left).localeCompare(idOf(right)),
  );
}

export function orderSessionWorkspaces(items: readonly WorkspaceInfo[]): WorkspaceInfo[] {
  return stableSessionOrder(items, item => item.workspace_id);
}

export function orderSessionTabs(items: readonly TabInfo[]): TabInfo[] {
  return stableSessionOrder(items, item => item.tab_id);
}

export function paneAgentLabel(pane: PaneInfo): string | null {
  const candidates = [pane.display_agent, pane.agent_session?.agent, pane.agent];
  for (const value of candidates) {
    const label = value?.trim();
    if (label && !/^(shell|terminal|bash|zsh|fish|sh)$/i.test(label)) return label;
  }
  return null;
}

export function paneLabel(pane: PaneInfo): string {
  return pane.label?.trim() || pane.title?.trim() || pane.terminal_title_stripped?.trim() || pane.pane_id;
}

export function paneNavigationLabel(pane: PaneInfo): string {
  const agent = paneAgentLabel(pane);
  const label = paneLabel(pane);
  if (!agent || label.toLowerCase() === agent.toLowerCase()) return label;
  return `${agent} · ${label}`;
}

export function orderSessionPanes(items: readonly PaneInfo[]): PaneInfo[] {
  return items
    .map((pane, index) => ({ pane, index }))
    .sort((left, right) =>
      (paneAgentLabel(left.pane) ? 0 : 1) - (paneAgentLabel(right.pane) ? 0 : 1)
      || left.index - right.index,
    )
    .map(item => item.pane);
}

export function sessionPaneGroup(pane: PaneInfo): SessionPaneGroup {
  return paneAgentLabel(pane) ? 'agent' : 'ordinary';
}

export function sessionPaneAgentColor(
  agent: string,
  colors: {
    primary: string;
    link: string;
    working: string;
    warning: string;
    error: string;
    textSecondary: string;
  },
  isEink: boolean,
): string {
  if (isEink) return colors.textSecondary;
  const palette = [colors.primary, colors.link, colors.working, colors.warning, colors.error];
  let hash = 0;
  for (let index = 0; index < agent.length; index += 1) hash = Math.trunc(hash * 31 + agent.charCodeAt(index));
  return palette[Math.abs(hash) % palette.length];
}
