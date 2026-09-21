import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';

import { prepareAlerts } from '../services/alerts';
import { reportBackgroundFailure } from '../services/backgroundOperations';
import {
  operationalErrorDetails,
  recordOperationalDiagnostic,
} from '../services/operationalDiagnostics';

/** Owns notification setup and response delivery. */
export function useAgentNotifications() {
  const [response, setResponse] =
    useState<Notifications.NotificationResponse | null>(null);
  const handledNotificationIdRef = useRef<string | null>(null);

  useEffect(() => {
    reportBackgroundFailure(prepareAlerts(), 'agent-alerts-prepare');
    let active = true;
    let receivedResponse = false;
    const subscription = Notifications.addNotificationResponseReceivedListener(
      value => {
        receivedResponse = true;
        setResponse(value);
      },
    );
    Notifications.getLastNotificationResponseAsync()
      .then(value => {
        if (active && !receivedResponse && value) setResponse(value);
      })
      .catch(error => {
        recordOperationalDiagnostic('warn', 'Notification', 'last-notification-response-read-failed', {
          operation: 'getLastNotificationResponseAsync',
          ...operationalErrorDetails(error),
        });
      });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const wasHandled = useCallback(
    (notificationId: string) =>
      handledNotificationIdRef.current === notificationId,
    [],
  );

  const consume = useCallback((notificationId: string) => {
    handledNotificationIdRef.current = notificationId;
    Notifications.clearLastNotificationResponse();
    setResponse(null);
  }, []);

  return useMemo(
    () => ({ response, wasHandled, consume }),
    [consume, response, wasHandled],
  );
}
