import {
  terminalRendererEvictionKeys,
  terminalRendererCacheCapacity,
  touchTerminalRendererEntry,
} from '../src/lib/terminalRendererLru';

describe('terminal renderer LRU', () => {
  test('E-Ink bounds resident renderers without changing normal-screen preference', () => {
    expect(terminalRendererCacheCapacity(20, true)).toBe(3);
    expect(terminalRendererCacheCapacity(20, false)).toBe(20);
    expect(terminalRendererCacheCapacity(Number.NaN, true)).toBe(3);
  });

  test('reserves capacity before allocating an incoming renderer', () => {
    expect(terminalRendererEvictionKeys(['a', 'b', 'c'], 3, new Set(['incoming']), 1)).toEqual(['a']);
    expect(terminalRendererEvictionKeys(['a', 'b', 'c'], 3, new Set(['a']), 1)).toEqual(['b']);
  });
  test('evicts the least recently used entries first', () => {
    expect(terminalRendererEvictionKeys(
      ['oldest', 'older', 'middle', 'recent', 'newer', 'active'],
      4,
      new Set(['active']),
    )).toEqual(['oldest', 'older']);
  });

  test('touching an entry moves it to the most-recent position', () => {
    const entries = new Map([
      ['first', 1],
      ['second', 2],
      ['third', 3],
    ]);

    expect(touchTerminalRendererEntry(entries, 'first')).toBe(1);
    expect([...entries.keys()]).toEqual(['second', 'third', 'first']);
  });

  test('does not impose an upper capacity bound', () => {
    const keys = Array.from({ length: 60 }, (_, index) => `terminal-${index}`);
    expect(terminalRendererEvictionKeys(keys, 99, new Set())).toEqual([]);
  });
});
