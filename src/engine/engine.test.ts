import { describe, expect, it } from 'vitest';
import { createEngine, moveToUci, uciToMove } from './engine';
import { buildReview } from '../game/review';

function perft(E: ReturnType<typeof createEngine>, d: number): number {
  if (!d) return 1;
  let n = 0;
  for (const m of E.legalMoves()) { E.make(m); n += perft(E, d - 1); E.unmake(); }
  return n;
}

describe('built-in engine', () => {
  it('generates the standard perft counts from the start position', () => {
    const E = createEngine();
    expect([1, 2, 3].map(d => perft(E, d))).toEqual([44, 1920, 79666]);
  });

  it('converts between internal moves and Pikafish UCI coordinates', () => {
    const E = createEngine();
    const m = uciToMove('h2e2'); // Red cannon to the centre file
    expect(E.legalMoves()).toContain(m);
    expect(E.notate(m)).toBe('P2-5');
    expect(moveToUci(m)).toBe('h2e2');
    E.make(m);
    // Black counts files from its own right, so its mirror of Red's P2-5 is b7e7.
    expect(E.notate(uciToMove('b7e7'))).toBe('P2-5');
    expect(E.notate(uciToMove('h7e7'))).toBe('P8-5');
  });

  it('returns a legal move from a search', () => {
    const E = createEngine();
    const r = E.search(4, 1000);
    expect(E.legalMoves()).toContain(r.move);
    expect(r.pv[0]).toBe(r.move);
  });
});

describe('review', () => {
  it('marks the engine move as best and a large evaluation drop as a blunder', () => {
    const moves = ['h2e2', 'h9g7'].map(uciToMove);
    const an = [
      { move: moves[0], score: 30, pv: [moves[0]], depth: 10 },          // Red to move: best is h2e2
      { move: uciToMove('b9c7'), score: 20, pv: [], depth: 10 },        // Black to move: engine prefers b9c7
      { move: uciToMove('e2e6'), score: 800, pv: [], depth: 10 },       // after h9g7 Red is +8
    ];
    const r = buildReview(moves, an);
    expect(r.items[0].cat).toBe('best');
    expect(r.items[0].score).toBe(100);
    expect(r.items[1].cat).toBe('blunder');
    expect(r.items[1].bestN).toBe('M2.3');
    expect(r.acc[1]).toBe(100);
  });
});
