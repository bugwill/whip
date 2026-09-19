import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { TerminalDirectionPad } from '../src/components/TerminalDirectionPad';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({ View: 'View', PanResponder: { create: (panHandlers: unknown) => ({ panHandlers }) } }));
jest.mock('lucide-react-native', () => ({ Move: 'Move' }));
jest.mock('../src/theme', () => ({ useTheme: () => ({ colors: { controlSurface: '#CECECE', text: '#000000' } }) }));

afterEach(() => {
  jest.useRealTimers();
});

test('tap selects a cardinal direction and a drag follows the dominant axis', () => {
  const onDirection = jest.fn();
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<TerminalDirectionPad onDirection={onDirection} />); });
  const handlers = renderer.root.findByProps({ accessible: true }).props;

  handlers.onPanResponderGrant();
  handlers.onPanResponderRelease({ nativeEvent: { locationX: 0, locationY: 18 } });
  expect(onDirection).toHaveBeenCalledWith('left');

  handlers.onPanResponderGrant();
  handlers.onPanResponderMove({}, { dx: 10, dy: 3 });
  expect(onDirection).toHaveBeenCalledTimes(1);
  handlers.onPanResponderMove({}, { dx: 20, dy: 3 });
  expect(onDirection).toHaveBeenLastCalledWith('right');
  handlers.onPanResponderMove({}, { dx: 0, dy: -20 });
  expect(onDirection).toHaveBeenLastCalledWith('up');
  handlers.onPanResponderRelease({ nativeEvent: { locationX: 22, locationY: 18 } });
  expect(onDirection).toHaveBeenCalledTimes(3);

  handlers.onPanResponderGrant();
  handlers.onPanResponderMove({}, { dx: -20, dy: 0 });
  expect(onDirection).toHaveBeenLastCalledWith('left');
  handlers.onPanResponderTerminate();
  expect(handlers.onPanResponderTerminationRequest()).toBe(false);
  act(() => renderer.unmount());
});

test('drag repeats after a delay and stops on release or cancellation', () => {
  jest.useFakeTimers();
  const onDirection = jest.fn();
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<TerminalDirectionPad onDirection={onDirection} />); });
  const handlers = renderer.root.findByProps({ accessible: true }).props;

  handlers.onPanResponderGrant();
  handlers.onPanResponderMove({}, { dx: 20, dy: 0 });
  expect(onDirection).toHaveBeenCalledTimes(1);
  act(() => { jest.advanceTimersByTime(449); });
  expect(onDirection).toHaveBeenCalledTimes(1);
  act(() => { jest.advanceTimersByTime(1); });
  expect(onDirection).toHaveBeenCalledTimes(2);
  act(() => { jest.advanceTimersByTime(100); });
  expect(onDirection).toHaveBeenCalledTimes(3);

  handlers.onPanResponderRelease({ nativeEvent: { locationX: 22, locationY: 18 } });
  act(() => { jest.advanceTimersByTime(500); });
  expect(onDirection).toHaveBeenCalledTimes(3);

  handlers.onPanResponderGrant();
  handlers.onPanResponderMove({}, { dx: 0, dy: 20 });
  expect(onDirection).toHaveBeenCalledTimes(4);
  handlers.onPanResponderTerminate();
  act(() => { jest.advanceTimersByTime(1000); });
  expect(onDirection).toHaveBeenCalledTimes(4);
  act(() => renderer.unmount());
});
