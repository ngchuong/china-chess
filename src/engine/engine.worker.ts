import { createEngine } from './engine';

interface WorkerRequest {
  id: number;
  type: 'search' | 'clear';
  moves?: number[];
  maxDepth?: number;
  timeMs?: number;
  noise?: number;
}

const eng = createEngine();
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(msg: unknown): void;
};

ctx.onmessage = e => {
  const d = e.data;
  if (d.type === 'clear') { eng.clearTT(); return; }
  eng.setMoves(d.moves ?? []);
  const r = eng.search(d.maxDepth ?? 30, d.timeMs ?? 1000, d.noise ?? 0);
  ctx.postMessage({ id: d.id, ...r });
};
