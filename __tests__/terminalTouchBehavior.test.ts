const {
  handleTerminalStationaryTap,
  handleKeyboardClosedStationaryTap,
  setTerminalKeyboardInputEnabled,
  terminalCellAtPoint,
  terminalMousePointForAction,
  terminalMouseClickInput,
  terminalMouseWheelInput,
} = require('../scripts/terminal-touch-behavior.cjs') as {
  handleTerminalStationaryTap: (options: {
    point: { clientX: number; clientY: number };
    keyboardEnabled: boolean;
    urlAtPoint: (x: number, y: number) => string | null;
    terminalMouseInputEnabled: () => boolean;
    dispatchTerminalClick: (point: { clientX: number; clientY: number }) => boolean;
    send: (message: { type: string; link?: string }) => void;
    clearInteractiveSelection: (clearNativeSelection: boolean) => void;
    moveCursor: (point: { clientX: number; clientY: number }) => boolean;
  }) => boolean;
  handleKeyboardClosedStationaryTap: (options: {
    point: { clientX: number; clientY: number };
    urlAtPoint: (x: number, y: number) => string | null;
    terminalMouseInputEnabled: () => boolean;
    dispatchTerminalClick: (point: { clientX: number; clientY: number }) => boolean;
    send: (message: { type: string; link?: string }) => void;
    clearInteractiveSelection: (clearNativeSelection: boolean) => void;
  }) => void;
  terminalCellAtPoint: (
    point: { clientX: number; clientY: number },
    rect: { left: number; top: number; width: number; height: number },
    columns: number,
    rows: number,
    rowBase?: number,
  ) => { col: number; row: number } | null;
  terminalMousePointForAction: (
    action: 'down' | 'move' | 'up',
    point: { clientX: number; clientY: number } | null,
    fallbackPoint: { clientX: number; clientY: number } | null,
    cellAtPoint: (point: { clientX: number; clientY: number }) => { col: number; row: number } | null,
  ) => { clientX: number; clientY: number } | null;
  setTerminalKeyboardInputEnabled: (
    terminal: {
      textarea: { readOnly: boolean; inputMode: string };
      blur: () => void;
    },
    enabled: boolean,
  ) => boolean;
  terminalMouseClickInput: (
    column: number,
    row: number,
  ) => string;
  terminalMouseWheelInput: (
    direction: 'up' | 'down',
    count: number,
    column: number,
    row: number,
  ) => string;
};

const point = { clientX: 44, clientY: 40 };

function tapHarness(mouseInputEnabled: boolean, link: string | null = null) {
  const messages: Array<{ type: string; link?: string }> = [];
  const dispatchTerminalClick = jest.fn(() => true);
  const clearInteractiveSelection = jest.fn();

  handleKeyboardClosedStationaryTap({
    point,
    urlAtPoint: () => link,
    terminalMouseInputEnabled: () => mouseInputEnabled,
    dispatchTerminalClick,
    send: message => messages.push(message),
    clearInteractiveSelection,
  });

  return { messages, dispatchTerminalClick, clearInteractiveSelection };
}

test('keyboard-closed stationary tap emits no input when mouse input is disabled', () => {
  const result = tapHarness(false);

  expect(result.messages).toEqual([]);
  expect(result.dispatchTerminalClick).not.toHaveBeenCalled();
  expect(result.clearInteractiveSelection).toHaveBeenCalledWith(true);
});

test('keyboard-closed stationary tap dispatches when mouse input is enabled', () => {
  const result = tapHarness(true);

  expect(result.messages).toEqual([]);
  expect(result.dispatchTerminalClick).toHaveBeenCalledWith(point);
  expect(result.clearInteractiveSelection).not.toHaveBeenCalled();
});

test('keyboard-closed stationary tap opens a link before considering mouse input', () => {
  const result = tapHarness(true, 'https://example.com/');

  expect(result.messages).toEqual([{
    type: 'open-link',
    link: 'https://example.com/',
  }]);
  expect(result.dispatchTerminalClick).not.toHaveBeenCalled();
});

test('maps only points inside the transformed screen and preserves the scrolled row base', () => {
  const screen = { left: 16, top: 120, width: 800, height: 480 };

  expect(terminalCellAtPoint({ clientX: 15, clientY: 240 }, screen, 80, 24, 90)).toBeNull();
  expect(terminalCellAtPoint({ clientX: 420, clientY: 600 }, screen, 80, 24, 90)).toBeNull();
  expect(terminalCellAtPoint({ clientX: 416, clientY: 240 }, screen, 80, 24, 90)).toEqual({
    col: 40,
    row: 96,
  });
});

test('stationary activation opens only the link at the current tap cell', () => {
  const messages: Array<{ type: string; link?: string }> = [];
  const dispatchTerminalClick = jest.fn(() => true);
  const moveCursor = jest.fn(() => false);
  const clearInteractiveSelection = jest.fn();

  expect(handleTerminalStationaryTap({
    point,
    keyboardEnabled: true,
    urlAtPoint: (x, y) => x === point.clientX && y === point.clientY
      ? 'https://example.com/current'
      : null,
    terminalMouseInputEnabled: () => true,
    dispatchTerminalClick,
    send: message => messages.push(message),
    clearInteractiveSelection,
    moveCursor,
  })).toBe(true);

  expect(messages).toEqual([{
    type: 'open-link',
    link: 'https://example.com/current',
  }]);
  expect(dispatchTerminalClick).not.toHaveBeenCalled();
  expect(moveCursor).not.toHaveBeenCalled();
});

test('a tap outside the screen or in the composer cannot fall through to an old link', () => {
  const screen = { left: 16, top: 120, width: 800, height: 480 };
  const outside = { clientX: 400, clientY: 620 };
  const messages: Array<{ type: string; link?: string }> = [];
  const clearInteractiveSelection = jest.fn();

  expect(terminalCellAtPoint(outside, screen, 80, 24, 90)).toBeNull();
  expect(handleTerminalStationaryTap({
    point: outside,
    keyboardEnabled: false,
    urlAtPoint: () => null,
    terminalMouseInputEnabled: () => false,
    dispatchTerminalClick: jest.fn(() => true),
    send: message => messages.push(message),
    clearInteractiveSelection,
    moveCursor: jest.fn(() => false),
  })).toBe(false);
  expect(messages).toEqual([]);
  expect(clearInteractiveSelection).toHaveBeenCalledWith(true);
});

test('keeps an active TUI mouse drag paired when release lands outside the screen', () => {
  const screen = { left: 16, top: 120, width: 800, height: 480 };
  const cellAtPoint = (candidate: { clientX: number; clientY: number }) =>
    terminalCellAtPoint(candidate, screen, 80, 24);
  const lastValidPoint = { clientX: 400, clientY: 240 };
  const outsidePoint = { clientX: 400, clientY: 620 };

  expect(terminalMousePointForAction('down', outsidePoint, lastValidPoint, cellAtPoint)).toBeNull();
  expect(terminalMousePointForAction('move', outsidePoint, lastValidPoint, cellAtPoint)).toBe(outsidePoint);
  expect(terminalMousePointForAction('up', outsidePoint, lastValidPoint, cellAtPoint)).toBe(lastValidPoint);
});

test('encodes forced TUI clicks and wheel input with SGR cell coordinates', () => {
  expect(
    terminalMouseClickInput(11, 6),
  ).toBe('\u001b[<0;12;7M\u001b[<0;12;7m');
  expect(terminalMouseWheelInput('up', 2, 11, 6)).toBe(
    '\u001b[<64;12;7M\u001b[<64;12;7M',
  );
  expect(terminalMouseWheelInput('down', 1, 11, 6)).toBe('\u001b[<65;12;7M');
});

test('keyboard-disabled xterm remains focusable for mouse handling without opening the IME', () => {
  const terminal = {
    textarea: { readOnly: false, inputMode: '' },
    blur: jest.fn(),
  };

  expect(setTerminalKeyboardInputEnabled(terminal, false)).toBe(false);
  expect(terminal.textarea).toEqual({ readOnly: true, inputMode: 'none' });
  expect(terminal.blur).toHaveBeenCalledTimes(1);

  expect(setTerminalKeyboardInputEnabled(terminal, true)).toBe(true);
  expect(terminal.textarea).toEqual({ readOnly: false, inputMode: '' });
});
