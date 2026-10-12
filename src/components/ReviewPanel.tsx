import { useEffect } from 'react';
import type { Side } from '../engine/engine';
import { CAT_ORDER, CATS } from '../game/constants';
import { fmtFor } from '../game/review';
import { useGame } from '../game/useGame';
import { EvalGraph } from './EvalGraph';
import { MoveList } from './MoveList';

function AccuracyCard({ side }: { side: Side }) {
  const g = useGame();
  const me = side === g.player;
  return (
    <div className="acc-card">
      <div className="who-sub">
        <span className={`side-dot sm ${side > 0 ? 'r' : 'b'}`}>{side > 0 ? '帥' : '將'}</span>
        {me ? 'Bạn' : 'Máy'} · {side > 0 ? 'Đỏ' : 'Đen'}
      </div>
      <div className="big">{g.review!.acc[side]}</div>
      <div className="who-sub">Độ chính xác (/100)</div>
    </div>
  );
}

function MoveDetail() {
  const g = useGame();
  const R = g.review!;
  const it = g.ri > 0 ? R.items[g.ri - 1] : null;

  if (!it) {
    return (
      <div className="detail">
        <div className="d-head"><span className="d-move">Thế cờ ban đầu</span></div>
        {R.first && (
          <>
            <div>Nước mở đầu máy đề xuất: <span className="mono best-ink">{R.first.n}</span></div>
            <div className="note mono">{R.first.line}</div>
          </>
        )}
        <p className="note">Chọn một nước trong danh sách, trên biểu đồ, hoặc dùng phím <span className="kbd">←</span> <span className="kbd">→</span>.</p>
      </div>
    );
  }

  const sideTxt = it.side > 0 ? 'Đỏ' : 'Đen', who = it.side === g.player ? 'Bạn' : 'Máy';
  const cat = CATS[it.cat];
  return (
    <div className="detail">
      <div className="d-head">
        <span className="d-move">{Math.floor(it.i / 2) + 1}{it.side > 0 ? '.' : '…'} {it.n}</span>
        <span className="d-cat" style={{ background: cat.color }}>{cat.sym} {cat.name}</span>
        <span className="d-score">{it.score}<small>/100</small></span>
      </div>
      <div className="who-sub">{who} ({sideTxt}) đi</div>
      <div>
        <div className="label">Vì sao</div>
        <ul className="d-why">{it.why.map((w, k) => <li key={k}>{w}</li>)}</ul>
      </div>
      <div className="d-best">
        {it.best && it.best !== it.move ? (
          <>
            <div>Nước tốt nhất: <span className="mono best-ink">{it.bestN}</span> (mũi tên xanh) · đánh giá {fmtFor(it.before)}</div>
            {it.bestLine && <div className="line">Diễn biến: {it.bestLine}</div>}
          </>
        ) : (
          <>
            <div>{who} đã đi đúng nước máy chọn.</div>
            {it.bestLine && <div className="line">Diễn biến tiếp: {it.bestLine}</div>}
          </>
        )}
      </div>
      <div className="d-evals">
        <span>Trước nước đi (tốt nhất): <b>{fmtFor(it.before)}</b></span>
        <span>Sau nước đi: <b>{fmtFor(it.after)}</b></span>
        <span>tính cho bên {sideTxt}</span>
      </div>
    </div>
  );
}

export function ReviewPanel() {
  const g = useGame();
  const R = g.review!;
  const N = g.moves.length, i = g.ri;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, number> = { ArrowLeft: g.ri - 1, ArrowRight: g.ri + 1, Home: 0, End: g.moves.length };
      if (!(e.key in map)) return;
      e.preventDefault();
      g.goTo(map[e.key]);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [g]);

  const cats = CAT_ORDER.filter(k => (R.counts[1][k] ?? 0) + (R.counts[-1][k] ?? 0) > 0);

  return (
    <>
      <div className="result">
        <b>{g.resultTitle}</b>
        <span>{g.result?.reason} · {Math.ceil(N / 2)} nước · phân tích bằng {g.engineLabel}</span>
      </div>
      <div className="acc"><AccuracyCard side={g.player} /><AccuracyCard side={-g.player as Side} /></div>
      <table className="counts">
        <thead><tr><th>Loại nước</th><th>Đỏ{g.player > 0 ? ' (bạn)' : ''}</th><th>Đen{g.player < 0 ? ' (bạn)' : ''}</th></tr></thead>
        <tbody>
          {cats.map(k => (
            <tr key={k}>
              <td><span className="badge lead" style={{ background: CATS[k].color }}>{CATS[k].sym}</span>{CATS[k].name}</td>
              <td className="n">{R.counts[1][k] ?? 0}</td>
              <td className="n">{R.counts[-1][k] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <EvalGraph />
      <MoveDetail />
      <div className="nav">
        <button type="button" className="btn" aria-label="Về đầu ván" disabled={i === 0} onClick={() => g.goTo(0)}>⏮</button>
        <button type="button" className="btn" aria-label="Nước trước" disabled={i === 0} onClick={() => g.goTo(i - 1)}>◀</button>
        <button type="button" className="btn" aria-label="Nước sau" disabled={i >= N} onClick={() => g.goTo(i + 1)}>▶</button>
        <button type="button" className="btn" aria-label="Cuối ván" disabled={i >= N} onClick={() => g.goTo(N)}>⏭</button>
      </div>
      <div className="row"><button type="button" className="btn" onClick={() => g.nextMistake()}>Lỗi tiếp theo của bạn</button></div>
      <MoveList clickable />
      <div className="legend">
        {CAT_ORDER.slice(0, 6).map(k => <span key={k}><i style={{ background: CATS[k].color }} />{CATS[k].sym} {CATS[k].name}</span>)}
      </div>
      <button type="button" className="btn primary" onClick={() => g.newGame()}>Ván mới</button>
    </>
  );
}
