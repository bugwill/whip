import {
  cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  symlinkSync, writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '..');
const outputDirectories = [
  'android/app/src/main/assets',
  'modules/whip-terminal-assets/ios/TerminalAssets',
];
let fixture: string;

function generate(...args: string[]) {
  return execFileSync(process.execPath, ['scripts/sync-terminal-assets.mjs', ...args], {
    cwd: fixture,
    stdio: 'pipe',
  });
}

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), 'whip-terminal-assets-'));
  for (const directory of ['scripts', 'src/lib', 'assets/terminal-fonts']) {
    cpSync(join(root, directory), join(fixture, directory), { recursive: true });
  }
  symlinkSync(join(root, 'node_modules'), join(fixture, 'node_modules'), 'dir');
});

afterEach(() => rmSync(fixture, { recursive: true, force: true }));

test('recreates both complete asset directories from source inputs alone', () => {
  for (const directory of outputDirectories) {
    expect(existsSync(join(fixture, directory))).toBe(false);
  }
  generate();

  const copies: Record<string, string> = {
    'xterm.js': 'node_modules/@xterm/xterm/lib/xterm.js',
    'xterm.css': 'node_modules/@xterm/xterm/css/xterm.css',
    'addon-fit.js': 'node_modules/@xterm/addon-fit/lib/addon-fit.js',
    'addon-image.js': 'node_modules/@xterm/addon-image/lib/addon-image.js',
    'addon-serialize.js': 'node_modules/@xterm/addon-serialize/lib/addon-serialize.js',
    'mermaid.min.js': 'node_modules/mermaid/dist/mermaid.min.js',
    'mermaid-LICENSE.txt': 'node_modules/mermaid/LICENSE',
    'mermaid-preview.js': 'scripts/mermaid-preview-runtime.js',
  };
  const fonts = JSON.parse(readFileSync(join(root, 'assets/terminal-fonts/manifest.json'), 'utf8')) as Record<
    'text' | 'cjk' | 'symbols',
    {
      regularFile: string;
      bundledRegularFile: string;
      licenseFile: string;
      bundledLicenseFile: string;
      boldFile?: string;
      bundledBoldFile?: string;
    }
  >;
  for (const font of [fonts.text, fonts.cjk, fonts.symbols]) {
    copies[font.bundledRegularFile] = `assets/terminal-fonts/${font.regularFile}`;
    copies[font.bundledLicenseFile] = `assets/terminal-fonts/${font.licenseFile}`;
    if (font.boldFile && font.bundledBoldFile) copies[font.bundledBoldFile] = `assets/terminal-fonts/${font.boldFile}`;
  }
  for (const [index, directory] of outputDirectories.entries()) {
    const html = index === 0 ? 'herdr-terminal.html' : 'index.html';
    expect(readdirSync(join(fixture, directory)).sort()).toEqual(
      [...Object.keys(copies), html, 'mermaid-preview.html'].sort(),
    );
    for (const [destination, source] of Object.entries(copies)) {
      expect(readFileSync(join(fixture, directory, destination)).equals(readFileSync(join(root, source)))).toBe(true);
    }
  }
  expect(() => generate('--check')).not.toThrow();
});

test.each([
  ['Android font', `${outputDirectories[0]}/jetbrains-mono-regular.woff2`],
  ['iOS license', `${outputDirectories[1]}/mermaid-LICENSE.txt`],
  ['iOS HTML', `${outputDirectories[1]}/index.html`],
])('--check rejects missing and stale %s, and generation repairs it', (_label, output) => {
  generate();
  const path = join(fixture, output);
  rmSync(path);
  expect(() => generate('--check')).toThrow();
  writeFileSync(path, 'stale asset');
  expect(() => generate('--check')).toThrow();
  generate();
  expect(() => generate('--check')).not.toThrow();
});
