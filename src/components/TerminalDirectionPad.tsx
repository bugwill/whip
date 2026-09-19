import { useEffect, useMemo, useRef } from 'react';
import { PanResponder, View } from 'react-native';
import { Move } from 'lucide-react-native';
import { useTheme } from '../theme';

type Direction = 'up' | 'down' | 'left' | 'right';

const PAD_WIDTH = 44;
const PAD_HEIGHT = 36;
const DEAD_ZONE = 18;
const MOVE_SLOP = 5;
const AUTO_REPEAT_DELAY_MS = 450;
const AUTO_REPEAT_INTERVAL_MS = 100;

function directionFromDisplacement(dx: number, dy: number): Direction | null {
  if (Math.hypot(dx, dy) < DEAD_ZONE) return null;
  return Math.abs(dx) > Math.abs(dy)
    ? (dx > 0 ? 'right' : 'left')
    : (dy > 0 ? 'down' : 'up');
}

/** A compact tap-and-joystick surface for terminal cursor movement. */
export function TerminalDirectionPad({ onDirection }: { onDirection: (direction: Direction) => void }) {
  const { colors } = useTheme();
  const callback = useRef(onDirection);
  callback.current = onDirection;
  const activeDirection = useRef<Direction | null>(null);
  const moved = useRef(false);
  const repeatTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (repeatTimeout.current !== null) clearTimeout(repeatTimeout.current);
    if (repeatInterval.current !== null) clearInterval(repeatInterval.current);
  }, []);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onShouldBlockNativeResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      moved.current = false;
      activeDirection.current = null;
      if (repeatTimeout.current !== null) clearTimeout(repeatTimeout.current);
      if (repeatInterval.current !== null) clearInterval(repeatInterval.current);
      repeatTimeout.current = null;
      repeatInterval.current = null;
    },
    onPanResponderMove: (_event, gesture) => {
      if (Math.max(Math.abs(gesture.dx), Math.abs(gesture.dy)) >= MOVE_SLOP) {
        moved.current = true;
      }
      const direction = directionFromDisplacement(gesture.dx, gesture.dy);
      if (direction === activeDirection.current) return;

      if (repeatTimeout.current !== null) clearTimeout(repeatTimeout.current);
      if (repeatInterval.current !== null) clearInterval(repeatInterval.current);
      repeatTimeout.current = null;
      repeatInterval.current = null;
      activeDirection.current = direction;
      if (!direction) return;

      callback.current(direction);
      repeatTimeout.current = setTimeout(() => {
        repeatTimeout.current = null;
        callback.current(direction);
        repeatInterval.current = setInterval(() => {
          if (activeDirection.current === direction) callback.current(direction);
        }, AUTO_REPEAT_INTERVAL_MS);
      }, AUTO_REPEAT_DELAY_MS);
    },
    onPanResponderRelease: event => {
      if (!moved.current) {
        const x = event.nativeEvent.locationX;
        const y = event.nativeEvent.locationY;
        const direction = directionFromDisplacement(
          x - PAD_WIDTH / 2,
          y - PAD_HEIGHT / 2,
        );
        if (direction) callback.current(direction);
      }
      activeDirection.current = null;
      if (repeatTimeout.current !== null) clearTimeout(repeatTimeout.current);
      if (repeatInterval.current !== null) clearInterval(repeatInterval.current);
      repeatTimeout.current = null;
      repeatInterval.current = null;
    },
    onPanResponderTerminate: () => {
      activeDirection.current = null;
      if (repeatTimeout.current !== null) clearTimeout(repeatTimeout.current);
      if (repeatInterval.current !== null) clearInterval(repeatInterval.current);
      repeatTimeout.current = null;
      repeatInterval.current = null;
    },
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
      style={{ backgroundColor: 'transparent', height: 36, width: 44, flexShrink: 0,
        alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: colors.divider }}>
      <View pointerEvents="none"><Move size={22} color={colors.text} /></View>
    </View>
  );
}
