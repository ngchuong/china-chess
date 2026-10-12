import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { moveFrom, moveTo } from '../engine/engine';
import { GLYPH, VGLYPH } from '../game/constants';
import { useGame } from '../game/useGame';

const CELL = 60, PAD = 44, W = 568, H = 628;

/** Board lines, palace, position marks, river and file numbers. Independent of orientation. */
function StaticBoard() {
  const X = (c: number) => PAD + c * CELL, Y = (r: number) => PAD + r * CELL;
  const { grid, marks } = useMemo(() => {
    let d = '';
    for (let r = 0; r < 10; r++) d += `M${X(0)} ${Y(r)}H${X(8)}`;
    for (let c = 0; c < 9; c++)
      d += c === 0 || c === 8 ? `M${X(c)} ${Y(0)}V${Y(9)}` : `M${X(c)} ${Y(0)}V${Y(4)}M${X(c)} ${Y(5)}V${Y(9)}`;
    d += `M${X(3)} ${Y(0)}L${X(5)} ${Y(2)}M${X(5)} ${Y(0)}L${X(3)} ${Y(2)}`;
    d += `M${X(3)} ${Y(7)}L${X(5)} ${Y(9)}M${X(5)} ${Y(7)}L${X(3)} ${Y(9)}`;
    const spots = [[2, 1], [2, 7], [7, 1], [7, 7], [3, 0], [3, 2], [3, 4], [3, 6], [3, 8], [6, 0], [6, 2], [6, 4], [6, 6], [6, 8]];
    let m = '';
    for (const [r, c] of spots) {
      const x = X(c), y = Y(r);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        if (c + sx < 0 || c + sx > 8) continue;
        m += `M${x + sx * 5} ${y + sy * 15}V${y + sy * 5}H${x + sx * 15}`;
      }
    }
    return { grid: d, marks: m };
  }, []);
  const ry = (Y(4) + Y(5)) / 2;
  return (
    <g>
      <rect x={4} y={4} width={W - 8} height={H - 8} rx={12} className="wood" />
      <rect x={PAD - 9} y={PAD - 9} width={8 * CELL + 18} height={9 * CELL + 18} className="frame" />
      <path className="grid" d={grid} />
      <path className="mk" d={marks} />
      <text className="river" x={X(2)} y={ry} textAnchor="middle" dominantBaseline="central">楚河</text>
      <text className="river" x={X(6)} y={ry} textAnchor="middle" dominantBaseline="central">漢界</text>
      {Array.from({ length: 9 }, (_, dc) => (
        <g key={dc}>
          <text className="flabel" x={X(dc)} y={11} textAnchor="middle" dominantBaseline="central">{dc + 1}</text>
          <text className="flabel" x={X(dc)} y={H - 10} textAnchor="middle" dominantBaseline="central">{9 - dc}</text>
        </g>
      ))}
    </g>
  );
}

export function Board() {
  const g = useGame();
  const v = g.boardView();
  const flipped = g.player === -1;
  const vn = g.settings.glyph === 'vn';
  const svgRef = useRef<SVGSVGElement>(null);

  const xy = (sq: number): [number, number] => {
    const r = Math.floor(sq / 9), c = sq % 9;
    const dr = flipped ? 9 - r : r, dc = flipped ? 8 - c : c;
    return [PAD + dc * CELL, PAD + dr * CELL];
  };

  // The moved piece first renders on its origin square, then slides to its target.
  const [settled, setSettled] = useState(0);
  const animId = v.anim?.id ?? 0;
  useEffect(() => {
    if (!animId) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setSettled(animId)); });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [animId]);
  const animating = v.anim && settled !== v.anim.id ? v.anim : null;

  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const dc = Math.round((p.x - PAD) / CELL), dr = Math.round((p.y - PAD) / CELL);
    if (dc < 0 || dc > 8 || dr < 0 || dr > 9) return;
    if (Math.hypot(p.x - (PAD + dc * CELL), p.y - (PAD + dr * CELL)) > CELL * 0.48) return;
    const r = flipped ? 9 - dr : dr, c = flipped ? 8 - dc : dc;
    g.clickSquare(r * 9 + c);
  };

  const pieces = [];
  for (let sq = 0; sq < 90; sq++) {
    const p = v.board[sq];
    if (!p) continue;
    const s = p > 0 ? 1 : -1, t = Math.abs(p);
    const [x, y] = xy(animating && animating.to === sq ? animating.from : sq);
    const cls = ['pc', s > 0 ? 'r' : 'b', sq === v.sel ? 'sel' : '', sq === v.check ? 'chk' : ''].join(' ');
    pieces.push(
      // A fresh key for the moved piece makes it mount on its origin square and slide from there.
      <g key={v.anim && v.anim.to === sq ? `a${v.anim.id}` : sq} className={cls} style={{ transform: `translate(${x}px, ${y}px)` }}>
        <circle className="pc-shadow" r={27} cy={2.5} />
        <circle className="pc-face" r={26} />
        <circle className="pc-ring" r={21.5} />
        <text className={vn ? 'pc-glyph vn' : 'pc-glyph'}>{vn ? VGLYPH[t] : GLYPH[s > 0 ? '1' : '-1'][t]}</text>
      </g>,
    );
  }

  const arrow = (m: number, kind: 'best' | 'hint', key: number) => {
    const [x1, y1] = xy(moveFrom(m)), [x2, y2] = xy(moveTo(m));
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
    return (
      <line key={key} className="arrow" x1={x1 + (dx / L) * 8} y1={y1 + (dy / L) * 8} x2={x2 - (dx / L) * 16} y2={y2 - (dy / L) * 16}
        style={{ stroke: kind === 'best' ? 'var(--c-best)' : 'var(--hint)' }} markerEnd={`url(#ah-${kind})`} />
    );
  };

  return (
    <svg ref={svgRef} id="board" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bàn cờ tướng" onClick={onClick}>
      <defs>
        {(['best', 'hint'] as const).map(k => (
          <marker key={k} id={`ah-${k}`} viewBox="0 0 10 10" refX={5} refY={5} markerWidth={3.2} markerHeight={3.2} orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" style={{ fill: k === 'best' ? 'var(--c-best)' : 'var(--hint)' }} />
          </marker>
        ))}
      </defs>
      <StaticBoard />
      <g>
        {v.last !== 0 && [moveFrom(v.last), moveTo(v.last)].map(sq => {
          const [x, y] = xy(sq);
          return <circle key={sq} className="lm" cx={x} cy={y} r={29} />;
        })}
        {v.last !== 0 && v.lastColor && (() => {
          const [x, y] = xy(moveTo(v.last));
          return <circle className="lm-ring" cx={x} cy={y} r={31} style={{ stroke: v.lastColor }} />;
        })()}
      </g>
      <g>{pieces}</g>
      <g>
        {v.targets.map(m => {
          const t = moveTo(m), [x, y] = xy(t);
          return v.board[t]
            ? <circle key={t} className="capring" cx={x} cy={y} r={29} />
            : <circle key={t} className="dot" cx={x} cy={y} r={8} />;
        })}
      </g>
      <g>{v.arrows.map((a, i) => arrow(a.move, a.kind, i))}</g>
    </svg>
  );
}
