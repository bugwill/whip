import {
  foregroundUsesBriefAlerts,
  agentNotificationTitle,
  isAgentNotificationTransition,
  tabNameForAgent,
} from '../src/lib/agentStatusEvents';
import type { AgentInfo } from '../src/types';

const agent: AgentInfo = {
  terminal_id: 'terminal-1',
  agent: 'codex',
  agent_status: 'working',
  workspace_id: 'workspace-1',
  tab_id: 'tab-1',
  pane_id: 'pane-1',
  focused: true,
  revision: 1,
};

describe('agent status events', () => {
  test('notifies whenever a working Agent leaves working', () => {
    expect(isAgentNotificationTransition('working', 'blocked')).toBe(true);
    expect(isAgentNotificationTransition('working', 'done')).toBe(true);
    expect(isAgentNotificationTransition('working', 'idle')).toBe(true);
    expect(isAgentNotificationTransition('working', 'unknown')).toBe(true);
    expect(isAgentNotificationTransition(undefined, 'done')).toBe(false);
    expect(isAgentNotificationTransition('idle', 'done')).toBe(false);
    expect(isAgentNotificationTransition('done', 'idle')).toBe(false);
    expect(isAgentNotificationTransition('working', 'working')).toBe(false);
  });

  test('uses brief notifications whenever the app is in the foreground', () => {
    expect(foregroundUsesBriefAlerts(true)).toBe(true);
    expect(foregroundUsesBriefAlerts(false)).toBe(false);
  });

  test('uses the tab name and agent name in notification titles', () => {
    const tabs = [{
      tab_id: 'tab-1',
      workspace_id: 'workspace-1',
      number: 1,
      label: 'Gold research',
      focused: true,
      pane_count: 1,
      agent_status: 'working' as const,
    }];

    expect(tabNameForAgent(agent, tabs)).toBe('Gold research');
    expect(agentNotificationTitle({ ...agent, agent_status: 'done' }, 'Gold research'))
      .toBe('Gold research · codex finished');
    expect(agentNotificationTitle({ ...agent, agent_status: 'blocked' }, 'Gold research'))
      .toBe('Gold research · codex needs you');
  });
});
