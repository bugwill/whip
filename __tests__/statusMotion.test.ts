import { agentStatusGlyph, shouldMountNativeAgentSpinner, statusMotionKind, statusTone } from '../src/lib/statusMotion';

test('matches Herdr Symbols agent status glyphs', () => {
  expect(agentStatusGlyph('working')).toBe('◐');
  expect(agentStatusGlyph('blocked')).toBe('×');
  expect(agentStatusGlyph('done')).toBe('✓');
  expect(agentStatusGlyph('idle')).toBe('○');
  expect(agentStatusGlyph('unknown')).toBe('·');
});

test('uses continuous rotation for active work and connection states', () => {
  expect(statusMotionKind('working')).toBe('spin');
  expect(statusMotionKind('running')).toBe('spin');
  expect(statusMotionKind('connecting')).toBe('spin');
  expect(statusMotionKind('reconnecting')).toBe('spin');
});

test('uses a pulse for attention states and no motion for settled states', () => {
  expect(statusMotionKind('blocked')).toBe('pulse');
  expect(statusMotionKind('waiting')).toBe('pulse');
  expect(statusMotionKind('done')).toBe('static');
  expect(statusMotionKind('idle')).toBe('static');
});

test('keeps agent state colors aligned with their semantic tone', () => {
  expect(statusTone('working')).toBe('success');
  expect(statusTone('blocked')).toBe('destructive');
  expect(statusTone('connecting')).toBe('warning');
  expect(statusTone('idle')).toBe('muted');
});

test('keeps Agent indicators static for the Symbols style', () => {
  expect(shouldMountNativeAgentSpinner('working', true, false)).toBe(false);
  expect(shouldMountNativeAgentSpinner('running', true, false)).toBe(false);
  expect(shouldMountNativeAgentSpinner('working', true, true)).toBe(false);
  expect(shouldMountNativeAgentSpinner('working', false, false)).toBe(false);
  expect(shouldMountNativeAgentSpinner('done', true, false)).toBe(false);
});
