import { useCallback, useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';
import { Keyboard, type View } from 'react-native';
import { reportBackgroundFailure } from '../services/backgroundOperations';

interface KeyboardInsetOptions {
  // Platform opt-out; terminal input preferences must not gate IME geometry.
  enabled?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
  getKeyboardTop?: () => Promise<number | null>;
}

export function useKeyboardInset(
  measuredViewRef: RefObject<View | null>,
  { enabled = true, onVisibilityChange, getKeyboardTop }: KeyboardInsetOptions = {},
) {
  const [inset, setInset] = useState(0);
  const measurementRevision = useRef(0);
  const keyboardTopRef = useRef<number | null>(null);
  const keyboardVisibleRef = useRef(false);
  const remeasure = useCallback(() => {
    if (!enabled || !keyboardVisibleRef.current) return;
    const revision = ++measurementRevision.current;
    const measure = (keyboardTop: number) => {
      measuredViewRef.current?.measureInWindow((_x, y, _width, height) => {
        if (revision !== measurementRevision.current) return;
        setInset(Math.max(0, Math.ceil(y + height - keyboardTop)));
      });
    };
    // Keep the existing frame event responsive; WindowInsets corrects it once
    // the native window has finished changing its soft-input adjustment mode.
    if (keyboardTopRef.current !== null) measure(keyboardTopRef.current);
    if (getKeyboardTop) {
      reportBackgroundFailure(getKeyboardTop().then(nativeTop => {
        if (revision !== measurementRevision.current || nativeTop === null) return;
        keyboardTopRef.current = nativeTop;
        measure(nativeTop);
      }), 'keyboard-inset-native-ime-top');
    }
  }, [enabled, getKeyboardTop, measuredViewRef]);
  const resetInset = useCallback(() => {
    keyboardTopRef.current = null;
    keyboardVisibleRef.current = false;
    measurementRevision.current += 1;
    setInset(0);
  }, []);
  const reportVisibility = useEffectEvent((visible: boolean) => {
    onVisibilityChange?.(visible);
  });

  useEffect(() => {
    if (!enabled) {
      resetInset();
      reportVisibility(false);
      return;
    }

    const measure = (keyboardTop: number) => {
      keyboardTopRef.current = keyboardTop;
      keyboardVisibleRef.current = true;
      reportVisibility(true);
      remeasure();
    };
    const show = Keyboard.addListener('keyboardDidShow', event => {
      measure(event.endCoordinates.screenY);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      resetInset();
      reportVisibility(false);
    });
    const frame = Keyboard.addListener('keyboardDidChangeFrame', event => {
      if (keyboardTopRef.current !== null) measure(event.endCoordinates.screenY);
    });

    // The IME may have opened before subscription, with no further show event.
    const metrics = Keyboard.metrics?.();
    if (metrics) measure(metrics.screenY);
    else {
      const visible = Keyboard.isVisible?.() ?? false;
      keyboardVisibleRef.current = visible;
      reportVisibility(visible);
      if (visible && getKeyboardTop) remeasure();
    }

    return () => {
      measurementRevision.current += 1;
      show.remove();
      hide.remove();
      frame.remove();
    };
  }, [enabled, getKeyboardTop, measuredViewRef, resetInset, remeasure]);

  return { inset, resetInset, remeasure };
}
