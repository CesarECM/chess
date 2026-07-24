import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

export function useShareCard() {
  const cardRef  = useRef<View>(null);
  const [isSharing, setIsSharing] = useState(false);

  async function captureAndShare() {
    if (Platform.OS === 'web') return;
    if (!cardRef.current) return;

    setIsSharing(true);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: '¡Comparte tu logro!',
        });
      }
    } catch {
      // user dismissed sheet or capture failed silently
    } finally {
      setIsSharing(false);
    }
  }

  return { cardRef, isSharing, captureAndShare };
}
