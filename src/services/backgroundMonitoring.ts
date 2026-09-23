import { NativeModules, Platform } from 'react-native';
import type { BackgroundPowerMode } from './devicePreferences';

interface HerdrBackgroundNativeModule {
  getDeviceLockState(): Promise<boolean>;
  resumeMonitoringAfterUnlock(): Promise<boolean>;
  start(hostCount: number, powerMode: BackgroundPowerMode): Promise<void>;
  stop(): Promise<void>;
  updateHostStatus(sessionId: string, state: string, signal: string): void;
  removeHostStatus(sessionId: string): void;
  postAgentNotification(
    notificationIdentifier: string,
    title: string,
    body: string,
    channelId: string,
    hostId: string,
    paneId: string,
    delivery: string,
  ): Promise<void>;
  dismissAgentNotification(notificationIdentifier: string): Promise<void>;
  getInitialAgentNotificationTarget(): Promise<NativeAgentNotificationTarget | null>;
  armPersistentAlert(
    notificationIdentifier: string,
    channelId: string,
    timeoutMs: number,
  ): Promise<void>;
  dismissPersistentAlert(): Promise<void>;
}

export const AGENT_NOTIFICATION_TAPPED_EVENT = 'WhipAgentNotificationTapped';
export const DEVICE_LOCK_STATE_CHANGED_EVENT = 'WhipDeviceLockStateChanged';

export interface NativeAgentNotificationTarget {
  notificationId: string;
  hostId: string;
  paneId: string;
}

function nativeModule(): HerdrBackgroundNativeModule | null {
  if (Platform.OS !== 'android') return null;
  const module = NativeModules.HerdrBackground as HerdrBackgroundNativeModule | undefined;
  if (!module) {
    throw new Error('HerdrBackground native module is not installed in this build');
  }
  return module;
}

export async function getDeviceLockState(): Promise<boolean | null> {
  const module = nativeModule();
  if (!module) return null;
  return module.getDeviceLockState();
}

export async function resumeMonitoringAfterUnlock(): Promise<boolean> {
  const module = nativeModule();
  if (!module) return true;
  return module.resumeMonitoringAfterUnlock();
}

export async function startBackgroundMonitoring(
  hostCount: number,
  powerMode: BackgroundPowerMode,
): Promise<void> {
  const module = nativeModule();
  if (!module) return;
  await module.start(Math.max(1, Math.trunc(hostCount)), powerMode);
}

export async function stopBackgroundMonitoring(): Promise<void> {
  const module = nativeModule();
  if (!module) return;
  await module.stop();
}

export function updateBackgroundHostStatus(_sessionId: string, _state: string, _signal = ''): void {
  // The persistent notification is static. Health is still tracked by the runtime.
}

export function removeBackgroundHostStatus(_sessionId: string): void {
  // No per-host notification state to remove.
}

export async function postBackgroundAgentNotification(
  notificationIdentifier: string,
  title: string,
  body: string,
  channelId: string,
  hostId: string,
  paneId: string,
  delivery: string,
): Promise<void> {
  const module = nativeModule();
  if (!module) return;
  await module.postAgentNotification(
    notificationIdentifier,
    title,
    body,
    channelId,
    hostId,
    paneId,
    delivery,
  );
}

export async function dismissBackgroundAgentNotification(
  notificationIdentifier: string,
): Promise<void> {
  const module = nativeModule();
  if (!module) return;
  await module.dismissAgentNotification(notificationIdentifier);
}

export async function getInitialAgentNotificationTarget(): Promise<NativeAgentNotificationTarget | null> {
  const module = nativeModule();
  if (!module) return null;
  return module.getInitialAgentNotificationTarget();
}

export async function armPersistentAgentAlert(
  notificationIdentifier: string,
  channelId: string,
  timeoutMs: number,
): Promise<void> {
  const module = nativeModule();
  if (!module) return;
  await module.armPersistentAlert(notificationIdentifier, channelId, timeoutMs);
}

export async function dismissPersistentAgentAlert(): Promise<void> {
  const module = nativeModule();
  if (!module) return;
  await module.dismissPersistentAlert();
}
