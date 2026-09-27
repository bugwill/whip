import {
  automaticTuiProgramMatches, monitorAutomaticTuiPrograms, parseAutomaticTuiPrograms,
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

test('detects program start/exit while preserving manual overrides for unchanged processes', async () => {
  const readNames = jest.fn().mockResolvedValue(['zsh']);
  const onChange = jest.fn();
  const stop = monitorAutomaticTuiPrograms({ programs: ['lazynotion'], readNames, onChange });
  await jest.advanceTimersByTimeAsync(0);
  expect(onChange).toHaveBeenLastCalledWith(false);
  readNames.mockResolvedValue(['lazynotion']);
  await jest.advanceTimersByTimeAsync(2000);
  expect(onChange).toHaveBeenLastCalledWith(true);
  onChange.mockClear();
  await jest.advanceTimersByTimeAsync(4000);
  expect(onChange).not.toHaveBeenCalled();
  readNames.mockResolvedValue(['zsh']);
  await jest.advanceTimersByTimeAsync(2000);
  expect(onChange).toHaveBeenLastCalledWith(false);
  stop();
});

test('switching panes cancels late results and prevents overlapping requests', async () => {
  let finish!: (value: string[]) => void;
  const readNames = jest.fn(() => new Promise<string[]>(resolve => { finish = resolve; }));
  const onChange = jest.fn();
  const stop = monitorAutomaticTuiPrograms({ programs: ['lazynotion'], readNames, onChange });
  await jest.advanceTimersByTimeAsync(10000);
  expect(readNames).toHaveBeenCalledTimes(1);
  stop();
  finish(['lazynotion']);
  await jest.advanceTimersByTimeAsync(10000);
  expect(onChange).not.toHaveBeenCalled();
  expect(readNames).toHaveBeenCalledTimes(1);
});

test('background checks pause and failed queries disable forced input', async () => {
  const readNames = jest.fn().mockRejectedValue(new Error('unavailable'));
  const onChange = jest.fn();
  let active = false;
  const stop = monitorAutomaticTuiPrograms({ programs: ['vim'], readNames, onChange, isActive: () => active });
  await jest.advanceTimersByTimeAsync(4000);
  expect(readNames).not.toHaveBeenCalled();
  active = true;
  await jest.advanceTimersByTimeAsync(2000);
  expect(onChange).toHaveBeenCalledWith(false);
  onChange.mockClear();
  await jest.advanceTimersByTimeAsync(4000);
  expect(onChange).not.toHaveBeenCalled();
  stop();
});
