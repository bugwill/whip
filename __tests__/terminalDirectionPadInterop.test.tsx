import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { PanResponder, View } from 'react-native';
import { StyleSheet } from 'react-native-css-interop/dist/runtime/native/stylesheet';
import { cssInterop } from 'react-native-css-interop/dist/runtime/native/api';
import { cssToReactNativeRuntime } from 'react-native-css-interop/css-to-rn';
import { TerminalDirectionPad } from '../src/components/TerminalDirectionPad';

jest.mock('lucide-react-native', () => ({ Move: () => null }));
// A stable native host avoids the preset's lazy View mock loading interop
// recursively before the View export has finished initializing.
jest.mock('react-native/Libraries/Components/View/View', () => ({ __esModule: true, default: 'View' }));
// Only the JSX pragma diagnostic needs stubbing; keep CSS/responder interop real.
jest.mock('react-native-css-interop/dist/doctor.native', () => ({}));
jest.mock('../src/theme', () => ({ useTheme: () => ({ colors: { controlSurface: '#CECECE', text: '#000000', divider: '#777777' } }) }));

test('real CSS interop preserves drag handlers instead of upgrading the pad to Pressable', () => {
  // wrapJSX intentionally skips default component registration in NODE_ENV=test.
  const InteropView = cssInterop(View, { className: 'style' });
  StyleSheet.registerCompiled(cssToReactNativeRuntime('.active\\:bg-card\\/70:active { background-color: red; }'));
  expect(StyleSheet.getGlobalStyle('active:bg-card/70')).toEqual(expect.objectContaining({ active: true }));
  const move = jest.fn();
  const grant = jest.fn();
  const spy = jest.spyOn(PanResponder, 'create').mockReturnValue({
    panHandlers: { onResponderMove: move, onResponderGrant: grant },
    getInteractionHandle: () => null,
  } as unknown as ReturnType<typeof PanResponder.create>);
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<TerminalDirectionPad onDirection={jest.fn()} />); });
  const host = renderer.root.findAll(node => typeof node.type === 'string' && node.props.accessible === true)[0];
  expect(host.props.onResponderMove).toBe(move);
  expect(host.props.onResponderGrant).toBe(grant);
  // Positive control: the previous shared active: class really does upgrade.
  act(() => renderer.update(<InteropView accessible className="active:bg-card/70" onResponderMove={move} onResponderGrant={grant} />));
  const oldHost = renderer.root.findAll(node => typeof node.type === 'string' && node.props.accessible === true)[0];
  expect(oldHost.props.onResponderMove).not.toBe(move);
  expect(oldHost.props.onResponderGrant).not.toBe(grant);
  act(() => renderer.unmount());
  spy.mockRestore();
});
