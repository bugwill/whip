import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { TextDecoder, TextEncoder } from 'node:util';

test('E-Ink preserves Chinese characters split across SSH byte frames', () => {
  const generator = readFileSync(resolve(__dirname, '../scripts/sync-terminal-assets.mjs'), 'utf8');
  const start = generator.indexOf('    const einkDecoder = new TextDecoder();');
  const end = generator.indexOf('    const initializeTerminal =', start);
  const prepare = runInNewContext(`${generator.slice(start, end)}; prepareTerminalWrite`, {
    TextDecoder, einkMode: true, normalizeEinkSgr: (text: string) => text,
  }) as (value: Uint8Array | string) => string;
  const bytes = new TextEncoder().encode('中文🙂');
  let output = '';
  for (const byte of bytes) output += prepare(new Uint8Array([byte]));
  expect(output).toBe('中文🙂');
  expect(prepare('结束')).toBe('结束');
});
