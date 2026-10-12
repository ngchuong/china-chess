// Downloads the latest official Pikafish release and installs the binary for this
// platform plus the NNUE network into server/engine/.
//
//   npm run setup:engine            -> latest release
//   PIKAFISH_TAG=Pikafish-2026-09-06 npm run setup:engine

import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sevenZip from '7zip-bin';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'server', 'engine');
const REPO = 'official-pikafish/Pikafish';

const BINARIES = {
  'linux-x64': 'Pikafish-Linux-x86-64-universal',
  'darwin-x64': 'Pikafish-MacOS-universal',
  'darwin-arm64': 'Pikafish-MacOS-universal',
  'win32-x64': 'Pikafish-Windows-x86-64-universal.exe',
};

const platformKey = `${process.platform}-${process.arch}`;
const binName = BINARIES[platformKey];
if (!binName) {
  console.error(`Chưa có bản Pikafish dựng sẵn cho ${platformKey}. Hãy tự build từ mã nguồn rồi đặt PIKAFISH_PATH.`);
  process.exit(1);
}

const tag = process.env.PIKAFISH_TAG;
const api = `https://api.github.com/repos/${REPO}/releases/${tag ? `tags/${tag}` : 'latest'}`;
console.log(`Đang lấy thông tin bản phát hành: ${api}`);
const rel = await (await fetch(api, { headers: { accept: 'application/vnd.github+json' } })).json();
const asset = rel.assets?.find(a => a.name.endsWith('.7z'));
if (!asset) {
  console.error('Không tìm thấy file .7z trong bản phát hành.', rel.message ?? '');
  process.exit(1);
}

const tmp = mkdtempSync(path.join(os.tmpdir(), 'pikafish-'));
try {
  const archive = path.join(tmp, asset.name);
  console.log(`Đang tải ${asset.name} (${(asset.size / 1e6).toFixed(1)} MB)…`);
  const res = await fetch(asset.browser_download_url);
  if (!res.ok) throw new Error(`Tải thất bại: HTTP ${res.status}`);
  writeFileSync(archive, Buffer.from(await res.arrayBuffer()));

  const extractDir = path.join(tmp, 'x');
  if (process.platform !== 'win32') chmodSync(sevenZip.path7za, 0o755);
  execFileSync(sevenZip.path7za, ['x', '-y', `-o${extractDir}`, archive], { stdio: 'ignore' });

  const find = name => {
    const stack = [extractDir];
    while (stack.length) {
      const dir = stack.pop();
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (e.name === name) return p;
      }
    }
    return null;
  };

  const bin = find(binName), nnue = find('pikafish.nnue');
  if (!bin || !nnue) throw new Error(`Thiếu ${!bin ? binName : 'pikafish.nnue'} trong gói tải về.`);

  mkdirSync(OUT, { recursive: true });
  const target = path.join(OUT, process.platform === 'win32' ? 'pikafish.exe' : 'pikafish');
  copyFileSync(bin, target);
  if (process.platform !== 'win32') chmodSync(target, 0o755);
  copyFileSync(nnue, path.join(OUT, 'pikafish.nnue'));
  for (const doc of ['Copying.txt', 'NNUE-License.md']) {
    const p = find(doc);
    if (p) copyFileSync(p, path.join(OUT, doc));
  }
  console.log(`Đã cài ${rel.tag_name} vào ${path.relative(ROOT, OUT)}/`);
  console.log('Lưu ý: file mạng NNUE có giấy phép riêng (xem NNUE-License.md), không dùng thương mại khi chưa được phép.');
} finally {
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
}
