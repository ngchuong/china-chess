import type { SearchResult } from './engine';

export interface SearchRequest {
  /** Moves from the start position (internal encoding). */
  moves: readonly number[];
  /** Time budget in ms; ignored when `depth` is set for Pikafish. */
  timeMs: number;
  /** Fixed search depth (Pikafish) or depth cap (built-in engine). */
  depth?: number;
  /** Number of candidate lines to return (Pikafish MultiPV). */
  multipv?: number;
  /** Random root noise in centipawns (built-in engine only). */
  noise?: number;
}

export interface EngineLine {
  move: number;
  score: number;
  pv: number[];
}

export interface BackendResult extends SearchResult {
  /** Candidate lines, best first. Always contains at least the best line when a move exists. */
  lines: EngineLine[];
}

export type BackendId = 'pikafish' | 'builtin';

export interface EngineBackend {
  readonly id: BackendId;
  readonly label: string;
  search(req: SearchRequest): Promise<BackendResult>;
  /** Abort every running and queued search; their promises reject with an AbortError. */
  cancel(): void;
  /** Clear engine caches between games. */
  newGame(): void;
}

export class AbortedError extends Error {
  constructor() { super('aborted'); this.name = 'AbortError'; }
}
export const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError';
