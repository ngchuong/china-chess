import { MATE, moveToUci, uciToMove } from './engine';
import { AbortedError, type BackendResult, type EngineBackend, type EngineLine, type SearchRequest } from './backend';

/** Shape returned by the local server (server/index.mjs). */
interface ServerLine {
  multipv: number;
  depth: number;
  score: { unit: 'cp' | 'mate'; value: number };
  pv: string[];
}
interface ServerResult {
  bestmove: string | null;
  lines: ServerLine[];
}
export interface Health {
  ok: boolean;
  engine?: string;
  error?: string;
}

const API = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';

/** Pikafish reports "mate N" in full moves; convert to the internal ±(MATE - plies) convention. */
function toScore(s: ServerLine['score']): number {
  if (s.unit === 'cp') return s.value;
  if (s.value > 0) return MATE - (2 * s.value - 1);
  if (s.value < 0) return -(MATE - 2 * -s.value);
  return -MATE;
}

export async function checkPikafish(): Promise<Health> {
  try {
    const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return (await res.json()) as Health;
  } catch {
    return { ok: false, error: 'Không kết nối được server' };
  }
}

/** Pikafish running natively behind the local Node server; the browser talks to it over HTTP. */
export class PikafishBackend implements EngineBackend {
  readonly id = 'pikafish' as const;
  private controllers = new Set<AbortController>();

  constructor(readonly label: string) {}

  async search(req: SearchRequest): Promise<BackendResult> {
    const ac = new AbortController();
    this.controllers.add(ac);
    try {
      const body = {
        moves: req.moves.map(moveToUci),
        depth: req.depth,
        movetime: req.depth ? undefined : Math.round(req.timeMs),
        multipv: req.multipv ?? 1,
      };
      const res = await fetch(`${API}/search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`Pikafish: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as ServerResult;
      if (!data.bestmove) return { move: 0, score: -MATE, pv: [], depth: 0, lines: [] };
      const lines: EngineLine[] = data.lines
        .filter(l => l.pv.length)
        .map(l => ({ move: uciToMove(l.pv[0]), score: toScore(l.score), pv: l.pv.map(uciToMove) }));
      const best = uciToMove(data.bestmove);
      let top = lines.find(l => l.move === best);
      if (!top) {
        top = { move: best, score: lines[0]?.score ?? 0, pv: [best] };
        lines.unshift(top);
      }
      return { move: best, score: top.score, pv: top.pv, depth: data.lines[0]?.depth ?? 0, lines };
    } catch (e) {
      if (ac.signal.aborted) throw new AbortedError();
      throw e;
    } finally {
      this.controllers.delete(ac);
    }
  }

  cancel() {
    for (const ac of this.controllers) ac.abort();
    this.controllers.clear();
  }

  newGame() {
    fetch(`${API}/newgame`, { method: 'POST' }).catch(() => {});
  }
}
