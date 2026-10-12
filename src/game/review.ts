import { createEngine, MATE, MATE_BOUND, moveFrom, moveTo, type Engine, type SearchResult, type Side } from '../engine/engine';
import { NAME, PVAL, type CatKey } from './constants';

export interface ReviewItem {
  /** Ply index (0 = Red's first move). */
  i: number;
  move: number;
  side: Side;
  n: string;
  cat: CatKey;
  /** 0–100 */
  score: number;
  best: number;
  bestN: string;
  bestLine: string;
  /** Evaluations from the mover's point of view. */
  before: number;
  after: number;
  why: string[];
}

export interface Review {
  items: ReviewItem[];
  acc: Record<Side, number>;
  counts: Record<Side, Partial<Record<CatKey, number>>>;
  /** Evaluation of every position (0..N) from Red's point of view. */
  evals: number[];
  first: { move: number; n: string; line: string; score: number } | null;
}

const toCp = (s: number) =>
  s >= MATE_BOUND ? 3000 - (MATE - s) : s <= -MATE_BOUND ? -3000 + (MATE + s) : Math.max(-2500, Math.min(2500, s));
/** Expected score (0..1) for a centipawn evaluation. */
export const winProb = (s: number) => 1 / (1 + Math.exp(-toCp(s) / 300));
export const isMate = (s: number) => Math.abs(s) >= MATE_BOUND;
export const mateIn = (s: number) => Math.ceil((MATE - Math.abs(s)) / 2);

/** Compact evaluation from Red's view: "+1.2", "−M3". */
export function fmtRed(s: number) {
  if (isMate(s)) return (s > 0 ? '+' : '−') + 'M' + mateIn(s);
  return (s >= 0 ? '+' : '−') + (Math.abs(s) / 100).toFixed(1);
}
/** Evaluation from the mover's view, in words for mates. */
export function fmtFor(s: number) {
  if (isMate(s)) return s > 0 ? `thắng (chiếu bí sau ${mateIn(s)} nước)` : `thua (bị chiếu bí sau ${mateIn(s)} nước)`;
  return (s >= 0 ? '+' : '−') + (Math.abs(s) / 100).toFixed(1);
}

/** Notation for a line of moves, stopping at the first illegal one. */
export function lineNotation(E: Engine, pv: readonly number[], limit = 6) {
  const out: string[] = [];
  let n = 0;
  for (const m of pv.slice(0, limit)) {
    if (!E.legalMoves().includes(m)) break;
    out.push(E.notate(m));
    E.make(m);
    n++;
  }
  while (n--) E.unmake();
  return out.join(' → ');
}

function motif(pc: number, f: number, t: number) {
  const tp = Math.abs(pc), s = Math.sign(pc), r1 = Math.floor(f / 9), r2 = Math.floor(t / 9), c2 = t % 9;
  const fwd = s > 0 ? r2 < r1 : r2 > r1, home = s > 0 ? 9 : 0;
  const crossed = s > 0 ? r2 <= 4 : r2 >= 5, wasHome = s > 0 ? r1 >= 5 : r1 <= 4;
  if (tp === 6 && c2 === 4) return 'Đưa Pháo vào trung lộ, uy hiếp trực tiếp Tướng đối phương.';
  if (tp === 4 && fwd) return 'Phát triển Mã, tăng kiểm soát các điểm quan trọng.';
  if (tp === 5 && r1 === home) return 'Xuất Xe sớm, đưa quân mạnh nhất vào trận.';
  if (tp === 5) return 'Xe chiếm đường thông, tăng mức hoạt động.';
  if (tp === 7 && crossed && wasHome) return 'Tốt qua sông, có thêm khả năng đi ngang và gây áp lực.';
  if (tp === 7) return 'Thúc Tốt, mở đường cho Mã và giành không gian.';
  if (tp === 2 || tp === 3) return 'Củng cố phòng thủ quanh Tướng.';
  if (tp === 1) return 'Điều chỉnh vị trí Tướng cho an toàn hơn.';
  if (tp === 4) return 'Điều Mã về vị trí phòng thủ tốt hơn.';
  if (tp === 6) return 'Điều chỉnh Pháo để chuẩn bị tấn công hoặc phòng thủ.';
  return '';
}

function classify(legalCount: number, isBest: boolean, loss: number): CatKey {
  if (legalCount === 1) return 'forced';
  if (isBest) return 'best';
  if (loss < 0.02) return 'great';
  if (loss < 0.06) return 'good';
  if (loss < 0.12) return 'inacc';
  if (loss < 0.22) return 'mistake';
  return 'blunder';
}

/**
 * Score every move of a game. `an[i]` is the engine's analysis of the position
 * before ply i (an[N] = final position). A move's loss is the drop in expected
 * score between the best move and the move played.
 */
export function buildReview(moves: readonly number[], an: readonly SearchResult[]): Review {
  const E = createEngine();
  const items: ReviewItem[] = [];
  const scores: Record<Side, number[]> = { 1: [], [-1]: [] } as Record<Side, number[]>;
  const counts = { 1: {}, [-1]: {} } as Record<Side, Partial<Record<CatKey, number>>>;
  const NM = (p: number) => NAME[Math.abs(p)];

  for (let i = 0; i < moves.length; i++) {
    const a = an[i], b = an[i + 1], m = moves[i], mover = E.side;
    const legalCount = E.legalMoves().length;
    const isBest = m === a.move;
    const bestS = a.score, playedS = isBest ? bestS : -b.score;
    const loss = Math.max(0, winProb(bestS) - winProb(playedS));
    const cat = classify(legalCount, isBest, loss);
    const score = cat === 'forced' || cat === 'best' ? 100 : Math.min(99, Math.round(100 * Math.exp(-loss * 6)));

    const f = moveFrom(m), t = moveTo(m), pc = E.board[f], cap = E.board[t];
    const playedN = E.notate(m), best = a.move, bestN = best ? E.notate(best) : '';
    const bestCap = best ? E.board[moveTo(best)] : 0;
    const bestLine = lineNotation(E, a.pv, 7);
    let bestChecks = false;
    if (best) { E.make(best); bestChecks = E.inCheck(); E.unmake(); }

    E.make(m);
    const gives = E.inCheck();
    const reply = b.move, replyN = reply ? E.notate(reply) : '';
    const replyCap = reply ? E.board[moveTo(reply)] : 0, replyTo = reply ? moveTo(reply) : -1;
    const replyLine = lineNotation(E, b.pv, 6);
    const endsGame = !reply && b.score === -MATE;

    const why: string[] = [];
    const good = cat === 'best' || cat === 'great' || cat === 'good' || cat === 'forced';
    if (cat === 'forced') why.push('Đây là nước đi hợp lệ duy nhất.');
    if (endsGame) why.push(gives ? 'Chiếu bí! Đối phương không còn cách thoát.' : 'Đối phương hết nước đi hợp lệ, thắng cờ.');
    else if (isMate(playedS) && playedS > 0) why.push(`Nước này dẫn tới chiếu bí sau ${mateIn(playedS)} nước.`);

    if (good) {
      if (cap) {
        if (replyTo === t && replyCap && PVAL[Math.abs(replyCap)] >= PVAL[Math.abs(cap)] - 0.5)
          why.push(`Đổi quân: ăn ${NM(cap)}, chấp nhận ${NM(pc)} bị ăn lại.`);
        else why.push(`Ăn ${NM(cap)} của đối phương mà không bị thiệt.`);
      }
      if (gives && !endsGame) why.push('Chiếu Tướng, buộc đối phương phải đối phó.');
      if (!cap && !gives && why.length === 0) { const mo = motif(pc, f, t); if (mo) why.push(mo); }
      if (cat === 'best' && why.length === 0) why.push('Trùng với nước máy đánh giá là tốt nhất ở thế cờ này.');
      if (!isBest && best && cat !== 'forced') why.push(`Máy nhỉnh hơn với ${bestN}, nhưng chênh lệch không đáng kể.`);
    } else {
      const matedNow = isMate(playedS) && playedS < 0, bestMated = isMate(bestS) && bestS < 0;
      if (matedNow && !bestMated) why.push(`Nước này mở đường cho đối phương chiếu bí sau ${mateIn(playedS)} nước: ${replyLine}.`);
      else if (isMate(bestS) && bestS > 0 && !(isMate(playedS) && playedS > 0)) why.push(`Bỏ lỡ đòn chiếu bí sau ${mateIn(bestS)} nước.`);
      else if (isMate(bestS) && bestS > 0) why.push('Vẫn thắng, nhưng đi chậm hơn đường chiếu bí nhanh nhất.');
      if (replyCap && !matedNow) {
        if (replyTo === t) {
          if (cap && PVAL[Math.abs(cap)] < PVAL[Math.abs(pc)])
            why.push(`Ăn ${NM(cap)} nhưng ${NM(pc)} bị ăn lại bằng ${replyN}, đổi quân bị thiệt.`);
          else if (!cap) why.push(`${NM(pc)} đi vào ô bị khống chế và bị ăn bằng ${replyN}.`);
        } else why.push(`Nước này để hở ${NM(replyCap)}: đối phương đáp ${replyN} ăn ${NM(replyCap)}.`);
      }
      if (bestCap && (!cap || PVAL[Math.abs(bestCap)] > PVAL[Math.abs(cap)])) why.push(`Bỏ lỡ cơ hội ăn ${NM(bestCap)} bằng ${bestN}.`);
      else if (bestChecks && !gives && !isMate(bestS)) why.push(`${bestN} chiếu Tướng, giữ quyền chủ động tấn công.`);
      if (why.length === 0)
        why.push(reply ? `Đối phương có nước đáp mạnh ${replyN}, thế cờ của bạn xấu đi rõ rệt.` : 'Thế cờ xấu đi so với phương án tốt nhất.');
      if (reply && replyLine && !matedNow) why.push(`Diễn biến dự kiến sau nước này: ${replyLine}.`);
    }

    items.push({ i, move: m, side: mover, n: playedN, cat, score, best, bestN, bestLine, before: bestS, after: playedS, why });
    scores[mover].push(score);
    counts[mover][cat] = (counts[mover][cat] ?? 0) + 1;
  }

  const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
  E.reset();
  const a0 = an[0];
  return {
    items,
    acc: { 1: avg(scores[1]), [-1]: avg(scores[-1]) } as Record<Side, number>,
    counts,
    evals: an.map((r, i) => r.score * (i % 2 === 0 ? 1 : -1)),
    first: a0?.move ? { move: a0.move, n: E.notate(a0.move), line: lineNotation(E, a0.pv, 6), score: a0.score } : null,
  };
}
