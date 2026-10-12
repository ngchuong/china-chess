import { useSyncExternalStore } from 'react';
import { GameController } from './controller';

export const game = new GameController();

/** Re-renders the calling component whenever the game state changes. */
export function useGame() {
  useSyncExternalStore(game.subscribe, game.getVersion);
  return game;
}
