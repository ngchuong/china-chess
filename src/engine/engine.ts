/**
 * Built-in xiangqi engine: rules, move generation, Vietnamese notation and an
 * alpha-beta search. The UI uses it for rules/notation everywhere, and for
 * play/analysis only when the Pikafish server is not available.
 *
 * Board: 90 squares, index = row * 9 + col. Row 0 is Black's back rank,
 * row 9 is Red's. Pieces are signed: positive = Red, negative = Black.
 * Moves are encoded as `from | (to << 7)`.
 */

export const K = 1, A = 2, E = 3, N = 4, R = 5, C = 6, P = 7;
export const MATE = 30000;
export const MATE_BOUND = MATE - 1000;
const MAXPLY = 64;

export type Side = 1 | -1;

export interface SearchResult {
  move: number;
  /** Score from the side to move's point of view; mate = ±(MATE - plies). */
  score: number;
  pv: number[];
  depth: number;
}

export const moveFrom = (m: number) => m & 127;
export const moveTo = (m: number) => m >> 7;
export const makeMove = (from: number, to: number) => from | (to << 7);

/** UCI coordinates as used by Pikafish: files a–i left to right from Red, ranks 0 (Red) to 9 (Black). */
export function sqToUci(sq: number): string {
  return 'abcdefghi'[sq % 9] + String(9 - Math.floor(sq / 9));
}
export function moveToUci(m: number): string {
  return sqToUci(moveFrom(m)) + sqToUci(moveTo(m));
}
export function uciToMove(s: string): number {
  const sq = (f: string, r: string) => (9 - Number(r)) * 9 + (f.charCodeAt(0) - 97);
  return makeMove(sq(s[0], s[1]), sq(s[2], s[3]));
}

const BASE = [0, 0, 200, 200, 400, 900, 450, 100];
const ORD = [0, 100, 20, 20, 40, 90, 45, 10];
const RO = new Int8Array(90), CO = new Int8Array(90);
for (let i = 0; i < 90; i++) { RO[i] = (i / 9) | 0; CO[i] = i % 9; }

// Piece-square tables from Red's view: row 0 = enemy back rank, row 9 = own back rank.
const TP = [0,3,6,9,12,9,6,3,0, 18,36,56,80,120,80,56,36,18, 14,26,42,60,80,60,42,26,14, 10,20,30,34,40,34,30,20,10, 6,12,18,18,20,18,18,12,6, 2,0,8,0,8,0,8,0,2, 0,0,-2,0,4,0,-2,0,0, 0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0];
const TN = [4,8,16,12,4,12,16,8,4, 4,10,28,16,8,16,28,10,4, 12,14,16,20,18,20,16,14,12, 8,24,18,24,20,24,18,24,8, 6,16,14,18,16,18,14,16,6, 4,12,16,14,12,14,16,12,4, 2,6,8,6,10,6,8,6,2, 4,2,8,8,4,8,8,2,4, 0,2,4,4,-10,4,4,2,0, 0,-4,0,0,0,0,0,-4,0];
const TR = [14,14,12,18,16,18,12,14,14, 16,20,18,24,26,24,18,20,16, 12,12,12,18,18,18,12,12,12, 12,18,16,22,22,22,16,18,12, 12,14,12,18,18,18,12,14,12, 12,16,14,20,20,20,14,16,12, 6,10,8,14,14,14,8,10,6, 4,8,6,14,12,14,6,8,4, 8,4,8,16,8,16,8,4,8, -2,10,6,14,12,14,6,10,-2];
const TC = [6,4,0,-10,-12,-10,0,4,6, 2,2,0,-4,-14,-4,0,2,2, 2,2,0,-10,-8,-10,0,2,2, 0,0,-2,4,10,4,-2,0,0, 0,0,0,2,8,2,0,0,0, -2,0,4,2,6,2,4,0,-2, 0,0,0,2,4,2,0,0,0, 4,0,8,6,10,6,8,0,4, 0,2,4,6,6,6,4,2,0, 0,0,2,6,6,6,2,0,0];
const zeros = () => new Array<number>(90).fill(0);
const TA = zeros(); TA[76] = 8; TA[66] = -2; TA[68] = -2;
const TE = zeros(); TE[67] = 8; TE[63] = -4; TE[71] = -4; TE[47] = -2; TE[51] = -2;
const TK = zeros(); for (let c = 3; c <= 5; c++) { TK[81 + c] = c === 4 ? 0 : -8; TK[72 + c] = -20; TK[63 + c] = -35; }
const TABLE = [zeros(), TK, TA, TE, TN, TR, TC, TP];
const MULT = [0, 1, 1, 1, 2, 2, 2, 1];
const PSV: Int16Array[] = [];
for (let p = -7; p <= 7; p++) {
  const a = new Int16Array(90);
  if (p) {
    const t = Math.abs(p);
    for (let s = 0; s < 90; s++) {
      const rr = p > 0 ? RO[s] : 9 - RO[s];
      const v = BASE[t] + TABLE[t][rr * 9 + CO[s]] * MULT[t];
      a[s] = p > 0 ? v : -v;
    }
  }
  PSV.push(a);
}

let seed = 0x2545f491;
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
const ZL = new Int32Array(15 * 90), ZH = new Int32Array(15 * 90);
for (let i = 0; i < ZL.length; i++) { ZL[i] = rnd(); ZH[i] = rnd(); }
const SL = rnd(), SH = rnd();

const START = [-5,-4,-3,-2,-1,-2,-3,-4,-5, 0,0,0,0,0,0,0,0,0, 0,-6,0,0,0,0,0,-6,0, -7,0,-7,0,-7,0,-7,0,-7, 0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0, 7,0,7,0,7,0,7,0,7, 0,6,0,0,0,0,0,6,0, 0,0,0,0,0,0,0,0,0, 5,4,3,2,1,2,3,4,5];
const HD = [-2,-1,-1,0, -2,1,-1,0, 2,-1,1,0, 2,1,1,0, -1,-2,0,-1, 1,-2,0,-1, -1,2,0,1, 1,2,0,1];
const OD = [-1,0, 1,0, 0,-1, 0,1];
const DD = [-1,-1, -1,1, 1,-1, 1,1];
// Vietnamese notation letters: Tg Tướng, S Sĩ, T Tượng, M Mã, X Xe, P Pháo, B Tốt (Binh)
const LET = ['', 'Tg', 'S', 'T', 'M', 'X', 'P', 'B'];
const TTB = 20, TTM = (1 << TTB) - 1;

export function createEngine() {
  const board = new Int8Array(90);
  let side: Side = 1, kR = 0, kB = 0, hL = 0, hH = 0, sc = 0;
  let stM: number[] = [], stC: number[] = [], stL: number[] = [], stH: number[] = [];

  function reset() {
    board.set(START); side = 1; stM = []; stC = []; stL = []; stH = []; hL = 0; hH = 0; sc = 0;
    for (let s = 0; s < 90; s++) {
      const p = board[s];
      if (p) {
        hL ^= ZL[(p + 7) * 90 + s]; hH ^= ZH[(p + 7) * 90 + s]; sc += PSV[p + 7][s];
        if (p === 1) kR = s; else if (p === -1) kB = s;
      }
    }
  }
  function make(m: number) {
    const f = m & 127, t = m >> 7, p = board[f], q = board[t];
    stM.push(m); stC.push(q); stL.push(hL); stH.push(hH);
    const pi = (p + 7) * 90;
    hL ^= ZL[pi + f] ^ ZL[pi + t] ^ SL; hH ^= ZH[pi + f] ^ ZH[pi + t] ^ SH;
    if (q) { hL ^= ZL[(q + 7) * 90 + t]; hH ^= ZH[(q + 7) * 90 + t]; sc -= PSV[q + 7][t]; }
    sc += PSV[p + 7][t] - PSV[p + 7][f];
    board[t] = p; board[f] = 0;
    if (p === 1) kR = t; else if (p === -1) kB = t;
    side = -side as Side;
  }
  function unmake() {
    const m = stM.pop()!, q = stC.pop()!; hL = stL.pop()!; hH = stH.pop()!;
    const f = m & 127, t = m >> 7, p = board[t];
    board[f] = p; board[t] = q;
    sc += PSV[p + 7][f] - PSV[p + 7][t]; if (q) sc += PSV[q + 7][t];
    if (p === 1) kR = f; else if (p === -1) kB = f;
    side = -side as Side;
  }
  function makeNull() { stM.push(-1); stC.push(0); stL.push(hL); stH.push(hH); hL ^= SL; hH ^= SH; side = -side as Side; }
  function unmakeNull() { stM.pop(); stC.pop(); hL = stL.pop()!; hH = stH.pop()!; side = -side as Side; }

  function addM(out: number[], f: number, to: number, capOnly: boolean, s: number) {
    const q = board[to];
    if (q === 0) { if (!capOnly) out.push(f | (to << 7)); }
    else if ((q > 0) !== (s > 0)) out.push(f | (to << 7));
  }
  function gen(out: number[], capOnly: boolean) {
    const s = side;
    for (let f = 0; f < 90; f++) {
      const p = board[f];
      if (p === 0 || (p > 0) !== (s > 0)) continue;
      const t = p > 0 ? p : -p, r = RO[f], c = CO[f];
      if (t === R || t === C) {
        for (let d = 0; d < 8; d += 2) {
          const dr = OD[d], dc = OD[d + 1];
          let nr = r + dr, nc = c + dc, jumped = false;
          while (nr >= 0 && nr < 10 && nc >= 0 && nc < 9) {
            const to = nr * 9 + nc, q = board[to];
            if (t === R) {
              if (q === 0) { if (!capOnly) out.push(f | (to << 7)); }
              else { if ((q > 0) !== (s > 0)) out.push(f | (to << 7)); break; }
            } else if (!jumped) {
              if (q === 0) { if (!capOnly) out.push(f | (to << 7)); } else jumped = true;
            } else if (q !== 0) {
              if ((q > 0) !== (s > 0)) out.push(f | (to << 7));
              break;
            }
            nr += dr; nc += dc;
          }
        }
      } else if (t === N) {
        for (let k = 0; k < 32; k += 4) {
          const nr = r + HD[k], nc = c + HD[k + 1];
          if (nr < 0 || nr > 9 || nc < 0 || nc > 8) continue;
          if (board[(r + HD[k + 2]) * 9 + c + HD[k + 3]] !== 0) continue;
          addM(out, f, nr * 9 + nc, capOnly, s);
        }
      } else if (t === P) {
        const fr = r + (s > 0 ? -1 : 1);
        if (fr >= 0 && fr <= 9) addM(out, f, fr * 9 + c, capOnly, s);
        if (s > 0 ? r <= 4 : r >= 5) {
          if (c > 0) addM(out, f, f - 1, capOnly, s);
          if (c < 8) addM(out, f, f + 1, capOnly, s);
        }
      } else if (t === K || t === A) {
        const dirs = t === K ? OD : DD;
        for (let d = 0; d < 8; d += 2) {
          const nr = r + dirs[d], nc = c + dirs[d + 1];
          if (nc < 3 || nc > 5) continue;
          if (s > 0 ? nr < 7 || nr > 9 : nr < 0 || nr > 2) continue;
          addM(out, f, nr * 9 + nc, capOnly, s);
        }
      } else if (t === E) {
        for (let d = 0; d < 8; d += 2) {
          const nr = r + 2 * DD[d], nc = c + 2 * DD[d + 1];
          if (nr < 0 || nr > 9 || nc < 0 || nc > 8) continue;
          if (s > 0 ? nr < 5 : nr > 4) continue;
          if (board[(r + DD[d]) * 9 + c + DD[d + 1]] !== 0) continue;
          addM(out, f, nr * 9 + nc, capOnly, s);
        }
      }
    }
  }
  /** Is side `s`'s general attacked? Includes the "flying general" rule. */
  function attacked(s: number): boolean {
    const k = s > 0 ? kR : kB, kr = RO[k], kc = CO[k], e = -s;
    for (let d = 0; d < 8; d += 2) {
      const dr = OD[d], dc = OD[d + 1];
      let r = kr + dr, c = kc + dc, found = false;
      while (r >= 0 && r < 10 && c >= 0 && c < 9) {
        const q = board[r * 9 + c];
        if (q !== 0) {
          if (!found) {
            if (q === e * R) return true;
            if (q === e * K && dc === 0) return true;
            found = true;
          } else {
            if (q === e * C) return true;
            break;
          }
        }
        r += dr; c += dc;
      }
    }
    for (let k2 = 0; k2 < 32; k2 += 4) {
      const hr = kr + HD[k2], hc = kc + HD[k2 + 1];
      if (hr < 0 || hr > 9 || hc < 0 || hc > 8) continue;
      if (board[hr * 9 + hc] === e * N && board[(kr + Math.sign(HD[k2])) * 9 + kc + Math.sign(HD[k2 + 1])] === 0) return true;
    }
    const pr = kr + (s > 0 ? -1 : 1);
    if (pr >= 0 && pr <= 9 && board[pr * 9 + kc] === e * P) return true;
    if (kc > 0 && board[k - 1] === e * P) return true;
    if (kc < 8 && board[k + 1] === e * P) return true;
    return false;
  }
  function legalMoves(): number[] {
    const mv: number[] = [], out: number[] = [];
    gen(mv, false);
    for (const m of mv) { make(m); if (!attacked(-side)) out.push(m); unmake(); }
    return out;
  }
  function isRep(): boolean {
    const n = stM.length;
    for (let j = n - 1; j >= 0; j--) {
      if (stC[j] !== 0 || stM[j] === -1) return false;
      if (((n - j) & 1) === 0 && stL[j] === hL && stH[j] === hH) return true;
    }
    return false;
  }
  function bigPieces(s: number) {
    let n = 0;
    for (let i = 0; i < 90; i++) { const p = board[i] * s; if (p === R || p === N || p === C) n++; }
    return n;
  }

  // ---- search ----
  let ttK: Int32Array | null = null;
  let ttMv = new Int32Array(0), ttS = new Int32Array(0), ttD = new Int8Array(0), ttF = new Int8Array(0);
  const HIST = new Int32Array(8100), KIL = new Int32Array(MAXPLY * 2 + 4);
  let nodes = 0, stop = false, deadline = 0;

  function allocTT() {
    if (!ttK) {
      ttK = new Int32Array(1 << TTB); ttMv = new Int32Array(1 << TTB); ttS = new Int32Array(1 << TTB);
      ttD = new Int8Array(1 << TTB); ttF = new Int8Array(1 << TTB);
    }
  }
  function clearTT() {
    if (ttK) { ttK.fill(0); ttMv.fill(0); ttD.fill(0); ttF.fill(0); }
    HIST.fill(0);
  }
  const ordKey = (m: number) => { const q = board[m >> 7]; return q ? ORD[Math.abs(q)] * 128 - ORD[Math.abs(board[m & 127])] : 0; };

  function qs(alpha: number, beta: number, ply: number): number {
    if ((++nodes & 2047) === 0 && Date.now() > deadline) { stop = true; return 0; }
    if (stop) return 0;
    const inC = attacked(side);
    let best: number;
    if (!inC) { best = side * sc; if (best >= beta) return best; if (best > alpha) alpha = best; }
    else best = -MATE + ply;
    if (ply >= MAXPLY) return side * sc;
    const mv: number[] = []; gen(mv, !inC);
    const n = mv.length, ks = new Int32Array(n);
    for (let i = 0; i < n; i++) ks[i] = board[mv[i] >> 7] ? ordKey(mv[i]) : -1000;
    for (let i = 0; i < n; i++) {
      let bi = i; for (let j = i + 1; j < n; j++) if (ks[j] > ks[bi]) bi = j;
      const m = mv[bi]; mv[bi] = mv[i]; mv[i] = m; const tk = ks[bi]; ks[bi] = ks[i]; ks[i] = tk;
      make(m);
      if (attacked(-side)) { unmake(); continue; }
      const v = -qs(-beta, -alpha, ply + 1);
      unmake();
      if (stop) return 0;
      if (v > best) { best = v; if (v > alpha) { alpha = v; if (v >= beta) break; } }
    }
    return best;
  }

  function ns(depth: number, alpha: number, beta: number, ply: number, doNull: boolean): number {
    if (stop) return 0;
    if (isRep()) return 0;
    if (ply >= MAXPLY) return side * sc;
    const ma = -MATE + ply, mb = MATE - ply - 1;
    if (alpha < ma) alpha = ma;
    if (beta > mb) beta = mb;
    if (alpha >= beta) return alpha;
    const inC = attacked(side);
    if (inC && ply < 40) depth++;
    if (depth <= 0) return qs(alpha, beta, ply);
    if ((++nodes & 2047) === 0 && Date.now() > deadline) { stop = true; return 0; }
    const tt = ttK!, idx = hL & TTM;
    let ttm = 0;
    if (tt[idx] === hH) {
      ttm = ttMv[idx];
      if (ttD[idx] >= depth) {
        let s = ttS[idx];
        if (s >= MATE_BOUND) s -= ply; else if (s <= -MATE_BOUND) s += ply;
        const fl = ttF[idx];
        if (fl === 1 || (fl === 2 && s >= beta) || (fl === 3 && s <= alpha)) return s;
      }
    }
    if (doNull && !inC && depth >= 3 && beta < MATE_BOUND && beta > -MATE_BOUND && bigPieces(side) >= 2) {
      makeNull();
      const v = -ns(depth - 3, -beta, -beta + 1, ply + 1, false);
      unmakeNull();
      if (stop) return 0;
      if (v >= beta) return beta;
    }
    const mv: number[] = []; gen(mv, false);
    const n = mv.length, ks = new Int32Array(n), k1 = KIL[ply * 2], k2 = KIL[ply * 2 + 1];
    for (let i = 0; i < n; i++) {
      const m = mv[i];
      if (m === ttm) ks[i] = 1 << 30;
      else if (board[m >> 7]) ks[i] = (1 << 29) + ordKey(m);
      else if (m === k1) ks[i] = 1 << 28;
      else if (m === k2) ks[i] = (1 << 28) - 1;
      else ks[i] = HIST[(m & 127) * 90 + (m >> 7)];
    }
    let best = -MATE + ply, bm = 0, legal = 0;
    const a0 = alpha;
    for (let i = 0; i < n; i++) {
      let bi = i; for (let j = i + 1; j < n; j++) if (ks[j] > ks[bi]) bi = j;
      const m = mv[bi]; mv[bi] = mv[i]; mv[i] = m; const tk = ks[bi]; ks[bi] = ks[i]; ks[i] = tk;
      make(m);
      if (attacked(-side)) { unmake(); continue; }
      legal++;
      const capd = stC[stC.length - 1] !== 0;
      let v: number;
      if (legal === 1) v = -ns(depth - 1, -beta, -alpha, ply + 1, true);
      else {
        let red = 0;
        if (depth >= 3 && legal > 3 && !inC && !capd && m !== k1 && m !== k2 && !attacked(side)) red = legal > 10 ? 2 : 1;
        v = -ns(depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
        if (!stop && v > alpha && (red > 0 || v < beta)) v = -ns(depth - 1, -beta, -alpha, ply + 1, true);
      }
      unmake();
      if (stop) return 0;
      if (v > best) {
        best = v; bm = m;
        if (v > alpha) {
          alpha = v;
          if (v >= beta) {
            if (!capd) {
              if (KIL[ply * 2] !== m) { KIL[ply * 2 + 1] = KIL[ply * 2]; KIL[ply * 2] = m; }
              HIST[(m & 127) * 90 + (m >> 7)] += depth * depth;
            }
            break;
          }
        }
      }
    }
    // No legal move loses in xiangqi, whether in check or not.
    if (legal === 0) return -MATE + ply;
    let ss = best;
    if (ss >= MATE_BOUND) ss += ply; else if (ss <= -MATE_BOUND) ss -= ply;
    tt[idx] = hH; ttMv[idx] = bm; ttS[idx] = ss; ttD[idx] = depth; ttF[idx] = best >= beta ? 2 : best > a0 ? 1 : 3;
    return best;
  }

  /** Iterative deepening. `noise` (centipawns) randomizes root choices for weak levels. */
  function search(maxDepth: number, timeMs: number, noise = 0): SearchResult {
    allocTT();
    const t0 = Date.now();
    deadline = t0 + timeMs; stop = false; nodes = 0;
    for (let i = 0; i < HIST.length; i++) HIST[i] >>= 2;
    KIL.fill(0);
    const rm = legalMoves();
    if (!rm.length) return { move: 0, score: -MATE, pv: [], depth: 0 };
    rm.sort((a, b) => ordKey(b) - ordKey(a));
    const nz = new Map<number, number>();
    for (const m of rm) nz.set(m, noise ? Math.round((Math.random() * 2 - 1) * noise) : 0);
    let bestM = rm[0], bestRaw = 0, done = 0;
    for (let d = 1; d <= maxDepth; d++) {
      let alpha = -MATE - 1, cur = 0, curS = -MATE - 1, curRaw = 0, first = true;
      for (const m of rm) {
        const z = nz.get(m)!;
        make(m);
        let v: number;
        if (first || noise) v = -ns(d - 1, -MATE - 1, -(alpha - z), 1, true);
        else {
          v = -ns(d - 1, -(alpha - z) - 1, -(alpha - z), 1, true);
          if (!stop && v + z > alpha) v = -ns(d - 1, -MATE - 1, -(alpha - z), 1, true);
        }
        unmake();
        if (stop) break;
        first = false;
        if (v + z > curS) { curS = v + z; cur = m; curRaw = v; if (curS > alpha) alpha = curS; }
      }
      if (cur) { bestM = cur; bestRaw = curRaw; done = stop ? d - 1 : d; rm.splice(rm.indexOf(cur), 1); rm.unshift(cur); }
      if (stop) break;
      if (Math.abs(bestRaw) >= MATE_BOUND && d >= MATE - Math.abs(bestRaw) + 1) break;
      if (Date.now() - t0 > timeMs * 0.5) break;
    }
    const pv = [bestM];
    make(bestM);
    let cnt = 1;
    for (let k = 0; k < 11; k++) {
      const idx = hL & TTM;
      if (ttK![idx] !== hH) break;
      const m = ttMv[idx];
      if (!m || !legalMoves().includes(m)) break;
      pv.push(m); make(m); cnt++;
      if (isRep()) break;
    }
    while (cnt--) unmake();
    return { move: bestM, score: bestRaw, pv, depth: Math.max(done, 1) };
  }

  const fileNo = (c: number, s: number) => (s > 0 ? 9 - c : c + 1);
  /** Vietnamese notation, e.g. "P2-5", "M8.7", "Xt/1". Uses the current position. */
  function notate(m: number): string {
    const f = m & 127, t = m >> 7, p = board[f];
    if (!p) return '?';
    const s = p > 0 ? 1 : -1, tp = p * s, r1 = RO[f], c1 = CO[f], r2 = RO[t], c2 = CO[t];
    let tag = String(fileNo(c1, s));
    const others: number[] = [];
    for (let r = 0; r < 10; r++) if (r !== r1 && board[r * 9 + c1] === p) others.push(r);
    if (others.length) {
      const ahead = others.filter(r => (s > 0 ? r < r1 : r > r1)).length, total = others.length + 1;
      tag = ahead === 0 ? 't' : ahead === total - 1 ? 's' : 'g';
    }
    let op: string, num: number;
    if (r1 === r2) { op = '-'; num = fileNo(c2, s); }
    else {
      op = (s > 0 ? r2 < r1 : r2 > r1) ? '.' : '/';
      num = tp === N || tp === A || tp === E ? fileNo(c2, s) : Math.abs(r2 - r1);
    }
    return LET[tp] + tag + op + num;
  }

  reset();
  return {
    board,
    reset, make, unmake, legalMoves, notate, search, clearTT,
    setMoves(list: readonly number[]) { reset(); for (const m of list) make(m); },
    inCheck: () => attacked(side),
    key: () => hL + ':' + hH,
    get side(): Side { return side; },
    kingSq: (s: Side) => (s > 0 ? kR : kB),
  };
}

export type Engine = ReturnType<typeof createEngine>;
