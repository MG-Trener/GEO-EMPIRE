import { useCallback } from 'react';
import { useAudioPlayer } from 'expo-audio';

export function useGameSounds(enabled: boolean, volume: number) {
  const click = useAudioPlayer(require('../assets/sounds/ui-click.wav'));
  const scan = useAudioPlayer(require('../assets/sounds/scan.wav'));
  const success = useAudioPlayer(require('../assets/sounds/success.wav'));
  const error = useAudioPlayer(require('../assets/sounds/error.wav'));
  const build = useAudioPlayer(require('../assets/sounds/build.wav'));
  const cash = useAudioPlayer(require('../assets/sounds/cash.wav'));

  const replay = useCallback((player: ReturnType<typeof useAudioPlayer>) => {
    if (!enabled) return;
    try {
      player.volume = Math.min(1, Math.max(0, volume));
      void player.seekTo(0);
      player.play();
    } catch {
      // Sound effects must never block gameplay.
    }
  }, [enabled, volume]);

  return {
    click: useCallback(() => replay(click), [click, replay]),
    scan: useCallback(() => replay(scan), [replay, scan]),
    success: useCallback(() => replay(success), [replay, success]),
    error: useCallback(() => replay(error), [error, replay]),
    build: useCallback(() => replay(build), [build, replay]),
    cash: useCallback(() => replay(cash), [cash, replay]),
  };
}
