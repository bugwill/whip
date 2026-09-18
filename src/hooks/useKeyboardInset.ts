import { useCallback, useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';
import { Keyboard, type View } from 'react-native';

interface KeyboardInsetOptions {
  // Platform opt-out; terminal input preferences must not gate IME geometry.
  enabled?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
}

export function useKeyboardInset(
  measuredViewRef: RefObject<View | null>,
  { enabled = true, onVisibilityChange }: KeyboardInsetOptions = {},
) {
  const [inset, setInset] = useState(0);
  const measurementRevision = useRef(0);
  const keyboardTopRef = useRef<number | null>(null);
  const remeasure = useCallback(() => {
    const keyboardTop = keyboardTopRef.current;
    if (!enabled || keyboardTop === null) return;
    const revision = ++measurementRevision.current;
    measuredViewRef.current?.measureInWindow((_x, y, _width, height) => {
      if (revision !== measurementRevision.current) return;
      setInset(Math.max(0, Math.ceil(y + height - keyboardTop)));
    });
  }, [enabled, measuredViewRef]);
  const resetInset = useCallback(() => {
    keyboardTopRef.current = null;
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
    else reportVisibility(Keyboard.isVisible?.() ?? false);

    return () => {
      measurementRevision.current += 1;
      show.remove();
      hide.remove();
      frame.remove();
    };
  }, [enabled, measuredViewRef, resetInset, remeasure]);

  return { inset, resetInset, remeasure };
}
