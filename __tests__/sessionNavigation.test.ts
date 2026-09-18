import type { PaneInfo, TabInfo, WorkspaceInfo } from '../src/types';
import {
  createSessionSelectionMemory,
  SessionFocusQueue,
  orderSessionPanes,
  orderSessionTabs,
  orderSessionWorkspaces,
  paneAgentLabel,
  paneNavigationLabel,
  paneLabel,
  pruneSessionSelectionMemory,
  rememberSessionPane,
  rememberSessionWorkspace,
  rememberSessionTab,
  restoreSessionPaneId,
  restoreSessionWorkspaceId,
  restoreSessionTabId,
  sessionPaneAgentColor,
  sessionPaneMatchesSelection,
} from '../src/lib/sessionNavigation';

const pane = (id: string, overrides: Partial<PaneInfo> = {}): PaneInfo => ({
  pane_id: id,
  terminal_id: `terminal-${id}`,
  workspace_id: 'workspace-1',
  tab_id: 'tab-1',
  focused: false,
  agent_status: 'idle',
  revision: 1,
  ...overrides,
});

test('rapid switching retains only the last pending focus while native request is stalled', async () => {
  let finish!: () => void;
  const first = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const onError = jest.fn();
  const queue = new SessionFocusQueue(onError);
  queue.enqueue(first);
  await Promise.resolve();
  const skipped = jest.fn(async () => {});
  for (let index = 0; index < 10000; index++) queue.enqueue(skipped);
  const last = jest.fn(async () => {});
  queue.enqueue(last);
  finish();
  await Promise.resolve();
  await Promise.resolve();
  expect(first).toHaveBeenCalledTimes(1);
  expect(skipped).not.toHaveBeenCalled();
  expect(last).toHaveBeenCalledTimes(1);
  expect(onError).not.toHaveBeenCalled();
});

test('clearing pending focus drops it and a rejected request does not wedge the queue', async () => {
  const onError = jest.fn();
  const queue = new SessionFocusQueue(onError);
  const dropped = jest.fn(async () => {});
  queue.enqueue(dropped);
  queue.clear();
  await Promise.resolve();
  expect(dropped).not.toHaveBeenCalled();
  queue.enqueue(async () => { throw new Error('offline'); });
  await Promise.resolve();
  await Promise.resolve();
  const next = jest.fn(async () => {});
  queue.enqueue(next);
  await Promise.resolve();
  expect(onError).toHaveBeenCalledTimes(1);
  expect(next).toHaveBeenCalledTimes(1);
});

test('workspace and tab ordering uses stable server numbers rather than agent status', () => {
  const workspaces = [
    { workspace_id: 'w2', number: 2, label: 'Two' },
    { workspace_id: 'w1', number: 1, label: 'One' },
  ] as WorkspaceInfo[];
  const tabs = [
    { tab_id: 't2', workspace_id: 'w1', number: 2, label: 'Two' },
    { tab_id: 't1', workspace_id: 'w1', number: 1, label: 'One' },
  ] as TabInfo[];
  expect(orderSessionWorkspaces(workspaces).map(item => item.workspace_id)).toEqual(['w1', 'w2']);
  expect(orderSessionTabs(tabs).map(item => item.tab_id)).toEqual(['t1', 't2']);
});

test('agent panes are grouped first and show agent plus pane exactly once', () => {
  const panes = [
    pane('shell', { label: 'logs' }),
    pane('codex', { agent: 'codex', display_agent: 'Codex', label: 'coding' }),
    pane('open-code', { agent_session: { source: 'test', agent: 'opencode', kind: 'id', value: '1' }, label: 'review' }),
  ];
  expect(orderSessionPanes(panes).map(item => item.pane_id)).toEqual(['codex', 'open-code', 'shell']);
  expect(paneAgentLabel(panes[1])).toBe('Codex');
  expect(paneNavigationLabel(panes[1])).toBe('Codex · coding');
  expect(paneAgentLabel(panes[0])).toBeNull();
});

test('agent colors are stable while E-Ink remains monochrome', () => {
  const colors = {
    primary: '#111111',
    link: '#222222',
    working: '#333333',
    warning: '#444444',
    error: '#555555',
    textSecondary: '#666666',
  };
  expect(sessionPaneAgentColor('Codex', colors, false)).toBe(sessionPaneAgentColor('Codex', colors, false));
  expect(sessionPaneAgentColor('Codex', colors, true)).toBe('#666666');
});

test('retains original pane and displayed agent names without truncation or shell substitution', () => {
  const label = '电子书适配 / original long pane name '.repeat(8).trim();
  const item = pane('pane-id', {
    label,
    display_agent: 'Codex · My Agent',
    agent_session: { agent: 'codex', source: 'test', kind: 'id', value: '1' },
  });
  expect(paneLabel(item)).toBe(label);
  expect(paneAgentLabel(item)).toBe('Codex · My Agent');
  expect(paneNavigationLabel(item)).toBe(`Codex · My Agent · ${label}`);
  expect(paneLabel(pane('unnamed-pane'))).toBe('unnamed-pane');
});

test('remembers tab and pane independently, so switching T2 cannot overwrite T1', () => {
  const memory = createSessionSelectionMemory();
  const workspaceTabs = new Set(['t1', 't2']);
  const t1Panes = new Set(['p1', 'p2']);
  const t2Panes = new Set(['p3']);
  rememberSessionTab(memory, 'w1', 't1');
  rememberSessionPane(memory, 't1', 'p2');
  rememberSessionTab(memory, 'w1', 't2');
  rememberSessionPane(memory, 't2', 'p3');

  expect(restoreSessionTabId(memory, 'w1', workspaceTabs)).toBe('t2');
  expect(restoreSessionPaneId(memory, 't1', t1Panes)).toBe('p2');
  expect(restoreSessionPaneId(memory, 't2', t2Panes)).toBe('p3');
});

test('prunes deleted panes/tabs and keeps same resource ids isolated per host memory', () => {
  const hostA = createSessionSelectionMemory();
  const hostB = createSessionSelectionMemory();
  rememberSessionTab(hostA, 'w1', 't1');
  rememberSessionPane(hostA, 't1', 'p1');
  rememberSessionTab(hostB, 'w1', 't1');
  rememberSessionPane(hostB, 't1', 'p9');

  const workspaces = [{ workspace_id: 'w1', number: 1, label: 'One' }] as WorkspaceInfo[];
  const tabs = [{ tab_id: 't1', workspace_id: 'w1', number: 1, label: 'One' }] as TabInfo[];
  const panes = [pane('p9', { pane_id: 'p9', tab_id: 't1' })];
  pruneSessionSelectionMemory(hostA, workspaces, tabs, panes);
  pruneSessionSelectionMemory(hostB, workspaces, tabs, panes);

  expect(restoreSessionPaneId(hostA, 't1', new Set(['p1']))).toBeNull();
  expect(restoreSessionPaneId(hostB, 't1', new Set(['p9']))).toBe('p9');
  expect(sessionPaneMatchesSelection(panes[0], 'workspace-1', 't1', 'p9')).toBe(true);
  expect(sessionPaneMatchesSelection(panes[0], 'w2', 't1', 'p9')).toBe(false);
});

test('workspace selection is host-local and invalidated when the workspace is deleted', () => {
  const first = createSessionSelectionMemory();
  const second = createSessionSelectionMemory();
  rememberSessionWorkspace(first, 'w2');
  rememberSessionWorkspace(second, 'w1');
  const ids = new Set(['w1', 'w2']);
  expect(restoreSessionWorkspaceId(first, ids)).toBe('w2');
  expect(restoreSessionWorkspaceId(second, ids)).toBe('w1');
  pruneSessionSelectionMemory(first, [{ workspace_id: 'w1' } as WorkspaceInfo], [], []);
  expect(restoreSessionWorkspaceId(first, ids)).toBeNull();
});
