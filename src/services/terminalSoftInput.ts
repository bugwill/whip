import { NativeModules, Platform } from 'react-native';

import {
  operationalErrorDetails,
  recordOperationalDiagnostic,
} from './operationalDiagnostics';

interface HerdrSoftInputNativeModule {
  setComposerOverlayEnabled(owner: string, enabled: boolean): Promise<void>;
  getImeTopInWindow?(): Promise<number | null>;
  getDefaultInputMethod?(): Promise<string>;
}

export function supportsTerminalImeTopInWindow(): boolean {
  return Platform.OS === 'android' && Platform.Version >= 30;
}

/** Uses Android WindowInsets as the composer geometry source when available. */
export async function getTerminalImeTopInWindow(): Promise<number | null> {
  if (Platform.OS !== 'android') return null;
  const module = NativeModules.HerdrSoftInput as HerdrSoftInputNativeModule | undefined;
  if (!module?.getImeTopInWindow) return null;
  try {
    const top = await module.getImeTopInWindow();
    return typeof top === 'number' && Number.isFinite(top) && top >= 0 ? top : null;
  } catch {
    return null;
  }
}

export async function getDefaultInputMethod(): Promise<string> {
  if (Platform.OS !== 'android') return '';
  const module = NativeModules.HerdrSoftInput as HerdrSoftInputNativeModule | undefined;
  if (!module?.getDefaultInputMethod) return '';
  try {
    return (await module.getDefaultInputMethod()) || '';
  } catch {
    return '';
  }
}

export async function setTerminalComposerOverlay(
  owner: string,
  enabled: boolean,
): Promise<void> {
  if (Platform.OS !== 'android') return;

  const module = NativeModules.HerdrSoftInput as HerdrSoftInputNativeModule | undefined;
  if (!module) {
    const error = new Error('HerdrSoftInput native module is not installed in this build');
    recordTerminalSoftInputFailure(enabled, error);
    throw error;
  }

  try {
    await module.setComposerOverlayEnabled(owner, enabled);
  } catch (error) {
    recordTerminalSoftInputFailure(enabled, error);
    throw error;
  }
}

function recordTerminalSoftInputFailure(enabled: boolean, error: unknown): void {
  recordOperationalDiagnostic('warn', 'Application', 'terminal-composer-overlay-update-failed', {
    enabled,
    ...operationalErrorDetails(error),
  });
}
