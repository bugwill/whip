function terminalCellAtPoint(point, rect, columns, rows, rowBase = 0) {
  if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top)
    || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)
    || rect.width <= 0 || rect.height <= 0 || columns <= 0 || rows <= 0) {
    return null;
  }
  const x = Number(point?.clientX);
  const y = Number(point?.clientY);
  if (!Number.isFinite(x) || !Number.isFinite(y)
    || x < rect.left || x >= rect.left + rect.width
    || y < rect.top || y >= rect.top + rect.height) {
    return null;
  }
  return {
    col: Math.min(columns - 1, Math.floor((x - rect.left) / (rect.width / columns))),
    row: rowBase + Math.min(rows - 1, Math.floor((y - rect.top) / (rect.height / rows))),
  };
}

function terminalMousePointForAction(action, point, fallbackPoint, cellAtPoint) {
  if (!point) return null;
  if (action === 'down' && !cellAtPoint(point)) return null;
  if (action === 'up' && !cellAtPoint(point)) {
    return fallbackPoint && cellAtPoint(fallbackPoint) ? fallbackPoint : null;
  }
  return point;
}

function handleTerminalStationaryTap({
  point,
  keyboardEnabled = false,
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
    return true;
  }
  if (terminalMouseInputEnabled()) {
    dispatchTerminalClick(point);
    return true;
  }
  if (moveCursor(point)) return true;
  if (!keyboardEnabled) clearInteractiveSelection(true);
  return false;
}

function handleKeyboardClosedStationaryTap(options) {
  return handleTerminalStationaryTap({
    ...options,
    keyboardEnabled: false,
  });
}

// A valid terminal cell is the stable hit target for direct keyboard input.
// Do not let taps outside the xterm screen focus its hidden textarea.
function terminalTapRequestsKeyboard(point, keyboardEnabled, offlineScrollback, cellAtPoint) {
  return !keyboardEnabled && !offlineScrollback && Boolean(cellAtPoint(point));
}

/**
 * Validate the only safe source of a hard-newline editing range.
 *
 * xterm exposes rendered cells, not ownership semantics. A prompt-looking
 * row, alternate-screen mode, or a nearby cursor is therefore not enough to
 * distinguish an editor from scrollback, quoted output, menus, or a shell.
 * The application must explicitly provide this range and the editor's tested
 * vertical-column policy. The same protocol works on the primary and
 * alternate screen.
 */
function terminalManualEditRange(buffer, cols, editableRegion) {
  if (!editableRegion || cols <= 0) return null;
  if (editableRegion.source !== 'application'
    || editableRegion.mode !== 'line-editor-clamped') return null;
  const start = Number(editableRegion.startRow);
  const end = Number(editableRegion.endRow);
  const cursorRow = buffer.baseY + buffer.cursorY;
  const cursorCol = buffer.cursorX;
  if (!Number.isInteger(start) || !Number.isInteger(end)
    || start < 0 || end < start || cursorRow < start || cursorRow > end) return null;
  if (editableRegion.cursorRow !== cursorRow || editableRegion.cursorCol !== cursorCol) return null;
  if (!buffer.getLine(start) || !buffer.getLine(end)) return null;
  return { start, end };
}

function terminalVisibleCellCount(line, cols, from, to) {
  const start = Math.max(0, Math.min(cols, Math.min(from, to)));
  const end = Math.max(0, Math.min(cols, Math.max(from, to)));
  let count = 0;
  for (let col = start; col < end; col += 1) {
    if ((line?.getCell?.(col)?.getWidth?.() || 0) > 0) count += 1;
  }
  return count;
}

function terminalLineEndColumn(line, cols, cursorCol = 0) {
  let end = 0;
  for (let col = 0; col < cols; col += 1) {
    const cell = line?.getCell?.(col);
    if (cell?.getChars?.()) end = col + Math.max(1, cell.getWidth?.() || 1);
  }
  return Math.max(end, cursorCol);
}

function terminalCursorSequence(direction, count, applicationCursorKeys) {
  if (!count) return '';
  const suffix = direction === 'up' ? 'A' : direction === 'down' ? 'B'
    : direction === 'left' ? 'D' : 'C';
  return ('\u001b' + (applicationCursorKeys ? 'O' : '[') + suffix).repeat(count);
}

function terminalEditorLineColumn(line, cols, requestedCol) {
  let col = Math.max(0, Math.min(requestedCol, terminalLineEndColumn(line, cols)));
  while (col > 0 && line?.getCell?.(col)?.getWidth?.() === 0) col -= 1;
  return col;
}

function terminalExplicitEditorInput(
  buffer,
  cols,
  target,
  editableRegion,
  applicationCursorKeys,
) {
  const manualRange = terminalManualEditRange(buffer, cols, editableRegion);
  if (!manualRange || target.row < manualRange.start || target.row > manualRange.end) return '';
  const line = buffer.getLine(target.row);
  if (!line) return '';
  const targetCol = terminalEditorLineColumn(line, cols, target.col);
  const cursorRow = buffer.baseY + buffer.cursorY;
  let currentCol = buffer.cursorX;
  let vertical = '';
  const direction = target.row < cursorRow ? 'up' : 'down';
  const step = target.row < cursorRow ? -1 : 1;
  for (let row = cursorRow; row !== target.row; row += step) {
    const nextRow = row + step;
    const nextLine = buffer.getLine(nextRow);
    if (!nextLine) return '';
    currentCol = Math.min(currentCol, terminalLineEndColumn(nextLine, cols));
    vertical += terminalCursorSequence(direction, 1, applicationCursorKeys);
  }
  const horizontalSteps = terminalVisibleCellCount(line, cols, currentCol, targetCol);
  return vertical + terminalCursorSequence(
    targetCol < currentCol ? 'left' : 'right',
    horizontalSteps,
    applicationCursorKeys,
  );
}

// Navigate within the cursor's logical soft-wrapped line. For hard-newline
// editors, vertical movement is allowed only when the application has supplied
// a current, explicit region and a tested clamped-column policy. Never send
// up/down for an unrecognised row: that can recall shell history or trigger an
// application-specific command/menu action.
function terminalCursorTapInput(buffer, cols, target, applicationCursorKeys = false, options = {}) {
  if (!target || cols <= 0) return '';
  const cursorRow = buffer.baseY + buffer.cursorY;
  let first = cursorRow;
  let last = cursorRow;
  while (first > 0 && buffer.getLine(first)?.isWrapped) first -= 1;
  while (buffer.getLine(last + 1)?.isWrapped) last += 1;
  const manualRange = terminalManualEditRange(
    buffer,
    cols,
    options.editableRegion || options.manualEditRange,
  );
  const softTarget = target.row >= first && target.row <= last;
  const manualTarget = manualRange
    && target.row >= manualRange.start
    && target.row <= manualRange.end;
  if (!softTarget && !manualTarget) return '';
  const line = buffer.getLine(target.row);
  if (!line) return '';
  let end = cols;
  if (target.row === last || manualTarget) {
    end = 0;
    for (let col = 0; col < cols; col += 1) {
      const cell = line.getCell(col);
      if (cell?.getChars()) end = col + Math.max(1, cell.getWidth?.() || 1);
    }
    if (target.row === cursorRow) end = Math.max(end, buffer.cursorX);
  }
  let col = Math.max(0, Math.min(target.col, end));
  while (col > 0 && line.getCell(col)?.getWidth() === 0) col -= 1;

  if (manualTarget) {
    return terminalExplicitEditorInput(
      buffer,
      cols,
      target,
      options.editableRegion || options.manualEditRange,
      applicationCursorKeys,
    );
  }

  const from = cursorRow * cols + buffer.cursorX;
  const to = target.row * cols + col;
  let steps = 0;
  for (let index = Math.min(from, to); index < Math.max(from, to); index += 1) {
    if (buffer.getLine(Math.floor(index / cols))?.getCell(index % cols)?.getWidth() > 0) steps += 1;
  }
  return ('\u001b' + (applicationCursorKeys ? 'O' : '[') + (to < from ? 'D' : 'C')).repeat(steps);
}

function terminalMouseInputSequence(action, column, row) {
  const button = action === 'wheel-up' ? 64
    : action === 'wheel-down' ? 65
      : action === 'drag' ? 32 : 0;
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
    if (input.style) input.style.pointerEvents = keyboardEnabled ? 'auto' : 'none';
    if ('tabIndex' in input) input.tabIndex = keyboardEnabled ? 0 : -1;
  }
  if (!keyboardEnabled) terminal.blur();
  return keyboardEnabled;
}

module.exports = {
  terminalCellAtPoint,
  terminalMousePointForAction,
  terminalManualEditRange,
  terminalVisibleCellCount,
  terminalCursorTapInput,
  handleTerminalStationaryTap,
  handleKeyboardClosedStationaryTap,
  terminalTapRequestsKeyboard,
  setTerminalKeyboardInputEnabled,
  terminalMouseClickInput,
  terminalMouseInputSequence,
  terminalMouseWheelInput,
};
