const {
  terminalCursorTapInput,
  terminalManualEditRange,
} = require('../scripts/terminal-touch-behavior.cjs');
import {
  codexAlternateEditorReplay,
  codexPrimaryEditorReplay,
  codexQuotedOutputWithoutEditorState,
} from '../test-fixtures/codexTerminalReplay.fixture';

function buffer(lines: Array<{ text: string; wrapped?: boolean }>, cursorX: number, cursorY = 0, baseY = 0) {
  return {
    cursorX, cursorY, baseY, type: 'normal',
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

function replayBuffer(replay: {
  bufferType: 'normal' | 'alternate';
  rows: string[];
  cursor: { row: number; col: number };
}) {
  return {
    cursorX: replay.cursor.col,
    cursorY: replay.cursor.row,
    baseY: 0,
    type: replay.bufferType,
    getLine: (row: number) => {
      const text = replay.rows[row];
      if (text === undefined) return undefined;
      return {
        isWrapped: false,
        translateToString: () => text,
        getCell: (col: number) => ({
          getChars: () => text[col] || '',
          getWidth: () => 1,
        }),
      };
    },
  };
}

function executeArrows(
  sequence: string,
  start: { row: number; col: number },
  rows: string[],
) {
  const cursor = { ...start };
  for (let index = 0; index < sequence.length; index += 3) {
    expect(sequence.slice(index, index + 2)).toBe('\x1b[');
    const key = sequence[index + 2];
    if (key === 'A') cursor.row -= 1;
    if (key === 'B') cursor.row += 1;
    if (key === 'C') cursor.col += 1;
    if (key === 'D') cursor.col = Math.max(0, cursor.col - 1);
    if (key === 'A' || key === 'B') {
      cursor.col = Math.min(cursor.col, rows[cursor.row].length);
    }
  }
  return cursor;
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

test('requires explicit application state on both primary and alternate screens', () => {
  for (const replay of [codexPrimaryEditorReplay, codexAlternateEditorReplay]) {
    const state = replayBuffer(replay);
    expect(terminalManualEditRange(state, 20)).toBeNull();
    expect(terminalManualEditRange(state, 20, replay.editableRegion)).toEqual({ start: 0, end: 2 });
    const sequence = terminalCursorTapInput(
      state,
      20,
      { row: 0, col: 1 },
      false,
      { editableRegion: replay.editableRegion },
    );
    expect(sequence).toBe('\x1b[A\x1b[A\x1b[D');
    expect(executeArrows(sequence, replay.cursor, replay.rows)).toEqual({ row: 0, col: 1 });
  }
});

test('does not infer an editor from quoted output, menus, or prompt-shaped rows', () => {
  const state = replayBuffer(codexQuotedOutputWithoutEditorState);
  expect(terminalManualEditRange(state, 20)).toBeNull();
  expect(terminalCursorTapInput(state, 20, { row: 0, col: 2 })).toBe('');
});

test('corrects the post-vertical column using the rendered destination row', () => {
  const rows = ['ab', 'longer draft', 'status'];
  const state = replayBuffer({
    bufferType: 'normal',
    rows,
    cursor: { row: 1, col: 8 },
  });
  const editableRegion = {
    source: 'application',
    mode: 'line-editor-clamped',
    startRow: 0,
    endRow: 2,
    cursorRow: 1,
    cursorCol: 8,
  };
  const sequence = terminalCursorTapInput(
    state, 20, { row: 0, col: 1 }, false, { editableRegion },
  );
  expect(sequence).toBe('\x1b[A\x1b[D');
  expect(executeArrows(sequence, { row: 1, col: 8 }, rows)).toEqual({ row: 0, col: 1 });
});

test('snaps a wide-character continuation cell while moving to an explicit row', () => {
  const rows = ['quoted', '中a', 'last'];
  const state = {
    cursorX: 2, cursorY: 2, baseY: 0, type: 'normal',
    getLine: (row: number) => rows[row] === undefined ? undefined : {
      isWrapped: false,
      translateToString: () => rows[row],
      getCell: (col: number) => ({
        getChars: () => row === 1 ? ['中', '', 'a'][col] || '' : rows[row][col] || '',
        getWidth: () => row === 1 ? [2, 0, 1][col] || 1 : 1,
      }),
    },
  };
  const editableRegion = {
    source: 'application',
    mode: 'line-editor-clamped',
    startRow: 0,
    endRow: 2,
    cursorRow: 2,
    cursorCol: 2,
  };
  expect(terminalCursorTapInput(
    state, 12, { row: 1, col: 1 }, false, { editableRegion },
  )).toBe('\x1b[A\x1b[D');
});

test('supports the complete explicit range in both directions, including blank rows beyond twelve', () => {
  const rows = Array.from({ length: 16 }, (_, index) => index === 4 ? '' : `line-${index}`);
  const state = replayBuffer({
    bufferType: 'normal',
    rows,
    cursor: { row: 8, col: 5 },
  });
  const editableRegion = {
    source: 'application',
    mode: 'line-editor-clamped',
    startRow: 0,
    endRow: 15,
    cursorRow: 8,
    cursorCol: 5,
  };
  const above = terminalCursorTapInput(
    state, 30, { row: 0, col: 2 }, false, { editableRegion },
  );
  expect(above).toBe('\x1b[A'.repeat(8) + '\x1b[C'.repeat(2));
  expect(executeArrows(above, { row: 8, col: 5 }, rows)).toEqual({ row: 0, col: 2 });

  const below = terminalCursorTapInput(
    { ...state, cursorY: 0, cursorX: 2 },
    30,
    { row: 15, col: 2 },
    false,
    { editableRegion: { ...editableRegion, cursorRow: 0, cursorCol: 2 } },
  );
  expect(below).toBe('\x1b[B'.repeat(15) + '\x1b[C'.repeat(2));
});
