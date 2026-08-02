import { Audio } from 'expo-av';
import { useUserStore } from '@/stores/useUserStore';

export type SoundType = 'move' | 'capture' | 'check' | 'complete' | 'fail';

const SOUND_FILES: Record<SoundType, number> = {
  move:     require('../../assets/sounds/move.mp3'),
  capture:  require('../../assets/sounds/capture.mp3'),
  check:    require('../../assets/sounds/check.mp3'),
  complete: require('../../assets/sounds/complete.mp3'),
  fail:     require('../../assets/sounds/fail.mp3'),
};

const cache: Partial<Record<SoundType, Audio.Sound>> = {};

async function loadSound(type: SoundType): Promise<Audio.Sound> {
  if (cache[type]) return cache[type]!;
  const { sound } = await Audio.Sound.createAsync(SOUND_FILES[type], { shouldPlay: false });
  cache[type] = sound;
  return sound;
}

export function preloadSounds(): void {
  (Object.keys(SOUND_FILES) as SoundType[]).forEach((type) => {
    loadSound(type).catch(() => {});
  });
}

export async function playMoveSound(type: SoundType): Promise<void> {
  if (!useUserStore.getState().soundEnabled) return;
  try {
    const sound = await loadSound(type);
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {
    // audio errors must never crash the UI
  }
}
