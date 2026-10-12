import { createEngine, type Engine, type SearchResult } from './engine';
import { AbortedError, type BackendResult, type EngineBackend, type SearchRequest } from './backend';

interface Pending {
  resolve: (r: BackendResult) => void;
  reject: (e: Error) => void;
}

const withLines = (r: SearchResult): BackendResult => ({
  ...r,
  lines: r.move ? [{ move: r.move, score: r.score, pv: r.pv }] : [],
});

/** The built-in JS engine, run in a Web Worker (or on the main thread if workers are unavailable). */
export class BuiltinBackend implements EngineBackend {
  readonly id = 'builtin' as const;
  readonly label = 'Engine tích hợp';
  private worker: Worker | null = null;
  private local: Engine | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();

  constructor() { this.boot(); }

  private boot() {
    if (this.local) return;
    try {
      this.worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<SearchResult & { id: number }>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        p.resolve(withLines(e.data));
      };
      this.worker.onerror = () => { this.worker = null; this.local = createEngine(); };
    } catch {
      this.worker = null;
      this.local = createEngine();
    }
  }

  search(req: SearchRequest): Promise<BackendResult> {
    const id = ++this.seq;
    const maxDepth = req.depth ?? 40;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      if (this.worker) {
        this.worker.postMessage({ id, type: 'search', moves: [...req.moves], maxDepth, timeMs: req.timeMs, noise: req.noise ?? 0 });
      } else {
        setTimeout(() => {
          const p = this.pending.get(id);
          if (!p || !this.local) return;
          this.local.setMoves(req.moves);
          const r = this.local.search(maxDepth, req.timeMs, req.noise ?? 0);
          this.pending.delete(id);
          p.resolve(withLines(r));
        }, 20);
      }
    });
  }

  cancel() {
    if (!this.pending.size) return;
    for (const p of this.pending.values()) p.reject(new AbortedError());
    this.pending.clear();
    if (this.worker) { this.worker.terminate(); this.worker = null; this.boot(); }
  }

  newGame() {
    if (this.worker) this.worker.postMessage({ id: 0, type: 'clear' });
    else this.local?.clearTT();
  }
}
