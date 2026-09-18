function handleKeyboardClosedStationaryTap({
  point,
  urlAtPoint,
  terminalMouseInputEnabled,
  dispatchTerminalClick,
  send,
  clearInteractiveSelection,
  moveCursor = () => false,
}) {
  const link = urlAtPoint(point.clientX, point.clientY);
  if (link) {
    send({ type: 'open-link', link });
    return;
  }
  if (terminalMouseInputEnabled()) {
    dispatchTerminalClick(point);
    return;
  }
  if (!moveCursor(point)) clearInteractiveSelection(true);
}

// Only navigate within the cursor's logical (soft-wrapped) line. Sending up/down
// for arbitrary screen rows could recall or alter shell history instead.
function terminalCursorTapInput(buffer, cols, target, applicationCursorKeys = false) {
  if (!target || cols <= 0) return '';
  const cursorRow = buffer.baseY + buffer.cursorY;
  let first = cursorRow;
  let last = cursorRow;
  while (first > 0 && buffer.getLine(first)?.isWrapped) first -= 1;
  while (buffer.getLine(last + 1)?.isWrapped) last += 1;
  if (target.row < first || target.row > last) return '';
  const line = buffer.getLine(target.row);
  if (!line) return '';
  let end = cols;
  if (target.row === last) {
    end = 0;
    for (let col = 0; col < cols; col += 1) {
      const cell = line.getCell(col);
      if (cell?.getChars()) end = col + Math.max(1, cell.getWidth());
    }
    if (target.row === cursorRow) end = Math.max(end, buffer.cursorX);
  }
  let col = Math.max(0, Math.min(target.col, end));
  while (col > 0 && line.getCell(col)?.getWidth() === 0) col -= 1;
  const from = cursorRow * cols + buffer.cursorX;
  const to = target.row * cols + col;
  let steps = 0;
  for (let index = Math.min(from, to); index < Math.max(from, to); index += 1) {
    if (buffer.getLine(Math.floor(index / cols))?.getCell(index % cols)?.getWidth() > 0) steps += 1;
  }
  return ('\u001b' + (applicationCursorKeys ? 'O' : '[') + (to < from ? 'D' : 'C')).repeat(steps);
}

function terminalMouseInputSequence(action, column, row) {
  const button = action === 'wheel-up' ? 64 : action === 'wheel-down' ? 65 : 0;
  const suffix = action === 'release' ? 'm' : 'M';
  const sgrColumn = Math.max(0, Math.min(0xffff, Math.round(Number(column) || 0))) + 1;
  const sgrRow = Math.max(0, Math.min(0xffff, Math.round(Number(row) || 0))) + 1;
  return `\u001b[<${button};${sgrColumn};${sgrRow}${suffix}`;
}

function terminalMouseClickInput(column, row) {
  return terminalMouseInputSequence('press', column, row)
    + terminalMouseInputSequence('release', column, row);
}

function terminalMouseWheelInput(direction, count, column, row) {
  const action = direction === 'up' ? 'wheel-up' : 'wheel-down';
  const repeats = Math.max(1, Math.round(Number(count) || 1));
  return terminalMouseInputSequence(action, column, row).repeat(repeats);
}

function setTerminalKeyboardInputEnabled(terminal, enabled) {
  const keyboardEnabled = enabled !== false;
  const input = terminal.textarea;
  if (input) {
    input.readOnly = !keyboardEnabled;
    input.inputMode = keyboardEnabled ? '' : 'none';
  }
  if (!keyboardEnabled) terminal.blur();
  return keyboardEnabled;
}

module.exports = {
  terminalCursorTapInput,
  handleKeyboardClosedStationaryTap,
  setTerminalKeyboardInputEnabled,
  terminalMouseClickInput,
  terminalMouseInputSequence,
  terminalMouseWheelInput,
};
