// Local server: runs Pikafish (UCI) as a child process and exposes it over HTTP.
// Also serves the built frontend from ../dist when it exists.
//
//   GET  /api/health   -> { ok, engine }
//   POST /api/search   { moves: ["h2e2", ...], movetime?, depth?, multipv? }
//                      -> { bestmove, lines: [{ multipv, depth, score: { unit, value }, pv }] }
//   POST /api/newgame  -> clears Pikafish's hash between games
//
// Env: PORT (8787), HOST (127.0.0.1), PIKAFISH_PATH, PIKAFISH_THREADS (1), PIKAFISH_HASH (128 MB)

import http from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '127.0.0.1';
const BIN = process.env.PIKAFISH_PATH || path.join(ROOT, 'engine', process.platform === 'win32' ? 'pikafish.exe' : 'pikafish');
const THREADS = Number(process.env.PIKAFISH_THREADS) || 1;
const HASH = Number(process.env.PIKAFISH_HASH) || 128;
const DIST = path.resolve(ROOT, '..', 'dist');

const MOVE_RE = /^[a-i][0-9][a-i][0-9]$/;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function parseInfo(line) {
  const t = line.split(/\s+/);
  if (t.includes('lowerbound') || t.includes('upperbound')) return null;
  const at = k => t.indexOf(k);
  const si = at('score'), pi = at('pv');
  if (si < 0 || pi < 0) return null;
  return {
    multipv: at('multipv') >= 0 ? Number(t[at('multipv') + 1]) : 1,
    depth: at('depth') >= 0 ? Number(t[at('depth') + 1]) : 0,
    score: { unit: t[si + 1] === 'mate' ? 'mate' : 'cp', value: Number(t[si + 2]) },
    pv: t.slice(pi + 1).filter(m => MOVE_RE.test(m)),
  };
}

class UciEngine {
  constructor(bin) {
    this.bin = bin;
    this.name = 'Pikafish';
    this.queue = [];
    this.current = null;
    this.waiters = [];
    this.dead = false;
    this.pendingNewGame = false;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.proc = spawn(this.bin, [], { cwd: path.dirname(this.bin), stdio: ['pipe', 'pipe', 'inherit'] });
      this.proc.on('error', reject);
      this.proc.on('exit', code => {
        this.dead = true;
        console.error(`Pikafish đã dừng (mã ${code}).`);
        const err = new Error('engine exited');
        this.current?.reject(err);
        for (const j of this.queue) j.reject(err);
        this.current = null;
        this.queue = [];
      });
      readline.createInterface({ input: this.proc.stdout }).on('line', l => this.onLine(l.trim()));
      this.send('uci');
      this.waitFor(l => l === 'uciok')
        .then(() => {
          this.send(`setoption name Threads value ${THREADS}`);
          this.send(`setoption name Hash value ${HASH}`);
          this.send('isready');
          return this.waitFor(l => l === 'readyok');
        })
        .then(() => resolve(), reject);
    });
  }

  send(cmd) { this.proc.stdin.write(cmd + '\n'); }

  waitFor(pred) { return new Promise(res => this.waiters.push({ pred, res })); }

  onLine(line) {
    if (line.startsWith('id name ')) this.name = line.slice(8);
    this.waiters = this.waiters.filter(w => (w.pred(line) ? (w.res(line), false) : true));
    const job = this.current;
    if (!job) return;
    if (line.startsWith('info ')) {
      const info = parseInfo(line);
      if (info && info.pv.length) job.lines.set(info.multipv, info);
    } else if (line.startsWith('bestmove')) {
      const mv = line.split(/\s+/)[1];
      this.current = null;
      job.resolve({
        bestmove: mv && MOVE_RE.test(mv) ? mv : null,
        lines: [...job.lines.values()].sort((a, b) => a.multipv - b.multipv),
      });
      this.next();
    }
  }

  search(params) {
    if (this.dead) return { promise: Promise.reject(new Error('engine not running')), cancel() {} };
    let job;
    const promise = new Promise((resolve, reject) => {
      job = { params, resolve, reject, lines: new Map(), cancelled: false };
    });
    this.queue.push(job);
    this.next();
    return {
      promise,
      cancel: () => {
        if (this.current === job) { job.cancelled = true; this.send('stop'); }
        else {
          const i = this.queue.indexOf(job);
          if (i >= 0) { this.queue.splice(i, 1); job.reject(new Error('cancelled')); }
        }
      },
    };
  }

  newGame() {
    this.pendingNewGame = true;
    this.next();
  }

  next() {
    if (this.current || this.dead) return;
    if (this.pendingNewGame) { this.pendingNewGame = false; this.send('ucinewgame'); }
    const job = this.queue.shift();
    if (!job) return;
    this.current = job;
    const p = job.params;
    this.send(`setoption name MultiPV value ${p.multipv}`);
    this.send(`position startpos${p.moves.length ? ' moves ' + p.moves.join(' ') : ''}`);
    this.send(p.depth ? `go depth ${p.depth}` : `go movetime ${p.movetime}`);
  }
}

let engine = null;
let engineError = null;
if (!existsSync(BIN)) {
  engineError = `Không tìm thấy Pikafish tại ${BIN}. Chạy "npm run setup:engine" để tải về.`;
} else {
  engine = new UciEngine(BIN);
  try { await engine.start(); }
  catch (e) { engineError = `Không khởi động được Pikafish: ${e.message}`; engine = null; }
}
if (engineError) console.warn(engineError + '\nServer vẫn chạy; giao diện sẽ dùng engine tích hợp.');
else console.log(`Đã khởi động ${engine.name} (Threads=${THREADS}, Hash=${HASH}MB)`);

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function validateSearch(b) {
  if (!b || !Array.isArray(b.moves) || b.moves.length > 1000 || !b.moves.every(m => typeof m === 'string' && MOVE_RE.test(m))) {
    return { error: 'moves phải là mảng nước đi dạng UCI, ví dụ "h2e2"' };
  }
  const depth = Number.isFinite(b.depth) ? clamp(Math.round(b.depth), 1, 40) : undefined;
  const movetime = depth ? undefined : clamp(Math.round(Number(b.movetime) || 1000), 20, 15000);
  const multipv = clamp(Math.round(Number(b.multipv) || 1), 1, 10);
  return { params: { moves: b.moves, depth, movetime, multipv } };
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json',
};

function serveStatic(req, res) {
  if (!existsSync(DIST)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Chưa build giao diện. Chạy "npm run build", hoặc dùng "npm run dev" khi phát triển.');
    return;
  }
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.resolve(DIST, '.' + urlPath);
  if (!file.startsWith(DIST + path.sep) && file !== DIST) { res.writeHead(403).end(); return; }
  if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  try {
    if (pathname === '/api/health' && req.method === 'GET') {
      return json(res, 200, engine && !engine.dead ? { ok: true, engine: engine.name } : { ok: false, error: engineError || 'Pikafish đã dừng' });
    }
    if (pathname === '/api/newgame' && req.method === 'POST') {
      engine?.newGame();
      return json(res, 200, { ok: true });
    }
    if (pathname === '/api/search' && req.method === 'POST') {
      if (!engine || engine.dead) return json(res, 503, { error: engineError || 'Pikafish đã dừng' });
      let body;
      try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'JSON không hợp lệ' }); }
      const v = validateSearch(body);
      if (v.error) return json(res, 400, { error: v.error });
      const job = engine.search(v.params);
      // If the browser aborts (undo, new game), stop the search instead of letting it run on.
      res.on('close', () => { if (!res.writableEnded) job.cancel(); });
      try {
        const result = await job.promise;
        if (!res.writableEnded && !res.destroyed) json(res, 200, result);
      } catch (e) {
        if (!res.writableEnded && !res.destroyed) json(res, 500, { error: e.message });
      }
      return;
    }
    if (pathname.startsWith('/api/')) return json(res, 404, { error: 'Không có API này' });
    serveStatic(req, res);
  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: e.message });
  }
});

server.listen(PORT, HOST, () => console.log(`Server: http://${HOST}:${PORT}`));
