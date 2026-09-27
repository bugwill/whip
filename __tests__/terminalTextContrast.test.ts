const { terminalTextContrastTable } = require('../scripts/terminal-text-contrast.cjs');

test('gamma preserves black/white endpoints and strengthens partial glyph coverage', () => {
  const original = terminalTextContrastTable(1);
  const enhanced = terminalTextContrastTable(2);
  expect(original).toHaveLength(256);
  expect(original[128]).toBeCloseTo(128 / 255);
  expect(enhanced[128]).toBeCloseTo(1 - (127 / 255) ** 2);
  expect(enhanced[128]).toBeGreaterThan(original[128]);
  expect(enhanced[0]).toBe(0);
  expect(enhanced[255]).toBe(1);
  expect(enhanced.every((value: number, index: number) =>
    index === 0 || value >= enhanced[index - 1])).toBe(true);
});

test('invalid gamma restores normal coverage and values are bounded', () => {
  for (const value of [undefined, null, '2', NaN, Infinity, -1]) {
    expect(terminalTextContrastTable(value)).toEqual(terminalTextContrastTable(1));
  }
  expect(terminalTextContrastTable(9)).toEqual(terminalTextContrastTable(4));
});
