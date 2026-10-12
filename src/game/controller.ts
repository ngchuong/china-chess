import { createEngine, moveFrom, moveTo, type SearchResult, type Side } from '../engine/engine';
import { isAbort, type BackendId, type BackendResult, type EngineBackend, type EngineLine } from '../engine/backend';
import { BuiltinBackend } from '../engine/builtinBackend';
import { checkPikafish, PikafishBackend } from '../engine/pikafishBackend';
import { ANALYSIS_MS, HINT_MS, LEVELS, TIMES, type CatKey, type Level, type TimeControl } from './constants';
import { buildReview, type Review } from './review';

export type Phase = 'setup' | 'play' | 'over' | 'analyzing' | 'review';

export interface Settings {
  side: 'red' | 'black' | 'random';
  level: number;
  time: string;
  glyph: 'han' | 'vn';
  anMode: 'fast' | 'deep';
  engine: BackendId;
}

export interface Note {
  n: string;
  cap: number;
  pc: number;
  side: Side;
  check: boolean;
}

export interface Result { winner: Side | 0; reason: string }

export interface BoardView {
  board: Int8Array;
  last: number;
  lastColor: string | null;
  check: number;
  arrows: { move: number; kind: 'best' | 'hint' }[];
  sel: number;
  targets: number[];
  anim: { from: number; to: number; id: number } | null;
}

export type PikafishStatus = { state: 'checking' } | { state: 'ok'; name: string } | { state: 'off'; error: string };

const SETTINGS_KEY = 'cotuong-settings';
const DEFAULTS: Settings = { side: 'red', level: 2, time: '10+0', glyph: 'han', anMode: 'fast', engine: 'pikafish' };

function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    if (s) return { ...DEFAULTS, ...s };
  } catch { /* storage unavailable */ }
  return { ...DEFAULTS };
}

/** Pick among MultiPV lines within `window` cp of the best, favouring better lines. */
function pickLine(lines: EngineLine[], window: number): EngineLine | undefined {
  if (window <= 0 || lines.length < 2) return lines[0];
  const best = lines[0].score;
  const pool = lines.filter(l => l.score >= best - window);
  const weights = pool.map(l => Math.exp(-(best - l.score) / (window / 2)));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
  return pool[0];
}

/**
 * All game logic, independent of React. Components read its fields and call its
 * methods; `subscribe`/`getVersion` plug it into useSyncExternalStore.
 */
export class GameController {
  readonly G = createEngine();
  private readonly viewEngine = createEngine();
  private readonly builtin = new BuiltinBackend();
  private pikafish: PikafishBackend | null = null;
  private backend: EngineBackend = this.builtin;
  private listeners = new Set<() => void>();
  private version = 0;
  /** Bumped whenever pending engine replies must be ignored (undo, new game, cancel). */
  private token = 0;

  settings: Settings = loadSettings();
  pikafishStatus: PikafishStatus = { state: 'checking' };
  notice: string | null = null;

  phase: Phase = 'setup';
  player: Side = this.settings.side === 'black' ? -1 : 1;
  level: Level = LEVELS[this.settings.level] ?? LEVELS[2];
  tc: TimeControl = TIMES.find(t => t.id === this.settings.time) ?? TIMES[0];
  moves: number[] = [];
  notes: Note[] = [];
  private keys: string[] = [this.G.key()];
  clock: Record<Side, number> = { 1: 0, [-1]: 0 } as Record<Side, number>;
  turnStart = 0;
  result: Result | null = null;
  hints = 0;
  undos = 0;
  sel = -1;
  targets: number[] = [];
  hint: { move: number; n: string; score: number } | null = null;
  hintBusy = false;
  thinking = false;
  confirmResign = false;
  progress = 0;
  review: Review | null = null;
  ri = 0;
  private anim: BoardView['anim'] = null;

  constructor() {
    setInterval(() => this.tick(), 200);
    void this.detectPikafish();
  }

  // ---- store plumbing ----
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getVersion = () => this.version;
  private emit() { this.version++; this.listeners.forEach(f => f()); }

  // ---- engine selection ----
  async detectPikafish() {
    this.pikafishStatus = { state: 'checking' };
    this.emit();
    const h = await checkPikafish();
    this.pikafishStatus = h.ok ? { state: 'ok', name: h.engine ?? 'Pikafish' } : { state: 'off', error: h.error ?? 'Chưa chạy server' };
    this.pikafish = h.ok ? new PikafishBackend(h.engine ?? 'Pikafish') : null;
    this.emit();
  }
  get engineLabel() { return this.backend.label; }
  get usingPikafish() { return this.backend.id === 'pikafish'; }
  private chooseBackend() {
    this.backend = this.settings.engine === 'pikafish' && this.pikafish ? this.pikafish : this.builtin;
  }
  /** Run a search; if Pikafish fails (server stopped), switch to the built-in engine and retry once. */
  private async search(req: Parameters<EngineBackend['search']>[0], builtinReq?: Parameters<EngineBackend['search']>[0]): Promise<BackendResult> {
    try {
      return await this.backend.search(this.backend.id === 'builtin' && builtinReq ? builtinReq : req);
    } catch (e) {
      if (isAbort(e) || this.backend.id === 'builtin') throw e;
      this.backend = this.builtin;
      this.pikafishStatus = { state: 'off', error: 'Mất kết nối Pikafish' };
      this.notice = 'Mất kết nối với Pikafish, đã chuyển sang engine tích hợp.';
      this.emit();
      return this.builtin.search(builtinReq ?? req);
    }
  }
  private cancelEngine() {
    this.token++;
    this.builtin.cancel();
    this.pikafish?.cancel();
    this.thinking = false;
    this.hintBusy = false;
  }

  dismissNotice() { this.notice = null; this.emit(); }

  // ---- settings ----
  updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    this.settings = { ...this.settings, [key]: value };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* ignore */ }
    if (key === 'side' && this.phase === 'setup') this.player = value === 'black' ? -1 : 1;
    this.emit();
  }

  // ---- clocks ----
  remaining(side: Side, now = performance.now()) {
    let ms = this.clock[side];
    if (this.phase === 'play' && this.G.side === side && this.tc.min) ms -= now - this.turnStart;
    return ms;
  }
  private tick() {
    if (this.phase !== 'play' || !this.tc.min) return;
    const s = this.G.side;
    if (this.remaining(s) <= 0) {
      this.clock[s] = 0;
      this.endGame(-s as Side, (s === this.player ? 'Bạn' : 'Máy') + ' hết giờ');
      this.emit();
    }
  }

  // ---- game flow ----
  startGame() {
    const s = this.settings;
    this.cancelEngine();
    this.player = s.side === 'red' ? 1 : s.side === 'black' ? -1 : Math.random() < 0.5 ? 1 : -1;
    this.level = LEVELS[s.level] ?? LEVELS[2];
    this.tc = TIMES.find(t => t.id === s.time) ?? TIMES[0];
    this.chooseBackend();
    this.backend.newGame();
    this.G.reset();
    this.moves = []; this.notes = []; this.keys = [this.G.key()];
    this.clock = { 1: this.tc.min * 60000, [-1]: this.tc.min * 60000 } as Record<Side, number>;
    this.turnStart = performance.now();
    this.result = null; this.hints = 0; this.undos = 0; this.sel = -1; this.targets = [];
    this.hint = null; this.confirmResign = false; this.review = null; this.notice = null; this.anim = null;
    this.phase = 'play';
    this.emit();
    if (this.G.side !== this.player) this.engineTurn();
  }

  newGame() {
    this.cancelEngine();
    this.phase = 'setup';
    this.review = null; this.result = null; this.notice = null; this.anim = null;
    this.player = this.settings.side === 'black' ? -1 : 1;
    this.G.reset(); this.moves = []; this.notes = []; this.keys = [this.G.key()];
    this.emit();
  }

  private applyMove(m: number) {
    const now = performance.now(), mover = this.G.side;
    if (this.tc.min) this.clock[mover] += this.tc.inc * 1000 - (now - this.turnStart);
    this.turnStart = now;
    const note: Note = { n: this.G.notate(m), cap: this.G.board[moveTo(m)], pc: this.G.board[moveFrom(m)], side: mover, check: false };
    this.G.make(m);
    this.moves.push(m);
    note.check = this.G.inCheck();
    this.notes.push(note);
    this.keys.push(this.G.key());
    this.hint = null; this.sel = -1; this.targets = []; this.confirmResign = false;
    this.anim = { from: moveFrom(m), to: moveTo(m), id: this.moves.length };
    this.checkEnd();
    this.emit();
  }

  private checkEnd() {
    const G = this.G;
    if (!G.legalMoves().length) return this.endGame(-G.side as Side, G.inCheck() ? 'Chiếu bí' : 'Hết nước đi (bị vây chết)');
    const k = this.keys[this.keys.length - 1];
    const idx: number[] = [];
    this.keys.forEach((x, i) => { if (x === k) idx.push(i); });
    if (idx.length >= 3) {
      // Perpetual check: the side that checked on every move of the cycle loses.
      const from = idx[idx.length - 3], to = this.keys.length - 1;
      let rAll = true, bAll = true;
      for (let i = from; i < to; i++) {
        const n = this.notes[i];
        if (n.side > 0) { if (!n.check) rAll = false; } else if (!n.check) bAll = false;
      }
      if (rAll && !bAll) return this.endGame(-1, 'Đỏ chiếu mãi (trường chiếu) nên bị xử thua');
      if (bAll && !rAll) return this.endGame(1, 'Đen chiếu mãi (trường chiếu) nên bị xử thua');
      return this.endGame(0, 'Lặp lại thế cờ 3 lần');
    }
    let quiet = 0;
    for (let i = this.notes.length - 1; i >= 0 && !this.notes[i].cap; i--) quiet++;
    if (quiet >= 120) return this.endGame(0, '60 nước liên tiếp không ăn quân');
    for (let s = 0; s < 90; s++) if (Math.abs(G.board[s]) >= 4) return;
    this.endGame(0, 'Hai bên đều không còn quân tấn công');
  }

  private endGame(winner: Side | 0, reason: string) {
    this.result = { winner, reason };
    this.phase = 'over';
    this.sel = -1; this.targets = [];
    if (this.thinking || this.hintBusy) this.cancelEngine();
  }

  private engineTurn() {
    this.thinking = true;
    const tok = ++this.token;
    this.emit();
    const L = this.level;
    const cap = this.tc.min ? Math.max(150, this.remaining(this.G.side) / 25 + this.tc.inc * 800) : Infinity;
    const pf = L.pikafish;
    const t0 = performance.now();
    this.search(
      { moves: [...this.moves], depth: pf.depth, timeMs: Math.min(pf.movetime ?? 1000, cap), multipv: pf.multipv },
      { moves: [...this.moves], depth: L.builtin.depth, timeMs: Math.min(L.builtin.time, cap), noise: L.builtin.noise },
    ).then(r => {
      if (tok !== this.token || this.phase !== 'play') return;
      const line = this.backend.id === 'pikafish' ? pickLine(r.lines, pf.window) : undefined;
      const move = line?.move ?? r.move;
      // Small pause so a fast reply is still visible as a separate move.
      const wait = Math.max(0, 420 - (performance.now() - t0));
      setTimeout(() => {
        if (tok !== this.token || this.phase !== 'play') return;
        this.thinking = false;
        if (move) this.applyMove(move); else this.emit();
      }, wait);
    }).catch(e => {
      if (isAbort(e) || tok !== this.token) return;
      this.thinking = false;
      this.notice = 'Engine gặp lỗi: ' + (e as Error).message;
      this.emit();
    });
  }

  clickSquare(sq: number) {
    if (this.phase !== 'play' || this.thinking || this.G.side !== this.player) return;
    if (this.sel >= 0) {
      const m = this.targets.find(x => moveTo(x) === sq);
      if (m !== undefined) {
        this.applyMove(m);
        if (this.phase === 'play') this.engineTurn();
        return;
      }
    }
    const p = this.G.board[sq];
    if (p && Math.sign(p) === this.player) {
      if (this.sel === sq) { this.sel = -1; this.targets = []; }
      else { this.sel = sq; this.targets = this.G.legalMoves().filter(m => moveFrom(m) === sq); }
    } else { this.sel = -1; this.targets = []; }
    this.emit();
  }

  get canUndo() {
    if (this.phase !== 'play') return false;
    return this.moves.length >= (this.G.side === this.player ? 2 : 1);
  }
  undo() {
    if (!this.canUndo) return;
    const pop = this.G.side === this.player ? 2 : 1;
    if (this.thinking || this.hintBusy) this.cancelEngine();
    this.moves.splice(-pop); this.notes.splice(-pop); this.keys.splice(-pop);
    this.G.setMoves(this.moves);
    this.undos++;
    this.turnStart = performance.now();
    this.hint = null; this.sel = -1; this.targets = []; this.confirmResign = false; this.anim = null;
    this.emit();
    if (this.G.side !== this.player) this.engineTurn();
  }

  requestHint() {
    if (this.phase !== 'play' || this.thinking || this.hintBusy || this.G.side !== this.player) return;
    this.hintBusy = true;
    const ply = this.moves.length, tok = this.token;
    this.emit();
    this.search({ moves: [...this.moves], timeMs: HINT_MS }).then(r => {
      if (tok !== this.token) return;
      this.hintBusy = false;
      if (this.phase === 'play' && this.moves.length === ply && r.move) {
        this.hint = { move: r.move, n: this.G.notate(r.move), score: r.score };
        this.hints++;
      }
      this.emit();
    }).catch(e => {
      if (isAbort(e) || tok !== this.token) return;
      this.hintBusy = false;
      this.emit();
    });
  }

  resign() {
    if (!this.confirmResign) { this.confirmResign = true; this.emit(); return; }
    this.endGame(-this.player as Side, 'Bạn đầu hàng');
    this.emit();
  }
  cancelResign() { this.confirmResign = false; this.emit(); }

  // ---- review ----
  async startReview() {
    if (!this.moves.length) return;
    this.cancelEngine();
    const tok = this.token;
    this.phase = 'analyzing';
    this.progress = 0;
    this.emit();
    const per = ANALYSIS_MS[this.settings.anMode];
    const an: SearchResult[] = [];
    try {
      for (let i = 0; i <= this.moves.length; i++) {
        const prefix = this.moves.slice(0, i);
        an.push(await this.search({ moves: prefix, timeMs: per }, { moves: prefix, timeMs: per, depth: 40 }));
        if (tok !== this.token) return;
        this.progress = i + 1;
        this.emit();
      }
    } catch (e) {
      if (isAbort(e) || tok !== this.token) return;
      this.notice = 'Phân tích thất bại: ' + (e as Error).message;
      this.phase = 'over';
      this.emit();
      return;
    }
    this.review = buildReview(this.moves, an);
    this.phase = 'review';
    const firstMine = this.review.items.find(x => x.side === this.player);
    this.ri = firstMine ? firstMine.i + 1 : 0;
    this.emit();
  }
  cancelReview() {
    this.cancelEngine();
    this.phase = 'over';
    this.emit();
  }
  goTo(i: number) {
    this.ri = Math.max(0, Math.min(this.moves.length, i));
    this.emit();
  }
  nextMistake() {
    if (!this.review) return;
    const bad = (c: CatKey) => c === 'inacc' || c === 'mistake' || c === 'blunder';
    const mine = this.review.items.filter(x => x.side === this.player && bad(x.cat));
    const nx = mine.find(x => x.i + 1 > this.ri) ?? mine[0];
    if (nx) this.goTo(nx.i + 1);
  }

  get resultTitle() {
    const w = this.result?.winner;
    return w === 0 ? 'Hòa cờ' : w === this.player ? 'Bạn thắng!' : 'Máy thắng';
  }

  /** What the board should show for the current phase. */
  boardView(): BoardView {
    if (this.phase === 'review' && this.review) {
      const V = this.viewEngine, i = this.ri;
      V.setMoves(this.moves.slice(0, i));
      const it = i > 0 ? this.review.items[i - 1] : null;
      const arrows: BoardView['arrows'] = [];
      if (it && it.best && it.best !== it.move) arrows.push({ move: it.best, kind: 'best' });
      if (!it && this.review.first) arrows.push({ move: this.review.first.move, kind: 'best' });
      return {
        board: Int8Array.from(V.board), last: i > 0 ? this.moves[i - 1] : 0,
        lastColor: it ? `var(--c-${it.cat})` : null, check: V.inCheck() ? V.kingSq(V.side) : -1,
        arrows, sel: -1, targets: [], anim: null,
      };
    }
    const G = this.G;
    return {
      board: Int8Array.from(G.board),
      last: this.moves.length ? this.moves[this.moves.length - 1] : 0,
      lastColor: null,
      check: G.inCheck() ? G.kingSq(G.side) : -1,
      arrows: this.hint ? [{ move: this.hint.move, kind: 'hint' }] : [],
      sel: this.phase === 'play' ? this.sel : -1,
      targets: this.phase === 'play' ? this.targets : [],
      anim: this.anim,
    };
  }
}
