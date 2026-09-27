import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

function measuredTerminal() {
  const parentStyle: Record<string, string> = { width: '800px', height: '400px' };
  const elementStyle: Record<string, string> = {
    'padding-left': '16px', 'padding-right': '16px',
    'padding-top': '0px', 'padding-bottom': '0px',
  };
  const parent = {};
  const view = {
    devicePixelRatio: 1,
    getComputedStyle: (node: unknown) => ({
      getPropertyValue: (property: string) => (node === parent ? parentStyle : elementStyle)[property] || '',
    }),
  };
  const terminal = {
    element: { parentElement: parent, ownerDocument: { defaultView: view } },
    dimensions: { css: { cell: { width: 8, height: 16 } } },
    options: { fontSize: 12, scrollback: 1000, scrollbar: { showScrollbar: true, width: 14 } },
  };
  const proposeDimensions = jest.fn((): { cols: number; rows: number } | undefined => ({ cols: 94, rows: 25 }));
  const source = readFileSync(resolve(__dirname, '../scripts/sync-terminal-assets.mjs'), 'utf8');
  const start = source.indexOf('    let lastFitGeometry = null;');
  const end = source.indexOf('    const resize =', start);
  const measure = runInNewContext(`${source.slice(start, end)}; measureEffectiveTerminalGeometry`, {
    terminal, fit: { proposeDimensions }, window: view,
  }) as () => { cols: number; rows: number } | null;
  return { measure, proposeDimensions, terminal, parentStyle, elementStyle, view };
}

test('stable activation retries reuse dimensions but late layout changes are measured', () => {
  const { measure, proposeDimensions, parentStyle } = measuredTerminal();
  const first = measure();
  expect(measure()).toBe(first);
  expect(measure()).toBe(first);
  expect(proposeDimensions).toHaveBeenCalledTimes(1);
  parentStyle.width = '600px';
  proposeDimensions.mockReturnValue({ cols: 69, rows: 25 });
  expect(measure()?.cols).toBe(69);
  expect(proposeDimensions).toHaveBeenCalledTimes(2);
  expect(measure()?.cols).toBe(69);
  expect(proposeDimensions).toHaveBeenCalledTimes(2);
});

test('font, cell, padding, scrollbar and pixel ratio changes invalidate cached dimensions', () => {
  const { measure, proposeDimensions, terminal, elementStyle, view } = measuredTerminal();
  measure();
  const changes = [
    () => { terminal.options.fontSize = 14; },
    () => { terminal.dimensions.css.cell.width = 9; },
    () => { elementStyle['padding-top'] = '8px'; },
    () => { terminal.options.scrollbar.width = 20; },
    () => { terminal.options.scrollbar.showScrollbar = false; },
    () => { terminal.options.scrollback = 0; },
    () => { view.devicePixelRatio = 2; },
  ];
  for (const change of changes) {
    change();
    measure();
    measure();
  }
  expect(proposeDimensions).toHaveBeenCalledTimes(changes.length + 1);
});

test('unready measurements are not cached and zero-sized panes are not fitted', () => {
  const { measure, proposeDimensions, parentStyle, terminal } = measuredTerminal();
  proposeDimensions.mockReturnValueOnce(undefined);
  expect(measure()).toBeNull();
  expect(measure()).not.toBeNull();
  expect(proposeDimensions).toHaveBeenCalledTimes(2);
  parentStyle.height = '0px';
  expect(measure()).toBeNull();
  parentStyle.height = '400px';
  terminal.dimensions.css.cell.width = 0;
  expect(measure()).toBeNull();
  expect(proposeDimensions).toHaveBeenCalledTimes(2);
});
