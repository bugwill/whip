import { useCallback, useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';
import { Keyboard, type View } from 'react-native';
import { reportBackgroundFailure } from '../services/backgroundOperations';

interface KeyboardInsetOptions {
  // Platform opt-out; terminal input preferences must not gate IME geometry.
  enabled?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
  getKeyboardTop?: () => Promise<number | null>;
  additionalOffset?: number;
}

export function useKeyboardInset(
  measuredViewRef: RefObject<View | null>,
  { enabled = true, onVisibilityChange, getKeyboardTop, additionalOffset = 0 }: KeyboardInsetOptions = {},
) {
  const [inset, setInset] = useState(0);
  const measurementRevision = useRef(0);
  const retryTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const cancelRetries = useCallback(() => {
    for (const timer of retryTimers.current) clearTimeout(timer);
    retryTimers.current = [];
  }, []);
  const keyboardTopRef = useRef<number | null>(null);
  const keyboardHeightRef = useRef(0);
  const keyboardVisibleRef = useRef(false);
  const viewportBottomRef = useRef<number | null>(null);
  const additionalOffsetRef = useRef(Math.max(0, additionalOffset));
  additionalOffsetRef.current = Math.max(0, additionalOffset);
  const measureViewportBottom = useCallback(() => {
    measuredViewRef.current?.measureInWindow((_x, y, _width, height) => {
      viewportBottomRef.current = Math.ceil(y + height);
    });
  }, [measuredViewRef]);
  const remeasure = useCallback(() => {
    // Keep a pre-IME bottom coordinate. Android may report a full-window
    // keyboard frame while the activity is using adjustNothing; in that case
    // the measured overlap is zero even though the IME covers the viewport.
    if (!enabled) return;
    if (!keyboardVisibleRef.current) {
      measureViewportBottom();
      return;
    }
    const revision = ++measurementRevision.current;
    const measure = (keyboardTop: number, applyInset = true) => {
      measuredViewRef.current?.measureInWindow((_x, y, _width, height) => {
        if (revision !== measurementRevision.current) return;
        const viewportBottom = Math.ceil(y + height);
        if (!applyInset) {
          // On Android, the RN frame can describe a transient or zero-sized
          // IME surface. Keep it as a layout sample, but wait for the native
          // WindowInsets geometry before reserving space.
          viewportBottomRef.current = viewportBottom;
          return;
        }
        const overlap = Math.max(0, viewportBottom - keyboardTop);
        const baselineBottom = viewportBottomRef.current;
        const frameDescribesOverlay =
          keyboardHeightRef.current > 0 &&
          baselineBottom !== null &&
          viewportBottom >= baselineBottom - 2 &&
          keyboardTop >= baselineBottom - 2;
        const rawInset = frameDescribesOverlay
          ? Math.max(overlap, Math.ceil(keyboardHeightRef.current))
          : overlap;
        const isKeyboardActive = keyboardVisibleRef.current;
        const offset = isKeyboardActive ? additionalOffsetRef.current : 0;
        setInset(isKeyboardActive ? rawInset + offset : 0);
      });
    };
    // Keep the existing frame event responsive; WindowInsets corrects it once
    // the native window has finished changing its soft-input adjustment mode.
    if (keyboardTopRef.current !== null) {
      // Native Android IME geometry is authoritative when supplied. The RN
      // frame still measures the current viewport, but must not move layout
      // by itself while the IME surface is settling.
      measure(keyboardTopRef.current, !getKeyboardTop);
    }
    if (getKeyboardTop) {
      reportBackgroundFailure(getKeyboardTop().then(nativeTop => {
        if (revision !== measurementRevision.current) return;
        keyboardTopRef.current = nativeTop;
        if (nativeTop === null) {
          // A visible flag without a usable IME surface is a phantom IME
          // state. Keep the visibility state for focus handling, but do not
          // reserve the transient inset that causes the whole UI to jump.
          setInset(0);
          return;
        }
        measure(nativeTop);
      }), 'keyboard-inset-native-ime-top');
    }
  }, [enabled, getKeyboardTop, measureViewportBottom, measuredViewRef]);
  const resetInset = useCallback(() => {
    cancelRetries();
    keyboardTopRef.current = null;
    keyboardHeightRef.current = 0;
    keyboardVisibleRef.current = false;
    measurementRevision.current += 1;
    setInset(0);
  }, [cancelRetries]);
  const reportVisibility = useEffectEvent((visible: boolean) => {
    onVisibilityChange?.(visible);
  });

  useEffect(() => {
    if (keyboardVisibleRef.current) {
      remeasure();
    }
  }, [additionalOffset, remeasure]);

  useEffect(() => {
    if (!enabled) {
      resetInset();
      reportVisibility(false);
      return;
    }

    const measure = (keyboardTop: number, keyboardHeight = keyboardHeightRef.current) => {
      keyboardTopRef.current = keyboardTop;
      if (keyboardHeight > 0) keyboardHeightRef.current = keyboardHeight;
      keyboardVisibleRef.current = true;
      reportVisibility(true);
      remeasure();
      cancelRetries();
      if (getKeyboardTop) {
        // IME insets can settle after the only keyboardDidShow event. Bound
        // retries to this transition; hiding/unmounting cancels every timer.
        retryTimers.current = [80, 250, 500].map(delay => setTimeout(() => {
          if (keyboardVisibleRef.current) remeasure();
        }, delay));
      }
    };
    const show = Keyboard.addListener('keyboardDidShow', event => {
      measure(event.endCoordinates.screenY, event.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      resetInset();
      reportVisibility(false);
    });
    const frame = Keyboard.addListener('keyboardDidChangeFrame', event => {
      if (keyboardVisibleRef.current)
        measure(event.endCoordinates.screenY, event.endCoordinates.height);
    });

    // The IME may have opened before subscription, with no further show event.
    const metrics = Keyboard.metrics?.();
    if (metrics) measure(metrics.screenY, metrics.height);
    else {
      const visible = Keyboard.isVisible?.() ?? false;
      keyboardVisibleRef.current = visible;
      reportVisibility(visible);
      if (visible && getKeyboardTop) measure(0);
    }

    return () => {
      cancelRetries();
      measurementRevision.current += 1;
      show.remove();
      hide.remove();
      frame.remove();
    };
  }, [cancelRetries, enabled, getKeyboardTop, measuredViewRef, resetInset, remeasure]);

  return { inset, resetInset, remeasure };
}
