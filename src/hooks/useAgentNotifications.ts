import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { DeviceEventEmitter } from 'react-native';

import {
  AGENT_NOTIFICATION_TAPPED_EVENT,
  getInitialAgentNotificationTarget,
  type NativeAgentNotificationTarget,
} from '../services/backgroundMonitoring';
import { prepareAlerts } from '../services/alerts';
import { reportBackgroundFailure } from '../services/backgroundOperations';
import {
  operationalErrorDetails,
  recordOperationalDiagnostic,
} from '../services/operationalDiagnostics';

/** Owns notification setup and response delivery. */
export function useAgentNotifications() {
  type AgentNotificationResponse = Notifications.NotificationResponse | {
    actionIdentifier: string;
    notification: {
      request: {
        identifier: string;
        content: { data?: Record<string, unknown> };
      };
    };
  };
  const [response, setResponse] =
    useState<AgentNotificationResponse | null>(null);
  const handledNotificationIdRef = useRef<string | null>(null);
  const pendingNotificationIdsRef = useRef(new Set<string>());

  useEffect(() => {
    reportBackgroundFailure(prepareAlerts(), 'agent-alerts-prepare');
    let active = true;
    let receivedResponse = false;
    const publish = (value: AgentNotificationResponse) => {
      const identifier = value.notification.request.identifier;
      if (
        !active
        || handledNotificationIdRef.current === identifier
        || pendingNotificationIdsRef.current.has(identifier)
      ) return;
      pendingNotificationIdsRef.current.add(identifier);
      setResponse(value);
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(
      value => {
        receivedResponse = true;
        publish(value);
      },
    );
    const nativeSubscription = DeviceEventEmitter.addListener(
      AGENT_NOTIFICATION_TAPPED_EVENT,
      (target: NativeAgentNotificationTarget) => {
        publish({
          actionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
          notification: {
            request: {
              identifier: target.notificationId,
              content: { data: { hostId: target.hostId, paneId: target.paneId } },
            },
          },
        });
      },
    );
    Notifications.getLastNotificationResponseAsync()
      .then(value => {
        if (!receivedResponse && value) publish(value);
      })
      .catch(error => {
        recordOperationalDiagnostic('warn', 'Notification', 'last-notification-response-read-failed', {
          operation: 'getLastNotificationResponseAsync',
          ...operationalErrorDetails(error),
        });
      });
    reportBackgroundFailure(
      getInitialAgentNotificationTarget().then(target => {
        if (!target) return;
        publish({
          actionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
          notification: {
            request: {
              identifier: target.notificationId,
              content: { data: { hostId: target.hostId, paneId: target.paneId } },
            },
          },
        });
      }),
      'agent-notification-initial-target',
    );
    return () => {
      active = false;
      subscription.remove();
      nativeSubscription.remove();
    };
  }, []);

  const wasHandled = useCallback(
    (notificationId: string) =>
      handledNotificationIdRef.current === notificationId,
    [],
  );

  const consume = useCallback((notificationId: string) => {
    handledNotificationIdRef.current = notificationId;
    pendingNotificationIdsRef.current.delete(notificationId);
    Notifications.clearLastNotificationResponse();
    setResponse(null);
  }, []);

  return useMemo(
    () => ({ response, wasHandled, consume }),
    [consume, response, wasHandled],
  );
}
