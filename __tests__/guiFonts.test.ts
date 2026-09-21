import { guiFontFamilies, guiFontFamilyForClasses } from '../src/lib/guiFonts';

describe('GUI font family', () => {
  it.each([
    ['text-base', guiFontFamilies.regular],
    ['font-medium', guiFontFamilies.medium],
    ['font-semibold', guiFontFamilies.semiBold],
    ['font-bold', guiFontFamilies.bold],
    ['font-extrabold', guiFontFamilies.extraBold],
    ['font-black', guiFontFamilies.black],
  ])('maps %s to its Inter face', (className, expected) => {
    expect(guiFontFamilyForClasses(className)).toBe(expected);
  });

  it('maps deliberate monospace text to the bundled JetBrains Mono face', () => {
    expect(guiFontFamilyForClasses('font-mono font-black')).toBe(guiFontFamilies.mono);
    expect(guiFontFamilies.mono).toBe('HerdrTerminalMono');
  });

  it('uses a denser default face for E-Ink while preserving explicit weights', () => {
    expect(guiFontFamilyForClasses('text-base', true)).toBe(guiFontFamilies.medium);
    expect(guiFontFamilyForClasses('font-semibold', true)).toBe(guiFontFamilies.semiBold);
    expect(guiFontFamilyForClasses('font-mono', true)).toBe(guiFontFamilies.mono);
  });
});
