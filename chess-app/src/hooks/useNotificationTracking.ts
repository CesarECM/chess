import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { analytics } from '@/services/analytics';
import { STREAK_NOTIF_ID, SIEGE_NOTIF_ID, WINBACK_NOTIF_ID } from '@/services/notifications';

const ID_TO_EVENT: Record<string, string> = {
  [STREAK_NOTIF_ID]:  'notification_streak_risk_opened',
  [SIEGE_NOTIF_ID]:   'notification_siege_opened',
  [WINBACK_NOTIF_ID]: 'notification_winback_opened',
};

export function useNotificationTracking() {
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const id    = response.notification.request.identifier;
      const event = ID_TO_EVENT[id];
      if (event) analytics.track(event, {});
    });
    return () => sub.remove();
  }, []);
}
