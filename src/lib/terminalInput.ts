export type TerminalModifierState = 'off' | 'armed' | 'locked';

export function applyTerminalModifiers(
  data: string,
  ctrl: TerminalModifierState,
  alt: TerminalModifierState,
  shift: TerminalModifierState = 'off',
  kittyKeyboardReportAll = false,
): string {
  if (kittyKeyboardReportAll) {
    return applyKittyKeyboardReportAll(data, ctrl, alt, shift);
  }
  const navigation = applyLegacyNavigationModifiers(data, ctrl, alt, shift);
  if (navigation !== null) return navigation;
  let value = shift === 'off' ? data : applyShift(data);
  if (ctrl !== 'off' && value.length === 1) {
    value = String.fromCharCode(value.toUpperCase().charCodeAt(0) % 32);
  }
  if (alt !== 'off') value = `\u001b${value}`;
  return value;
}

function applyKittyKeyboardReportAll(
  data: string,
  ctrl: TerminalModifierState,
  alt: TerminalModifierState,
  shift: TerminalModifierState,
): string {
  const modifiers = 1
    + (shift === 'off' ? 0 : 1)
    + (alt === 'off' ? 0 : 2)
    + (ctrl === 'off' ? 0 : 4);
  const modifierField = `${modifiers}:1`;
  const csiBody = data.startsWith('\u001b[') ? data.slice(2) : '';
  const csiKey = csiBody.match(/^(?:1;\d+)?([ABCDHF])$/);
  if (csiKey) return `\u001b[1;${modifierField}${csiKey[1]}`;
  const ss3Key = data.startsWith('\u001bO') && data.length === 3 ? data[2] : '';
  if (ss3Key && 'ABCDHF'.includes(ss3Key)) {
    return `\u001b[1;${modifierField}${ss3Key}`;
  }
  const pageKey = csiBody.match(/^([56])(?:;\d+)?~$/);
  if (pageKey) return `\u001b[${pageKey[1]};${modifierField}~`;
  if (data === '\u001b[Z') return `\u001b[9;${modifierField}u`;

  const controlCode = data === '\r' ? 13
    : data === '\t' ? 9
      : data === '\u001b' ? 27
        : data === '\u007f' ? 127
          : null;
  if (controlCode !== null) return `\u001b[${controlCode};${modifierField}u`;

  // Preserve protocol sequences, including bracketed paste and SGR mouse
  // reports, which have already been encoded by the terminal surface.
  if (data.startsWith('\u001b')) return data;

  const shifted = shift === 'off' ? data : applyShift(data);
  if (data.length === 1) {
    const base = data.codePointAt(0)!;
    const shiftedCodePoint = shifted.codePointAt(0)!;
    const keyField = shiftedCodePoint === base ? `${base}` : `${base}:${shiftedCodePoint}`;
    const textField = ctrl === 'off' && alt === 'off' && shiftedCodePoint >= 0x20
      ? `;${shiftedCodePoint}`
      : '';
    return `\u001b[${keyField};${modifierField}${textField}u`;
  }

  const text = Array.from(data).map(character => character.codePointAt(0)).filter(
    (codePoint): codePoint is number => codePoint !== undefined && codePoint >= 0x20,
  );
  if (text.length === 0) return data;
  return `\u001b[0;${modifierField};${text.join(':')}u`;
}

const SHIFTED_CHARACTERS: Record<string, string> = {
  '`': '~',
  '1': '!',
  '2': '@',
  '3': '#',
  '4': '$',
  '5': '%',
  '6': '^',
  '7': '&',
  '8': '*',
  '9': '(',
  '0': ')',
  '-': '_',
  '=': '+',
  '[': '{',
  ']': '}',
  '\\': '|',
  ';': ':',
  "'": '"',
  ',': '<',
  '.': '>',
  '/': '?',
};

function applyShift(data: string): string {
  if (data === '\t') return '\u001b[Z';
  if (data.length === 3 && data.startsWith('\u001b[') && 'ABCDHF'.includes(data[2])) {
    return `\u001b[1;2${data[2]}`;
  }
  if (data.length === 4 && data.startsWith('\u001b[') && '56'.includes(data[2]) && data[3] === '~') {
    return `\u001b[${data[2]};2~`;
  }
  if (data.length !== 1) return data;
  if (data >= 'a' && data <= 'z') return data.toUpperCase();
  return SHIFTED_CHARACTERS[data] || data;
}

function applyLegacyNavigationModifiers(
  data: string,
  ctrl: TerminalModifierState,
  alt: TerminalModifierState,
  shift: TerminalModifierState,
): string | null {
  const modifier = 1
    + (shift === 'off' ? 0 : 1)
    + (alt === 'off' ? 0 : 2)
    + (ctrl === 'off' ? 0 : 4);
  if (modifier === 1) return null;

  const cursor = data.startsWith('\u001b[') || data.startsWith('\u001bO')
    ? data.length === 3 ? data[2] : ''
    : '';
  if (cursor && 'ABCDHF'.includes(cursor)) return `\u001b[1;${modifier}${cursor}`;
  const page = data.startsWith('\u001b[') && data.length === 4
    && '56'.includes(data[2]) && data[3] === '~' ? data[2] : '';
  if (page) return `\u001b[${page};${modifier}~`;
  return null;
}
