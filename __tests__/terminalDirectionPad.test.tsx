import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { TerminalDirectionPad } from '../src/components/TerminalDirectionPad';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({ View: 'View', PanResponder: { create: (panHandlers: unknown) => ({ panHandlers }) } }));
jest.mock('lucide-react-native', () => ({ Move: 'Move' }));
jest.mock('../src/theme', () => ({ useTheme: () => ({ colors: { controlSurface: '#CECECE', text: '#000000' } }) }));

test('drag sends arrow steps on the dominant axis; release and cancel reset distance', () => {
  const onDirection = jest.fn();
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<TerminalDirectionPad onDirection={onDirection} />); });
  const handlers = renderer.root.findByProps({ accessible: true }).props;
  handlers.onPanResponderGrant();
  handlers.onPanResponderMove({}, { dx: 10, dy: 3 });
  expect(onDirection).not.toHaveBeenCalled();
  handlers.onPanResponderMove({}, { dx: 36, dy: 3 });
  expect(onDirection.mock.calls).toEqual([['right'], ['right']]);
  handlers.onPanResponderMove({}, { dx: 36, dy: -33 });
  expect(onDirection.mock.calls.slice(2)).toEqual([['up'], ['up']]);
  handlers.onPanResponderRelease();
  handlers.onPanResponderGrant();
  handlers.onPanResponderMove({}, { dx: -18, dy: 0 });
  expect(onDirection).toHaveBeenLastCalledWith('left');
  handlers.onPanResponderTerminate();
  handlers.onPanResponderGrant();
  handlers.onPanResponderMove({}, { dx: 0, dy: 18 });
  expect(onDirection).toHaveBeenLastCalledWith('down');
  expect(handlers.onPanResponderTerminationRequest()).toBe(false);
  act(() => renderer.unmount());
});
