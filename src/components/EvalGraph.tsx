import { useState, type MouseEvent } from 'react';
import { CATS } from '../game/constants';
import { fmtRed, winProb } from '../game/review';
import { useGame } from '../game/useGame';

const GW = 340, GH = 110, MID = GH / 2;

/** Advantage over the game: above the midline Red is better, below Black is. Click to jump to a move. */
export function EvalGraph() {
  const g = useGame();
  const R = g.review!;
  const ev = R.evals, n = ev.length;
  const [hover, setHover] = useState<number | null>(null);

  const x = (i: number) => (n <= 1 ? GW / 2 : 4 + (i * (GW - 8)) / (n - 1));
  const y = (s: number) => GH - 4 - winProb(s) * (GH - 8);
  const pts = ev.map((s, i) => [x(i), y(s)] as const);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  const area = `M${x(0)} ${MID}` + pts.map(p => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('') + `L${x(n - 1)} ${MID}Z`;

  const idxAt = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * GW;
    return Math.max(0, Math.min(n - 1, Math.round(((fx - 4) / (GW - 8)) * (n - 1))));
  };

  const hovItem = hover !== null && hover > 0 ? R.items[hover - 1] : null;
  const tip = hover === null ? '' :
    (hovItem ? `${Math.floor(hovItem.i / 2) + 1}${hovItem.side > 0 ? '.' : '…'} ${hovItem.n} · ` : 'Bắt đầu · ') + fmtRed(ev[hover]);

  return (
    <div className="field">
      <div className="label">Diễn biến ưu thế</div>
      <div className="graph-wrap">
        <svg className="graph" viewBox={`0 0 ${GW} ${GH}`} role="img" aria-label="Biểu đồ ưu thế theo từng nước"
          onPointerMove={e => setHover(idxAt(e))} onPointerLeave={() => setHover(null)}
          onClick={e => g.goTo(idxAt(e))}>
          <defs>
            <clipPath id="gTop"><rect x={0} y={0} width={GW} height={MID} /></clipPath>
            <clipPath id="gBot"><rect x={0} y={MID} width={GW} height={MID} /></clipPath>
          </defs>
          <rect x={0} y={0} width={GW} height={GH} rx={8} className="g-bg" />
          <path d={area} className="g-red" clipPath="url(#gTop)" />
          <path d={area} className="g-blk" clipPath="url(#gBot)" />
          <line x1={0} x2={GW} y1={MID} y2={MID} className="g-mid" />
          <path d={line} className="g-line" />
          <line x1={x(g.ri)} x2={x(g.ri)} y1={2} y2={GH - 2} className="g-cur" />
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={2} y2={GH - 2} className="g-hov" />}
          {R.items.filter(it => it.cat === 'inacc' || it.cat === 'mistake' || it.cat === 'blunder').map(it => {
            const p = pts[it.i + 1];
            return <circle key={it.i} cx={p[0]} cy={p[1]} r={4} className="g-dot" style={{ fill: CATS[it.cat].color }} />;
          })}
        </svg>
        {hover !== null && <div className="g-tip" style={{ left: `${(x(hover) / GW) * 100}%` }}>{tip}</div>}
      </div>
      <div className="g-axis"><span>Phía trên: Đỏ ưu thế</span><span>Phía dưới: Đen ưu thế</span></div>
    </div>
  );
}
