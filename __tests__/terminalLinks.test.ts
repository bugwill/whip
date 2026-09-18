import {
  isSshTunnelHost,
  localTunnelUrl,
  terminalWebLinkTarget,
} from '../src/lib/terminalLinks';
const { Terminal } = require('@xterm/xterm') as {
  Terminal: new (options: { cols: number; rows: number }) => {
    cols: number;
    buffer: {
      active: {
        getLine: (row: number) => {
          translateToString: (trimRight?: boolean) => string;
          getCell: (column: number) => {
            extended?: { urlId?: number };
            getChars: () => string;
            getWidth: () => number;
          } | undefined;
        } | undefined;
      };
    };
    write: (data: string, callback: () => void) => void;
    dispose: () => void;
  };
};
const {
  extractTerminalLinks,
  mergeTerminalLinks,
  osc8LinkAt,
  osc8LinkFromData,
  terminalLinkAt,
}: {
  extractTerminalLinks: (
    rows: Array<{ text: string; isWrapped: boolean }>,
    columns: number,
  ) => string[];
  mergeTerminalLinks: (
    rows: Array<{ text: string; isWrapped: boolean }>,
    columns: number,
    osc8Links: Array<{
      href: string;
      marker: { line: number };
      endMarker?: { line: number } | null;
      sequence: number;
    }>,
  ) => string[];
  osc8LinkAt: (
    osc8Links: Array<{
      href: string;
      marker: { line: number };
      endMarker: { line: number } | null;
      startColumn: number;
      endColumn: number | null;
      sequence: number;
    }>,
    row: number,
    column: number,
    cellMatchesLink?: (link: unknown, row: number, column: number) => boolean,
  ) => string | null;
  osc8LinkFromData: (data: string) => string | null;
  terminalLinkAt: (
    rows: Array<{ text: string; isWrapped: boolean; cellColumns?: number[] }>,
    columns: number,
    row: number,
    column: number,
    rowBase?: number,
  ) => string | null;
} = require('../scripts/terminal-link-extraction.cjs');

describe('terminal web links', () => {
  it('exposes live OSC-8 cell metadata and clears it when xterm erases the cell', async () => {
    const terminal = new Terminal({ cols: 20, rows: 2 });
    const write = (data: string) => new Promise<void>(resolve => terminal.write(data, resolve));

    await write('\u001b]8;;https://example.com\u0007linked\u001b]8;;\u0007');
    expect(terminal.buffer.active.getLine(0)?.getCell(0)?.extended?.urlId).toBeGreaterThan(0);

    await write('\r\u001b[2Kprompt');
    expect(terminal.buffer.active.getLine(0)?.getCell(0)?.extended?.urlId || 0).toBe(0);
    terminal.dispose();
  });

  it('maps plaintext links after wide, surrogate, and combining cells to real xterm columns', async () => {
    const terminal = new Terminal({ cols: 80, rows: 2 });
    const write = (data: string) => new Promise<void>(resolve => terminal.write(data, resolve));
    for (const prefix of ['中文 ', 'e\u0301 😀 ']) {
      await write('\u001bc');
      await write(`${prefix}https://example.com`);

      const line = terminal.buffer.active.getLine(0)!;
      const text = line.translateToString(false);
      const cellColumns = [0];
      let urlColumn = -1;
      for (let column = 0; column < terminal.cols; column += 1) {
        const cell = line.getCell(column)!;
        if (cell.getChars().startsWith('h')) urlColumn = column;
        if (cell.getWidth() === 0) continue;
        const chars = cell.getChars() || ' ';
        chars.split('').forEach(() => cellColumns.push(column + cell.getWidth()));
      }

      expect(urlColumn).toBeGreaterThan(0);
      const mappedRows = [{ text, isWrapped: false, cellColumns }];
      const unmappedRows = [{ text, isWrapped: false }];
      const urlLength = 'https://example.com'.length;
      expect(terminalLinkAt(mappedRows, terminal.cols, 0, urlColumn - 1)).toBeNull();
      expect(terminalLinkAt(mappedRows, terminal.cols, 0, urlColumn)).toBe('https://example.com/');
      expect(terminalLinkAt(mappedRows, terminal.cols, 0, urlColumn + urlLength - 1)).toBe(
        'https://example.com/',
      );
      expect(terminalLinkAt(mappedRows, terminal.cols, 0, urlColumn + urlLength)).toBeNull();
      const stringStart = text.indexOf('https');
      expect(stringStart).not.toBe(urlColumn);
      expect(terminalLinkAt(
        unmappedRows,
        terminal.cols,
        0,
        stringStart,
      )).toBe('https://example.com/');
      expect(terminalLinkAt(
        unmappedRows,
        terminal.cols,
        0,
        urlColumn,
      )).toBe(stringStart < urlColumn ? 'https://example.com/' : null);
      expect(terminalLinkAt(
        [{ text, isWrapped: false }],
        terminal.cols,
        0,
        stringStart - 1,
      )).toBeNull();
    }
    terminal.dispose();
  });

  it('accepts HTTP(S) OSC-8 targets and ignores close or unsafe sequences', () => {
    expect(osc8LinkFromData(';https://example.com/issues/1?tab=one')).toBe(
      'https://example.com/issues/1?tab=one',
    );
    expect(osc8LinkFromData('id=issue;http://example.com/1')).toBe(
      'http://example.com/1',
    );
    expect(osc8LinkFromData(';')).toBeNull();
    expect(osc8LinkFromData(';javascript:alert(1)')).toBeNull();
    expect(osc8LinkFromData('missing-separator')).toBeNull();
  });

  it('merges semantic OSC-8 targets with extracted links in buffer order', () => {
    const rows = [
      { text: 'Old https://example.com/old', isWrapped: false },
      { text: 'Issue 42', isWrapped: false },
      { text: 'New https://example.com/new', isWrapped: false },
    ];

    expect(
      mergeTerminalLinks(rows, 80, [
        {
          href: 'https://example.com/issues/42',
          marker: { line: 1 },
          sequence: 1,
        },
        { href: 'https://example.com/new', marker: { line: 2 }, sequence: 2 },
        {
          href: 'https://example.com/expired',
          marker: { line: -1 },
          sequence: 3,
        },
      ]),
    ).toEqual([
      'https://example.com/new',
      'https://example.com/issues/42',
      'https://example.com/old',
    ]);
  });

  it('resolves an OSC-8 target across its exact wrapped cell range', () => {
    const links = [
      {
        href: 'https://example.com/semantic-target',
        marker: { line: 4 },
        endMarker: { line: 6 },
        startColumn: 20,
        endColumn: 8,
        sequence: 1,
      },
    ];

    expect(osc8LinkAt(links, 4, 19)).toBeNull();
    expect(osc8LinkAt(links, 4, 20)).toBe(
      'https://example.com/semantic-target',
    );
    expect(osc8LinkAt(links, 5, 0)).toBe('https://example.com/semantic-target');
    expect(osc8LinkAt(links, 6, 7)).toBe('https://example.com/semantic-target');
    expect(osc8LinkAt(links, 6, 8)).toBeNull();
  });

  it('rejects an OSC-8 marker range when the current cell no longer carries its link', () => {
    const links = [{
      href: 'https://example.com/rewritten',
      marker: { line: 12 },
      endMarker: { line: 13 },
      startColumn: 4,
      endColumn: 9,
      sequence: 1,
    }];

    expect(osc8LinkAt(links, 12, 5, () => false)).toBeNull();
    expect(osc8LinkAt(links, 12, 5, (_link, row, column) => row === 12 && column === 5)).toBe(
      'https://example.com/rewritten',
    );
  });

  it.each([
    'localhost',
    'api.localhost',
    '0.0.0.0',
    '127.0.0.1',
    '127.12.4.8',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.50.2',
    '169.254.10.2',
    '::1',
    'fd12:3456::1',
    'fe80::10',
  ])('routes %s through SSH', hostname => {
    expect(isSshTunnelHost(hostname)).toBe(true);
  });

  it.each(['example.com', '8.8.8.8', '172.32.0.1', '192.169.0.1'])(
    'opens %s directly',
    hostname => {
      expect(isSshTunnelHost(hostname)).toBe(false);
    },
  );

  it('derives the remote endpoint and preserves the path when tunneling', () => {
    expect(
      terminalWebLinkTarget('http://localhost:5173/docs?q=one#intro'),
    ).toEqual({
      url: 'http://localhost:5173/docs?q=one#intro',
      hostname: 'localhost',
      port: 5173,
      requiresSshTunnel: true,
    });
    expect(
      localTunnelUrl('http://localhost:5173/docs?q=one#intro', 43127),
    ).toBe('http://localhost:43127/docs?q=one#intro');
    expect(localTunnelUrl('http://192.168.1.4:8080/', 43128)).toBe(
      'http://127.0.0.1:43128/',
    );
  });

  it('uses the protocol default port', () => {
    expect(terminalWebLinkTarget('https://example.com/path').port).toBe(443);
    expect(terminalWebLinkTarget('http://example.com/path').port).toBe(80);
  });

  it('extracts a link that xterm soft-wraps onto the next row', () => {
    const rows = [
      { text: 'Open https://example.com/a/very/long/', isWrapped: false },
      { text: 'path?with=query', isWrapped: true },
    ];

    expect(extractTerminalLinks(rows, 40)).toEqual([
      'https://example.com/a/very/long/path?with=query',
    ]);
    expect(terminalLinkAt(rows, 40, 0, 10)).toBe(
      'https://example.com/a/very/long/path?with=query',
    );
    expect(terminalLinkAt(rows, 40, 1, 4)).toBe(
      'https://example.com/a/very/long/path?with=query',
    );
    expect(terminalLinkAt(rows, 40, 2, 4)).toBeNull();
  });

  it('extracts a link hard-wrapped at the terminal edge', () => {
    const firstRow = 'Open https://example.com/a/very/long/';
    const rows = [
      { text: firstRow, isWrapped: false },
      { text: 'path?with=query', isWrapped: false },
    ];

    expect(extractTerminalLinks(rows, firstRow.length)).toEqual([
      'https://example.com/a/very/long/path?with=query',
    ]);
    expect(terminalLinkAt(rows, firstRow.length, 1, 4)).toBe(
      'https://example.com/a/very/long/path?with=query',
    );
  });

  it('extracts a hard-wrapped link when prose follows its continuation', () => {
    const firstRow = 'The draft is at https://github.com/windsornguyen/carg';
    const rows = [
      { text: firstRow, isWrapped: false },
      { text: 'o/pull/1) and implementation has started', isWrapped: false },
    ];

    expect(extractTerminalLinks(rows, firstRow.length)).toEqual([
      'https://github.com/windsornguyen/cargo/pull/1',
    ]);
    expect(terminalLinkAt(rows, firstRow.length, 1, 3)).toBe(
      'https://github.com/windsornguyen/cargo/pull/1',
    );
  });

  it('extracts a link wrapped inside a terminal UI block', () => {
    const rows = [
      {
        text: '  ┃  https://www.reddit.com/r/herdr/comments/         ',
        isWrapped: false,
      },
      {
        text: '  ┃  1v28abf/                                         ',
        isWrapped: false,
      },
      {
        text: '  ┃  got_tired_of_installing_herdr_plugins_one_by_    ',
        isWrapped: false,
      },
      {
        text: '  ┃  one/                                             ',
        isWrapped: false,
      },
      {
        text: '  ┃                                                   ',
        isWrapped: false,
      },
      {
        text: '  ┃  Build·DeepSeek V4 Flash Free OpenCode  · max     ',
        isWrapped: false,
      },
    ];

    expect(extractTerminalLinks(rows, 54)).toContain(
      'https://www.reddit.com/r/herdr/comments/1v28abf/got_tired_of_installing_herdr_plugins_one_by_one/',
    );
    expect(terminalLinkAt(rows, 54, 2, 12)).toBe(
      'https://www.reddit.com/r/herdr/comments/1v28abf/got_tired_of_installing_herdr_plugins_one_by_one/',
    );
  });

  it('extracts a link when a terminal UI replaces its prompt marker with indentation', () => {
    expect(
      extractTerminalLinks(
        [
          {
            text: '› https://www.reddit.com/r/theprimeagen/              ',
            isWrapped: false,
          },
          {
            text: '  comments/1v1t6pc/                                   ',
            isWrapped: false,
          },
          {
            text: '  i_built_a_react_native_terminus_replacement_whip/   ',
            isWrapped: false,
          },
          {
            text: '  #lightbox                                           ',
            isWrapped: false,
          },
          {
            text: '                                                      ',
            isWrapped: false,
          },
          {
            text: '  gpt-5.6-sol high fast · ~/repos/yuanwuzhi/sciflow   ',
            isWrapped: false,
          },
        ],
        54,
      ),
    ).toContain(
      'https://www.reddit.com/r/theprimeagen/comments/1v1t6pc/i_built_a_react_native_terminus_replacement_whip/#lightbox',
    );
  });

  it('does not merge ordinary adjacent terminal lines into a link', () => {
    expect(
      extractTerminalLinks(
        [
          { text: 'Open https://example.com/docs', isWrapped: false },
          { text: 'next-command-output', isWrapped: false },
        ],
        80,
      ),
    ).toEqual(['https://example.com/docs']);
  });
});
