const { terminalCursorTapInput } = require('../scripts/terminal-touch-behavior.cjs');

function buffer(lines: Array<{ text: string; wrapped?: boolean }>, cursorX: number, cursorY = 0, baseY = 0) {
  return {
    cursorX, cursorY, baseY,
    getLine: (row: number) => {
      const line = lines[row];
      return line && {
        isWrapped: Boolean(line.wrapped),
        getCell: (col: number) => ({
          getChars: () => line.text[col] || '',
          getWidth: () => 1,
        }),
      };
    },
  };
}

test('moves both ways on the input row and clamps blank trailing space', () => {
  const state = buffer([{ text: '$ hello' }], 4);
  expect(terminalCursorTapInput(state, 20, { row: 0, col: 2 })).toBe('\x1b[D'.repeat(2));
  expect(terminalCursorTapInput(state, 20, { row: 0, col: 6 })).toBe('\x1b[C'.repeat(2));
  expect(terminalCursorTapInput(state, 20, { row: 0, col: 19 })).toBe('\x1b[C'.repeat(3));
  expect(terminalCursorTapInput(state, 20, { row: 0, col: 4 })).toBe('');
});

test('never sends history navigation when tapping unrelated output', () => {
  const state = buffer([{ text: 'output' }, { text: '$ input' }], 7, 0, 1);
  expect(terminalCursorTapInput(state, 20, { row: 0, col: 2 })).toBe('');
  expect(terminalCursorTapInput(state, 20, { row: 2, col: 2 })).toBe('');
});

test('uses horizontal keys across soft wraps and honors application cursor mode', () => {
  const state = buffer([{ text: '12345' }, { text: '678', wrapped: true }], 3, 1);
  expect(terminalCursorTapInput(state, 5, { row: 0, col: 3 })).toBe('\x1b[D'.repeat(5));
  expect(terminalCursorTapInput(state, 5, { row: 1, col: 1 }, true)).toBe('\x1bOD'.repeat(2));
});

test('counts a wide character as one arrow step and snaps its continuation cell', () => {
  const state = {
    cursorX: 3, cursorY: 0, baseY: 0,
    getLine: (row: number) => row === 0 ? {
      isWrapped: false,
      getCell: (col: number) => ({
        getChars: () => ['中', '', 'a'][col] || '',
        getWidth: () => [2, 0, 1][col] ?? 1,
      }),
    } : undefined,
  };
  expect(terminalCursorTapInput(state, 10, { row: 0, col: 1 })).toBe('\x1b[D'.repeat(2));
});
