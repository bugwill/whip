import { Platform, useWindowDimensions } from 'react-native';
import { createContext, useContext, type ReactNode } from 'react';

export type DisplayProfilePreference = 'auto' | 'normal' | 'eink';
export type DisplayProfile = 'normal' | 'eink';

// Bigme exposes the model name through Android's Build constants. Keep this
// list deliberately small: a false positive is more disruptive than leaving
// E-Ink mode available to a manual setting.
const EINK_MODEL_TOKENS = [
  'b1051c',
  'b1051',
  'bigme',
  'b751',
  'b251',
  'ink',
  'eink',
  'boox',
  'onyx',
  'hisense',
];
const getWindowDimensions: () => { width: number; height: number } =
  typeof useWindowDimensions === 'function'
    ? useWindowDimensions
    : () => ({ width: 0, height: 0 });

interface DisplayProfileContextValue {
  profile: DisplayProfile;
  isEink: boolean;
  isTablet: boolean;
}

const DisplayProfileContext = createContext<DisplayProfileContextValue>({
  profile: resolveDisplayProfile('auto'),
  isEink: resolveDisplayProfile('auto') === 'eink',
  isTablet: false,
});

export function deviceIdentity(): string {
  const platform = Platform as unknown as {
    constants?: Record<string, unknown>;
    OS?: string;
  } | undefined;
  const constants = platform?.constants || {};
  return [
    constants.Model,
    constants.model,
    constants.Device,
    constants.device,
    constants.Product,
    constants.product,
    constants.Hardware,
    constants.hardware,
    constants.Fingerprint,
    constants.fingerprint,
    constants.Brand,
    constants.brand,
    constants.Manufacturer,
    constants.manufacturer,
  ]
    .filter(value => typeof value === 'string')
    .join(' ')
    .toLowerCase();
}

export function isLikelyEinkDevice(): boolean {
  const platform = Platform as unknown as { OS?: string } | undefined;
  if (platform?.OS !== 'android') return false;
  const identity = deviceIdentity();
  return EINK_MODEL_TOKENS.some(token => identity.includes(token));
}

export function resolveDisplayProfile(
  preference: DisplayProfilePreference,
): DisplayProfile {
  if (preference === 'eink') return 'eink';
  if (preference === 'auto' && isLikelyEinkDevice()) return 'eink';
  return 'normal';
}

export function DisplayProfileProvider({
  preference,
  children,
}: {
  preference: DisplayProfilePreference;
  children: ReactNode;
}) {
  const { width, height } = getWindowDimensions();
  const profile = resolveDisplayProfile(preference);
  const isTablet = Math.min(width, height) >= 600;

  return (
    <DisplayProfileContext.Provider
      value={{ profile, isEink: profile === 'eink', isTablet }}
    >
      {children}
    </DisplayProfileContext.Provider>
  );
}

export function useDisplayProfile(): DisplayProfileContextValue {
  const value = useContext(DisplayProfileContext);
  const { width, height } = getWindowDimensions();
  return {
    ...value,
    isTablet: value.isTablet || Math.min(width, height) >= 600,
  };
}

export function useDisplayAnimationType(
  animation: 'fade' | 'slide',
): 'none' | 'fade' | 'slide' {
  return useDisplayProfile().isEink ? 'none' : animation;
}
