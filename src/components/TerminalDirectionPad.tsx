import { useMemo, useRef } from 'react';
import { PanResponder, View } from 'react-native';
import { Move } from 'lucide-react-native';
import { useTheme } from '../theme';

type Direction = 'up' | 'down' | 'left' | 'right';

/** Drag distance produces arrow steps; lifting or cancelling ends the gesture. */
export function TerminalDirectionPad({ onDirection }: { onDirection: (direction: Direction) => void }) {
  const { colors } = useTheme();
  const callback = useRef(onDirection);
  callback.current = onDirection;
  const anchor = useRef({ x: 0, y: 0 });
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onShouldBlockNativeResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { anchor.current = { x: 0, y: 0 }; },
    onPanResponderMove: (_event, gesture) => {
      const dx = gesture.dx - anchor.current.x;
      const dy = gesture.dy - anchor.current.y;
      const horizontal = Math.abs(dx) > Math.abs(dy);
      const distance = horizontal ? dx : dy;
      const steps = Math.min(8, Math.floor(Math.abs(distance) / 18));
      if (!steps) return;
      const direction = horizontal ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      for (let i = 0; i < steps; i += 1) callback.current(direction);
      anchor.current = { x: gesture.dx, y: gesture.dy };
    },
    onPanResponderRelease: () => { anchor.current = { x: 0, y: 0 }; },
    onPanResponderTerminate: () => { anchor.current = { x: 0, y: 0 }; },
  }), []);
  return (
    // Do not use the shared active: control classes here. NativeWind upgrades
    // those Views to Pressable, whose handlers replace PanResponder handlers.
    <View {...pan.panHandlers}
      accessible accessibilityLabel="按住并向上下左右滑动以移动光标"
      accessibilityActions={[
        { name: 'up', label: '上' }, { name: 'down', label: '下' },
        { name: 'left', label: '左' }, { name: 'right', label: '右' },
      ]}
      onAccessibilityAction={event => {
        const direction = event.nativeEvent.actionName;
        if (direction === 'up' || direction === 'down' || direction === 'left' || direction === 'right') callback.current(direction);
      }}
      style={{ backgroundColor: colors.controlSurface, height: 36, width: 44, flexShrink: 0,
        alignItems: 'center', justifyContent: 'center', borderRadius: 2, borderWidth: 1, borderColor: colors.divider }}>
      <View pointerEvents="none"><Move size={22} color={colors.text} /></View>
    </View>
  );
}
