import { useEffect, useState } from 'react';
import type { Side } from '../engine/engine';
import { GLYPH, VGLYPH } from '../game/constants';
import { useGame } from '../game/useGame';

function fmtClock(ms: number, timed: boolean) {
  if (!timed) return '∞';
  ms = Math.max(0, ms);
  const s = ms / 1000;
  if (s < 10) return '0:0' + s.toFixed(1);
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

/** Re-render every 100 ms while `active`, so a running clock counts down. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(id);
  }, [active]);
  return active ? now : performance.now();
}

export function PlayerBar({ side }: { side: Side }) {
  const g = useGame();
  const me = side === g.player, red = side > 0;
  const running = g.phase === 'play' && g.G.side === side && g.tc.min > 0;
  const now = useNow(running);
  const vn = g.settings.glyph === 'vn';

  let sub = (red ? 'Quân Đỏ' : 'Quân Đen') + (me ? '' : ` · ${g.level.name}`);
  if (g.phase === 'review' && g.review) sub = `${red ? 'Quân Đỏ' : 'Quân Đen'} · chính xác ${g.review.acc[side]}%`;
  const caps = g.notes.filter(n => n.side === side && n.cap);
  const showClock = g.phase !== 'setup';
  const rem = g.remaining(side, now);
  const on = g.phase === 'play' && g.G.side === side;

  return (
    <div className="pbar">
      <div className="who">
        <div className={`side-dot ${red ? 'r' : 'b'}`}>{red ? '帥' : '將'}</div>
        <div style={{ minWidth: 0 }}>
          <div className="who-name">{me ? 'Bạn' : `Máy · ${g.engineLabel}`}</div>
          <div className="who-sub">{sub}</div>
        </div>
        <div className="caps">
          {caps.map((n, i) => (
            <span key={i} className={n.cap > 0 ? 'r' : 'b'}>
              {vn ? <small className="cap-vn">{VGLYPH[Math.abs(n.cap)]}</small> : GLYPH[n.cap > 0 ? '1' : '-1'][Math.abs(n.cap)]}
            </span>
          ))}
        </div>
      </div>
      {showClock && (
        <div className={`clock ${on ? 'on' : ''} ${g.tc.min && rem < 20000 ? 'low' : ''}`}>{fmtClock(rem, g.tc.min > 0)}</div>
      )}
    </div>
  );
}
