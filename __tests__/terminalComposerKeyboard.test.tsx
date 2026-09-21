import { useImperativeHandle, type ComponentProps, type Ref } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import {
  Keyboard,
  Platform,
  type KeyboardEvent,
  type View,
} from 'react-native';

import { TerminalScreen } from '../src/components/TerminalScreen';
import { AgentChatView } from '../src/components/AgentChatView';
import { emptyTranscript } from '../src/agentChat';
import { terminalControlBarInset } from '../src/lib/floatingChrome';
import { getTerminalImeTopInWindow, setTerminalComposerOverlay } from '../src/services/terminalSoftInput';

jest.mock('react-native-css-interop/jsx-runtime', () =>
  jest.requireActual('react/jsx-runtime'),
);
jest.mock('react-native', () => ({
  View: 'View',
  ScrollView: 'ScrollView',
  Pressable: 'Pressable',
  Modal: 'Modal',
  Image: 'Image',
  ActivityIndicator: 'ActivityIndicator',
  PanResponder: { create: (handlers: unknown) => ({ panHandlers: handlers }) },
  NativeModules: {},
  Platform: { OS: 'android' },
  StyleSheet: { absoluteFill: {}, create: (styles: unknown) => styles },
  AppState: { addEventListener: () => ({ remove: jest.fn() }) },
  Keyboard: {
    addListener: jest.fn(),
    metrics: jest.fn(),
    isVisible: jest.fn(),
    dismiss: jest.fn(),
  },
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'AnimatedView' },
  cancelAnimation: jest.fn(),
  useSharedValue: (value: number) => ({ value }),
  useAnimatedStyle: (callback: () => unknown) => callback(),
  withTiming: (value: number) => value,
}));
jest.mock('@rn-primitives/portal', () => ({ Portal: 'Portal' }));
jest.mock('@shopify/flash-list', () => ({ FlashList: 'FlashList' }));
jest.mock('react-native-code-highlighter', () => 'CodeHighlighter');
jest.mock('react-syntax-highlighter/dist/esm/styles/hljs', () => ({
  atomOneDarkReasonable: {},
  atomOneLight: {},
}));
jest.mock('../src/components/MarkdownText', () => ({ MarkdownText: 'MarkdownText' }));
jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: (_target, name) => String(name) }),
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('../src/components/TerminalRendererHost', () => ({
  TerminalRendererHost: 'TerminalRendererHost',
}));
jest.mock('../src/components/MessageComposer', () => ({
  MessageComposer: MockMessageComposer,
  ComposerInput: 'ComposerInput',
}));
jest.mock('../src/components/GlassSurface', () => ({
  useAppGlassEnabled: () => false,
}));
jest.mock('../src/components/OverlayScrollbar', () => ({
  OverlayScrollbar: 'OverlayScrollbar',
}));
jest.mock('../src/components/AppAlertPopup', () => ({
  AppAlertPopup: 'AppAlertPopup',
}));
jest.mock('../src/components/app-ui', () => ({
  AnimatedAgentStatusGlyph: 'AgentGlyph',
  useReducedMotion: () => true,
}));
jest.mock('../src/components/ui/button', () => ({ Button: 'Button' }));
jest.mock('../src/components/ui/input', () => ({ Input: 'Input' }));
jest.mock('../src/components/ui/icon', () => ({ Icon: 'Icon' }));
jest.mock('../src/components/ui/text', () => ({ Text: 'Text' }));
jest.mock('../src/theme', () => ({
  colors: {},
  useTheme: () => ({ colors: {} }),
  appGlassControlStyle: () => ({}),
}));
jest.mock('../src/services/volumeKeys', () => ({
  addTerminalVolumeKeyListener: () => ({ remove: jest.fn() }),
}));
jest.mock('../src/services/terminalSoftInput', () => ({
  setTerminalComposerOverlay: jest.fn(async () => {}),
  getTerminalImeTopInWindow: jest.fn(async () => null),
}));
jest.mock('../src/services/operationalDiagnostics', () => ({
  recordOperationalDiagnostic: jest.fn(),
  operationalErrorDetails: () => ({}),
}));

const mockComposerHandle = { focus: jest.fn(), blur: jest.fn() };
function MockMessageComposer(composerProps: { inputRef: Ref<unknown> }) {
  useImperativeHandle(composerProps.inputRef, () => mockComposerHandle);
  return require('react/jsx-runtime').jsx('MessageComposer', composerProps);
}
const terminalHandle = {
  input: jest.fn(() => true),
  fit: jest.fn(),
  focus: jest.fn(),
  blur: jest.fn(),
  setKeyboardEnabled: jest.fn(),
  setForcedMouseInput: jest.fn(),
  sendArrow: jest.fn(() => false),
  setEditableRegion: jest.fn(),
  clearSearch: jest.fn(),
  cancelPendingResumeScroll: jest.fn(),
};
const chatListHandle = { scrollToEnd: jest.fn(), scrollToOffset: jest.fn() };
const screenHeight = 800;
let measuredViewportHeight = screenHeight;
let measuredDockHeight: number | undefined;
const keyboardHeight = 300;
const controlBarHeight = terminalControlBarInset(34);
const keyboardFrame = {
  screenX: 0,
  screenY: screenHeight - keyboardHeight,
  width: 400,
  height: keyboardHeight,
};
type Props = ComponentProps<typeof TerminalScreen>;
const target = {
  key: 'target-1',
  hostSessionId: 'host-1',
  client: {},
  session: {
    terminalId: 'terminal-1',
    title: 'Terminal',
    status: 'connected',
    reconnectAttempt: 0,
  },
} as Props['targets'][number];
const props: Props = {
  activeTarget: target,
  targets: [target],
  visible: true,
  compact: true,
  preferences: {
    fullscreen: true,
    useModifierKeyIcons: false,
    tuiMouseInputWhenKeyboardEnabled: true,
    volumeUpAction: 'none',
    volumeDownAction: 'none',
    fontSize: 14,
    scrollback: 2000,
    xtermCacheCapacity: 4,
    cursorBlink: true,
    doubleTapAction: 'none',
    openLinksInApp: false,
    pauseResizeInBackground: false,
    visualHints: false,
    backgroundImageUri: null,
    backgroundDimming: 0,
    imeToolbarCompensation: 0,
  },
  controlUsage: {},
  historyEntries: [],
  chatViewEnabled: false,
  onControlUse: jest.fn(),
  onHistoryEntry: jest.fn(),
  getComposerDraft: () => '',
  onComposerDraftChange: jest.fn(),
  onFontSizeChange: jest.fn(),
  onClose: jest.fn(),
  onStatus: jest.fn(),
};

let renderer: ReactTestRenderer;
let listeners: Map<string, Set<(event: KeyboardEvent) => void>>;
const ui = (name: string) =>
  renderer.root.find(node => node.type === (name === 'MessageComposer' ? MockMessageComposer : name));
const button = (label: string) =>
  renderer.root.find(
    node =>
      String(node.type) === 'Button' &&
      node.props.accessibilityLabel === `terminal.${label}`,
  );

function emitKeyboard(visible: boolean, screenY = keyboardFrame.screenY) {
  const frame = { ...keyboardFrame, screenY };
  jest
    .mocked(Keyboard.metrics)
    .mockReturnValue(visible ? frame : undefined);
  jest.mocked(Keyboard.isVisible).mockReturnValue(visible);
  act(() => {
    for (const listener of listeners.get(
      visible ? 'keyboardDidShow' : 'keyboardDidHide',
    ) ?? []) {
      listener({
        duration: 0,
        easing: 'keyboard',
        endCoordinates: frame,
      });
    }
  });
}

function mount(overrides: Partial<Props> = {}) {
  act(() => {
    renderer = create(<TerminalScreen {...props} {...overrides} />, {
      createNodeMock: element => {
        if (element.type === 'TerminalRendererHost') return terminalHandle;
        if (element.type === 'FlashList') return chatListHandle;
        if (element.type !== 'View') return null;
        const viewProps = element.props as ComponentProps<typeof View>;
        return {
          measureInWindow: (
            callback: Parameters<View['measureInWindow']>[0],
          ) => {
            const view = renderer.root.find(
              node =>
                String(node.type) === 'View' &&
                node.props.className === viewProps.className && node.props.testID === viewProps.testID,
            );
            const translateY =
              view.props.style?.transform?.[0]?.translateY ?? 0;
            callback(0, translateY, 400, viewProps.testID === 'terminal-dock-viewport' ? measuredDockHeight ?? measuredViewportHeight : measuredViewportHeight);
          },
        };
      },
    });
  });
  act(() => {
    ui('TerminalRendererHost').props.onReady();
  });
  act(() => jest.advanceTimersByTime(100));
  terminalHandle.fit.mockClear();
}

async function press(label: string) {
  await act(async () => button(label).props.onPress());
}

// Check the rendered ancestors before dispatching callbacks: invoking a callback
// alone would still pass when a native pointerEvents boundary blocks the gesture.
function expectTouchEnabled(node: ReactTestInstance) {
  expect(node.props.pointerEvents).not.toBe('box-none');
  for (let ancestor: ReactTestInstance | null = node; ancestor; ancestor = ancestor.parent) {
    expect(ancestor.props.pointerEvents ?? 'auto').not.toBe('none');
    expect(ancestor.props.pointerEvents ?? 'auto').not.toBe('box-only');
  }
}

function scrollEvent(offset: number) {
  return { nativeEvent: {
    contentOffset: { y: offset },
    contentSize: { height: 1000 },
    layoutMeasurement: { height: 400 },
  } };
}

beforeEach(() => {
  measuredViewportHeight = screenHeight;
  measuredDockHeight = undefined;
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.mocked(getTerminalImeTopInWindow).mockResolvedValue(null);
  listeners = new Map();
  jest.mocked(Keyboard.metrics).mockReturnValue(undefined);
  jest.mocked(Keyboard.isVisible).mockReturnValue(false);
  jest.mocked(Keyboard.addListener).mockImplementation((event, listener) => {
    const callbacks = listeners.get(event) ?? new Set();
    callbacks.add(listener);
    listeners.set(event, callbacks);
    return { remove: () => callbacks.delete(listener) } as unknown as ReturnType<
      typeof Keyboard.addListener
    >;
  });
});

afterEach(() => {
  act(() => renderer?.unmount());
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('Chat mode covers the terminal while the evicted transcript has no viewport yet', () => {
  mount();
  const onResidencyEnd = jest.fn();
  act(() => renderer.update(<TerminalScreen {...props} chatViewEnabled onResidencyEnd={onResidencyEnd} />));
  const background = renderer.root.find(node => node.props.className === 'absolute inset-0 z-10 bg-background');
  expect(background.props.accessibilityElementsHidden).toBe(true);
  expect(ui('TerminalRendererHost').props.onResidencyEnd).toBe(onResidencyEnd);
  act(() => renderer.update(<TerminalScreen {...props} />));
  expect(renderer.root.findAll(node => node.props.className === 'absolute inset-0 z-10 bg-background')).toHaveLength(0);
});

test('direction pad is the same height as controls and outside the horizontal scroller', () => {
  mount();
  const pad = renderer.root.findByProps({ accessibilityLabel: '按住并向上下左右滑动以移动光标' });
  expect(pad.props.style).toEqual(expect.objectContaining({ height: 36, width: 44 }));
  for (let parent = pad.parent; parent; parent = parent.parent) {
    expect(String(parent.type)).not.toBe('ScrollView');
  }
  expect(pad.props.onStartShouldSetPanResponderCapture()).toBe(true);
  expect(pad.props.onShouldBlockNativeResponder()).toBe(true);
});

test('fixed keys stay outside the scrolling rail when usage changes', () => {
  mount();
  const fixed = renderer.root.findByProps({ testID: 'terminal-fixed-controls' });
  const rail = renderer.root.findByProps({ testID: 'terminal-scrollable-controls' });
  const fixedButtons = () => fixed.findAll(node => String(node.type) === 'Button').map(node => node.props.accessibilityLabel);
  const original = fixedButtons();
  expect(original).toHaveLength(6);
  expect(fixed.findAll(node => node.props.accessibilityLabel === '按住并向上下左右滑动以移动光标').length).toBeGreaterThan(0);
  expect(rail.props.horizontal).toBe(true);
  expect(rail.findAll(node => String(node.type) === 'Button').some(node => node.props.accessibilityLabel && original.includes(node.props.accessibilityLabel))).toBe(false);
  expect(fixed.findAll(node => String(node.type) === 'Text').map(node => node.props.children)).toEqual(['HOME', 'TAB', 'ESC']);
  act(() => renderer.update(<TerminalScreen {...props} controlUsage={{ paste: 50, home: 999, mouse: 100 }} />));
  expect(fixedButtons()).toEqual(original);
  expect(fixed.findAll(node => String(node.type) === 'Button' && node.props.accessibilityLabel === 'terminal.enableForcedMouseInput')).toHaveLength(1);
  expect(rail.findAll(node => String(node.type) === 'Button' && node.props.accessibilityLabel === 'terminal.enableForcedMouseInput')).toHaveLength(0);
});

test('direction drags reach the terminal input bridge as arrow escape sequences', () => {
  mount();
  const pad = renderer.root.findByProps({ accessibilityLabel: '按住并向上下左右滑动以移动光标' });
  act(() => {
    pad.props.onPanResponderGrant();
    pad.props.onPanResponderMove({}, { dx: 18, dy: 0 });
    pad.props.onPanResponderMove({}, { dx: 0, dy: 0 });
    pad.props.onPanResponderMove({}, { dx: 0, dy: -18 });
    pad.props.onPanResponderMove({}, { dx: 0, dy: 0 });
    pad.props.onPanResponderRelease();
  });
  expect(terminalHandle.input.mock.calls).toEqual([['\u001b[C'], ['\u001b[A']]);
});

test('hidden terminal does not dismiss another pane keyboard or accept keyboard requests', () => {
  mount({ visible: false });
  expect(Keyboard.dismiss).not.toHaveBeenCalled();
  terminalHandle.focus.mockClear();
  act(() => { ui('TerminalRendererHost').props.onKeyboardRequested(); });
  expect(terminalHandle.focus).not.toHaveBeenCalled();
});

test('a delayed composer open cannot reopen after switching away', async () => {
  mount();
  let finish!: () => void;
  jest.mocked(setTerminalComposerOverlay).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  await press('compose');
  act(() => renderer.update(<TerminalScreen {...props} visible={false} />));
  jest.mocked(Keyboard.dismiss).mockClear();
  await act(async () => finish());
  expect(renderer.root.findAllByType(MockMessageComposer)).toHaveLength(0);
  expect(Keyboard.dismiss).not.toHaveBeenCalled();
  act(() => renderer.update(<TerminalScreen {...props} />));
  expect(renderer.root.findAllByType(MockMessageComposer)).toHaveLength(0);
});

test('hiding an open composer never globally dismisses the new pane keyboard', async () => {
  mount();
  await press('compose');
  jest.mocked(Keyboard.dismiss).mockClear();
  act(() => renderer.update(<TerminalScreen {...props} visible={false} />));
  expect(renderer.root.findAllByType(MockMessageComposer)).toHaveLength(0);
  expect(Keyboard.dismiss).not.toHaveBeenCalled();
});

test('expanded composer owns a separate keyboard measurement and collapses safely', async () => {
  mount();
  await press('compose');
  act(() => { ui('MessageComposer').props.actions.onExpand(); });
  expect(renderer.root.findAllByType(MockMessageComposer)).toHaveLength(0);
  expect(renderer.root.findAll(node => String(node.type) === 'ComposerInput')).toHaveLength(1);
  emitKeyboard(true);
  const expanded = renderer.root.find(node => node.props.className === 'flex-1 bg-terminal-canvas');
  expect(expanded.props.onLayout).toEqual(expect.any(Function));
  expect(expanded.props.style.paddingBottom).toBe(keyboardHeight);
  await press('collapseComposer');
  expect(renderer.root.findAllByType(MockMessageComposer)).toHaveLength(1);
  act(() => renderer.update(<TerminalScreen {...props} visible={false} />));
  mockComposerHandle.focus.mockClear();
  act(() => jest.advanceTimersByTime(200));
  expect(mockComposerHandle.focus).not.toHaveBeenCalled();
});

describe.each(['android', 'ios'] as const)(
  '%s terminal composer keyboard',
  platform => {
    beforeEach(() => {
      Platform.OS = platform;
    });

    test('chat stays touch-enabled and scrolls before, during, and after composing', async () => {
      mount({
        chatViewEnabled: true,
        renderViewportOverlay: (contentInsets, latestButtonBottom) => <AgentChatView
          agent="codex"
          agentStatus="idle"
          contentInsets={contentInsets}
          latestButtonBottom={latestButtonBottom}
          onOpenFile={jest.fn()}
          state={{ sessionId: 'chat-1', status: 'live', transcript: emptyTranscript('chat-1') }}
        />,
      });
      const list = ui('FlashList');
      act(() => {
        list.props.onLayout({ nativeEvent: { layout: { height: 400 } } });
        list.props.onContentSizeChange(400, 1000);
        list.props.onScroll(scrollEvent(600));
      });

      for (const composing of [false, true, false]) {
        if (composing) {
          await press('compose');
          emitKeyboard(true);
          const composer = ui('MessageComposer');
          expectTouchEnabled(composer);
          expect(composer.parent?.parent?.props.pointerEvents).toBe('box-none');
          expect(composer.props.showSoftInputOnFocus).toBe(true);
          expect(terminalHandle.setKeyboardEnabled).toHaveBeenLastCalledWith(false);
        } else if (renderer.root.findAllByType(MockMessageComposer).length) {
          await act(async () => ui('MessageComposer').props.actions.onClose());
          await act(async () => emitKeyboard(false));
        }

        expect(ui('FlashList')).toBe(list);
        expectTouchEnabled(list);
        act(() => {
          list.props.onScrollBeginDrag(scrollEvent(600));
          list.props.onScroll(scrollEvent(400));
          list.props.onScrollEndDrag(scrollEvent(400));
          list.props.onMomentumScrollBegin();
          list.props.onScroll(scrollEvent(300));
          list.props.onMomentumScrollEnd(scrollEvent(300));
        });
        const scrollbar = ui('OverlayScrollbar');
        expectTouchEnabled(scrollbar);
        act(() => {
          scrollbar.props.onDragStart({ trackHeight: 400, thumbHeight: 160 });
          scrollbar.props.onDrag({ dy: -40, trackHeight: 400, thumbHeight: 160 });
          scrollbar.props.onDragEnd();
        });
        expect(chatListHandle.scrollToOffset).toHaveBeenLastCalledWith({ offset: 200, animated: false });
        const latest = renderer.root.find(node => node.props.accessibilityLabel === 'Jump to latest');
        expectTouchEnabled(latest);
        act(() => { latest.props.onPress(); });
        expect(chatListHandle.scrollToEnd).toHaveBeenLastCalledWith({ animated: true });
        act(() => { list.props.onScroll(scrollEvent(600)); });
      }
    });

    test('terminal scrollback and scrollbar stay interactive while composer owns the keyboard', async () => {
      const scrollTerminal = jest.fn(async () => '');
      const scrollTarget = {
        ...target,
        client: { terminal: { scrollTerminal } },
        scroll: { offset_from_bottom: 0, max_offset_from_bottom: 100, viewport_rows: 24 },
      } as unknown as Props['targets'][number];
      mount({ activeTarget: scrollTarget, targets: [scrollTarget] });
      await press('enableKeyboard');
      await press('compose');
      emitKeyboard(true);
      act(() => jest.advanceTimersByTime(100));
      terminalHandle.focus.mockClear();
      mockComposerHandle.blur.mockClear();
      jest.mocked(Keyboard.dismiss).mockClear();

      const terminal = ui('TerminalRendererHost');
      expectTouchEnabled(terminal);
      const scrollbar = ui('OverlayScrollbar');
      expectTouchEnabled(scrollbar);
      const previousTop = scrollbar.props.topPercent;
      act(() => { terminal.props.onScroll(scrollTarget, 'up', 10); });
      expect(ui('OverlayScrollbar').props.topPercent).toBeLessThan(previousTop);
      act(() => {
        scrollbar.props.onDragStart({ trackHeight: 400, thumbHeight: 80 });
        scrollbar.props.onDrag({ dy: -32, trackHeight: 400, thumbHeight: 80 });
        scrollbar.props.onDragEnd();
      });
      expect(scrollTerminal).toHaveBeenCalledWith('terminal-1', 'up', 10);
      expect(terminalHandle.setKeyboardEnabled).toHaveBeenLastCalledWith(false);
      expect(terminalHandle.focus).not.toHaveBeenCalled();
      expect(mockComposerHandle.blur).not.toHaveBeenCalled();
      expect(Keyboard.dismiss).not.toHaveBeenCalled();
      expect(setTerminalComposerOverlay).toHaveBeenLastCalledWith('terminal-1', true);

      await act(async () => ui('MessageComposer').props.actions.onClose());
      await act(async () => emitKeyboard(false));
      expectTouchEnabled(terminal);
      expectTouchEnabled(ui('OverlayScrollbar'));
      expect(terminalHandle.setKeyboardEnabled).toHaveBeenLastCalledWith(true);
      expect(setTerminalComposerOverlay).toHaveBeenLastCalledWith('terminal-1', false);
    });

    test.each([false, true])(
      'opening over an already visible IME restores previous keyboard preference %s',
      async previouslyEnabled => {
        mount();
        if (previouslyEnabled) await press('enableKeyboard');
        // The IME may belong to another input while direct terminal input is disabled.
        emitKeyboard(true);
        const subscriptionCount = jest.mocked(Keyboard.addListener).mock.calls
          .length;
        await press('compose');

        const composer = ui('MessageComposer');
        expect(renderer.root.findByProps({ testID: 'terminal-input-dock' }).props.style.bottom).toBe(keyboardHeight);
        expect(composer.props.autoFocus).toBe(true);
        expect(composer.props.showSoftInputOnFocus).toBe(true);
        // Repeated native geometry must measure the viewport, not translated chrome.
        emitKeyboard(true);
        expect(renderer.root.findByProps({ testID: 'terminal-input-dock' }).props.style.bottom).toBe(keyboardHeight);
        expect(ui('TerminalRendererHost').parent?.props.style).toEqual({ marginBottom: controlBarHeight + keyboardHeight, overflow: 'hidden' });
        expect(Keyboard.addListener).toHaveBeenCalledTimes(subscriptionCount);
        expect(terminalHandle.setKeyboardEnabled).toHaveBeenLastCalledWith(
          false,
        );
        act(() => jest.advanceTimersByTime(40));
        expect(mockComposerHandle.focus).toHaveBeenCalledTimes(
          platform === 'ios' ? 0 : 1,
        );
        act(() => jest.advanceTimersByTime(60));
        expect(mockComposerHandle.focus).toHaveBeenCalledTimes(1);
        if (platform === 'android')
          expect(terminalHandle.fit).not.toHaveBeenCalled();

        await act(async () => composer.props.actions.onClose());
        // Closing waits for the actual hide before removing the floating composer.
        expect(renderer.root.findByProps({ testID: 'terminal-input-dock' }).props.style.bottom).toBe(keyboardHeight);
        await act(async () => emitKeyboard(false));
        expect(
          renderer.root.findAll(
            node => String(node.type) === 'MessageComposer',
          ),
        ).toHaveLength(0);
        expect(
          button(previouslyEnabled ? 'disableKeyboard' : 'enableKeyboard').props
            .accessibilityState.selected,
        ).toBe(previouslyEnabled);
        expect(terminalHandle.setKeyboardEnabled).toHaveBeenLastCalledWith(
          previouslyEnabled,
        );
      },
    );

    test('composer and controls share a dock measured independently of the terminal viewport', async () => {
      mount();
      measuredViewportHeight = 720;
      measuredDockHeight = screenHeight;
      emitKeyboard(true);
      await press('compose');
      const dock = renderer.root.findByProps({ testID: 'terminal-input-dock' });
      const bar = renderer.root.findByProps({ testID: 'terminal-control-bar' });
      const composerWrapper = ui('MessageComposer').parent!;
      expect(bar.parent).toBe(dock);
      expect(composerWrapper.parent).toBe(dock);
      expect(dock.children.indexOf(composerWrapper)).toBeLessThan(dock.children.indexOf(bar));
      expect(composerWrapper.props.style.position).toBeUndefined();
      expect(bar.props.style.position).toBeUndefined();
      expect(bar.props.style.flexShrink).toBe(0);
      expect(dock.props.style.bottom).toBe(keyboardHeight);
      expect(ui('TerminalRendererHost').parent?.props.style.marginBottom).toBe(controlBarHeight + 220);
    });

    test('imeToolbarCompensation lifts composer dock and layout above the soft keyboard', async () => {
      mount({
        preferences: {
          ...props.preferences,
          imeToolbarCompensation: 50,
        },
      });
      emitKeyboard(true);
      await press('compose');
      const dock = renderer.root.findByProps({ testID: 'terminal-input-dock' });
      expect(dock.props.style.bottom).toBe(keyboardHeight + 50);
      expect(ui('TerminalRendererHost').parent?.props.style.marginBottom).toBe(
        controlBarHeight + keyboardHeight + 50,
      );
    });

    test('composer focus lifts controls when an already-open IME stops resizing the window', async () => {
      mount();
      measuredViewportHeight = screenHeight - keyboardHeight;
      emitKeyboard(true);
      await press('compose');
      expect(renderer.root.findByProps({ testID: 'terminal-input-dock' }).props.style.bottom).toBe(0);

      measuredViewportHeight = screenHeight;
      act(() => { void ui('MessageComposer').props.onFocus(); });
      expect(renderer.root.findByProps({ testID: 'terminal-input-dock' }).props.style.bottom).toBe(keyboardHeight);
      const controls = renderer.root.findByProps({ testID: 'terminal-fixed-controls' });
      expect(controls.parent?.parent?.parent?.props.style.bottom).toBe(keyboardHeight);
    });

    if (platform === 'android') test('native IME inset keeps controls above keyboard when its RN frame reports no overlap', async () => {
      mount();
      emitKeyboard(true, screenHeight);
      expect(ui('TerminalRendererHost').parent?.props.style).toEqual({ marginBottom: controlBarHeight, overflow: 'hidden' });
      jest.mocked(getTerminalImeTopInWindow).mockResolvedValue(screenHeight - keyboardHeight);
      await press('compose');
      await act(async () => { void ui('MessageComposer').props.onFocus(); await Promise.resolve(); });
      expect(renderer.root.findByProps({ testID: 'terminal-input-dock' }).props.style.bottom).toBe(keyboardHeight);
      expect(renderer.root.findByProps({ testID: 'terminal-fixed-controls' }).parent?.parent?.parent?.props.style.bottom).toBe(keyboardHeight);
    });

    test('input toggles during show and hide keep composer geometry until the IME hides', async () => {
      mount();
      await press('compose');
      await press('disableKeyboard');
      emitKeyboard(true);
      expect(renderer.root.findByProps({ testID: 'terminal-input-dock' }).props.style.bottom).toBe(keyboardHeight);
      await press('enableKeyboard');
      await press('disableKeyboard');
      expect(renderer.root.findByProps({ testID: 'terminal-input-dock' }).props.style.bottom).toBe(keyboardHeight);
      emitKeyboard(false);
      expect(renderer.root.findByProps({ testID: 'terminal-input-dock' }).props.style.bottom).toBe(0);
      act(() => jest.advanceTimersByTime(100));
      expect(terminalHandle.fit).toHaveBeenCalledTimes(platform === 'ios' ? 1 : 0);
    });

    test('the direct keyboard reserves layout space until native hide completes', async () => {
      mount();
      await press('enableKeyboard');
      emitKeyboard(true);
      expect(ui('TerminalRendererHost').parent?.props.style).toEqual({
        marginBottom: controlBarHeight + keyboardHeight, overflow: 'hidden',
      });
      act(() => jest.advanceTimersByTime(100));
      expect(terminalHandle.fit).toHaveBeenCalledTimes(
        platform === 'ios' ? 1 : 0,
      );
      await press('disableKeyboard');
      expect(ui('TerminalRendererHost').parent?.props.style).toEqual({
        marginBottom: controlBarHeight + keyboardHeight, overflow: 'hidden',
      });
      emitKeyboard(false);
      expect(ui('TerminalRendererHost').parent?.props.style).toEqual({ marginBottom: controlBarHeight, overflow: 'hidden' });
      act(() => jest.advanceTimersByTime(100));
      expect(terminalHandle.fit).toHaveBeenCalledTimes(
        platform === 'ios' ? 2 : 0,
      );
    });
  },
);
