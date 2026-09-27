import {
  automaticTuiProgramMatches, checkAutomaticTuiPrograms, parseAutomaticTuiPrograms,
} from '../src/lib/automaticTuiPrograms';

test('splits whitespace, ignores duplicates, and matches executable names exactly', () => {
  const programs = parseAutomaticTuiPrograms(' lazynotion  vim\nvim\t nvim ');
  expect(programs).toEqual(['lazynotion', 'vim', 'nvim']);
  expect(parseAutomaticTuiPrograms('  ')).toEqual([]);
  expect(automaticTuiProgramMatches(programs, ['/usr/bin/vim'])).toBe(true);
  expect(automaticTuiProgramMatches(programs, ['lazynotion'])).toBe(true);
  expect(automaticTuiProgramMatches(programs, ['vimdiff', 'zsh'])).toBe(false);
  expect(automaticTuiProgramMatches([], ['lazynotion'])).toBe(false);
});

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('checks once without timers or repeated network requests', async () => {
  const readNames = jest.fn().mockResolvedValue(['lazynotion']);
  const onChange = jest.fn();
  const stop = checkAutomaticTuiPrograms({ programs: ['lazynotion'], readNames, onChange });
  await jest.advanceTimersByTimeAsync(60000);
  expect(readNames).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(true);
  expect(jest.getTimerCount()).toBe(0);
  stop();
});

test('leaving a pane ignores its late result', async () => {
  let finish!: (value: string[]) => void;
  const readNames = jest.fn(() => new Promise<string[]>(resolve => { finish = resolve; }));
  const onChange = jest.fn();
  const stop = checkAutomaticTuiPrograms({ programs: ['lazynotion'], readNames, onChange });
  stop();
  finish(['lazynotion']);
  await jest.advanceTimersByTimeAsync(10000);
  expect(onChange).not.toHaveBeenCalled();
  expect(readNames).toHaveBeenCalledTimes(1);
});

test('failed queries disable forced input without retrying', async () => {
  const readNames = jest.fn().mockRejectedValue(new Error('unavailable'));
  const onChange = jest.fn();
  checkAutomaticTuiPrograms({ programs: ['vim'], readNames, onChange });
  await jest.advanceTimersByTimeAsync(60000);
  expect(onChange).toHaveBeenCalledWith(false);
  expect(readNames).toHaveBeenCalledTimes(1);
});
