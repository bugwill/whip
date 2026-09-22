import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ComposerCharacterCount, createComposerDraftStore } from '../src/components/ComposerCharacterCount';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('../src/components/ui/text', () => ({ Text: 'Text' }));

test('draft edits update the counter without rerendering its parent', () => {
  const store = createComposerDraftStore();
  let parentRenders = 0;
  function Parent() {
    parentRenders++;
    return <ComposerCharacterCount store={store} format={count => `${count} chars`} />;
  }
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<Parent />); });
  act(() => store.setText('你好'));
  expect(renderer.toJSON()).toMatchObject({ children: ['2 chars'] });
  expect(parentRenders).toBe(1);
  act(() => store.setText('世界'));
  expect(store.getText()).toBe('世界');
  expect(parentRenders).toBe(1);
  act(() => store.setText(''));
  expect(renderer.toJSON()).toMatchObject({ children: ['0 chars'] });
  act(() => renderer.unmount());
});

test('same-length replacements retain text without notifying counter subscribers', () => {
  const store = createComposerDraftStore();
  const listener = jest.fn();
  const unsubscribe = store.subscribe(listener);
  store.setText('ab');
  store.setText('cd');
  store.setText('cd');
  expect(store.getText()).toBe('cd');
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
  store.setText('');
  expect(listener).toHaveBeenCalledTimes(1);
});
