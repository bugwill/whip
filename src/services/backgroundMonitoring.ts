import { NativeModules, Platform } from 'react-native';
import type { BackgroundPowerMode } from './devicePreferences';

interface HerdrBackgroundNativeModule {
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

export function updateBackgroundHostStatus(sessionId: string, state: string, signal = ''): void {
  nativeModule()?.updateHostStatus(sessionId, state, signal);
}

export function removeBackgroundHostStatus(sessionId: string): void {
  nativeModule()?.removeHostStatus(sessionId);
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
