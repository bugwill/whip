import {
  shouldShowTerminalSessionChrome,
  terminalControlBarInset,
  terminalViewportLayout,
} from '../src/lib/floatingChrome';

describe('terminal keyboard and composer geometry', () => {
  const controlBarHeight = terminalControlBarInset(34);

  test('the direct keyboard reserves layout space without changing terminal chrome', () => {
    const layout = terminalViewportLayout({
      composerExpanded: false,
      composerHeight: 112,
      composerVisible: false,
      controlBarHeight,
      keyboardInset: 301,
      topInset: 0,
    });

    expect(layout).toEqual({
      floatingKeyboardInset: 0,
      layoutKeyboardInset: 385,
      overlayInsets: { top: 0, bottom: 0 },
      terminalInsets: { top: 0, bottom: 0 },
    });
  });

  test('opening the composer reserves its height in addition to controls and keyboard', () => {
    const closed = terminalViewportLayout({
      composerExpanded: false,
      composerHeight: 112,
      composerVisible: false,
      controlBarHeight,
      keyboardInset: 301,
      topInset: 0,
    });
    const open = terminalViewportLayout({
      composerExpanded: false,
      composerHeight: 112,
      composerVisible: true,
      controlBarHeight,
      keyboardInset: 301,
      topInset: 0,
    });

    expect(open.terminalInsets).toEqual(closed.terminalInsets);
    expect(open.layoutKeyboardInset).toBe(closed.layoutKeyboardInset + 112);
    expect(open.floatingKeyboardInset).toBe(0);
    expect(open.overlayInsets).toEqual({ top: 0, bottom: 0 });
  });

  test('expanded composer content shares the keyboard inset but not floating composer height', () => {
    const layout = terminalViewportLayout({
      composerExpanded: true,
      composerHeight: 240,
      composerVisible: true,
      controlBarHeight,
      keyboardInset: 301,
      topInset: 0,
    });

    expect(layout.layoutKeyboardInset).toBe(385);
    expect(layout.terminalInsets).toEqual({ top: 0, bottom: 0 });
    expect(layout.overlayInsets).toEqual({ top: 0, bottom: 0 });
  });

  test('a hardware keyboard still leaves space for the composer and its changing height', () => {
    for (const composerHeight of [112, 240]) {
      const layout = terminalViewportLayout({
        composerExpanded: false,
        composerHeight,
        composerVisible: true,
        controlBarHeight,
        keyboardInset: 0,
        topInset: 0,
      });
      expect(layout.layoutKeyboardInset).toBe(controlBarHeight + composerHeight);
      expect(layout.terminalInsets.bottom).toBe(0);
    }
    const closed = terminalViewportLayout({
      composerExpanded: false,
      composerHeight: 240,
      composerVisible: false,
      controlBarHeight,
      keyboardInset: 0,
      topInset: 0,
    });
    expect(closed.layoutKeyboardInset).toBe(controlBarHeight);
  });

  test.each([
    {
      composerVisible: false,
      keyboardEnabled: false,
      keyboardVisible: false,
      visible: true,
    },
    {
      composerVisible: false,
      keyboardEnabled: true,
      keyboardVisible: false,
      visible: true,
    },
    {
      composerVisible: false,
      keyboardEnabled: false,
      keyboardVisible: true,
      visible: true,
    },
    {
      composerVisible: true,
      keyboardEnabled: false,
      keyboardVisible: false,
      visible: true,
    },
    {
      composerVisible: true,
      keyboardEnabled: true,
      keyboardVisible: true,
      visible: true,
    },
  ])(
    'keeps session chrome visible with or without the keyboard and composer',
    ({ visible, ...state }) => {
      expect(shouldShowTerminalSessionChrome(state)).toBe(visible);
    },
  );
});
