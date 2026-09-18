import * as React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Exercise the real boot component without initializing native services.
test('storage hydration starts before fonts finish and survives the font gate', () => {
  const source = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
  const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const boot = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'App')!;
  const js = ts.transpileModule(boot.getText(ast), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  let fontsLoaded = false;
  const hydrate = jest.fn();
  const snapshot = { status: 'loading' };
  const useStorage = () => {
    React.useEffect(hydrate, []);
    return snapshot;
  };
  const Content = jest.fn(() => null);
  const App = runInNewContext(`${js}; App;`, {
    React, useFonts: () => [fontsLoaded, null], guiFontAssets: {},
    useStartupStorage: useStorage, SafeAreaProvider: React.Fragment,
    ReducedMotionProvider: React.Fragment, AppContent: Content,
  }) as React.ComponentType;
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<App />); });
  expect(hydrate).toHaveBeenCalledTimes(1);
  expect(Content).not.toHaveBeenCalled();
  fontsLoaded = true;
  act(() => { renderer.update(<App />); });
  expect(hydrate).toHaveBeenCalledTimes(1);
  expect(Content.mock.calls[0]).toEqual([expect.objectContaining({ startupStorage: snapshot }), undefined]);
  act(() => renderer.unmount());
});
