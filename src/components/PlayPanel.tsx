import { fmtFor } from '../game/review';
import { useGame } from '../game/useGame';
import { MoveList } from './MoveList';

export function PlayPanel() {
  const g = useGame();
  const myTurn = g.G.side === g.player, inCheck = g.G.inCheck();

  let status;
  if (g.thinking) status = <div className="status"><span className="spin" />Máy đang tính nước…</div>;
  else if (myTurn && inCheck) status = <div className="status warn">Bạn đang bị chiếu! Hãy che hoặc tránh Tướng.</div>;
  else status = <div className="status">{myTurn ? 'Đến lượt bạn. Chạm vào quân để xem nước đi.' : 'Lượt của máy.'}</div>;

  return (
    <>
      <h2>Ván đấu · {g.level.name} · {g.tc.label}</h2>
      <p className="note">Engine: {g.engineLabel}</p>
      {status}
      {g.hintBusy && <div className="hintbox"><span className="spin inline" />Đang tìm gợi ý…</div>}
      {!g.hintBusy && g.hint && (
        <div className="hintbox">
          Gợi ý: <b>{g.hint.n}</b> (mũi tên xanh trên bàn cờ). Đánh giá: {fmtFor(g.hint.score)}
        </div>
      )}
      <MoveList />
      <div className="row">
        <button type="button" className="btn" onClick={() => g.requestHint()} disabled={!myTurn || g.thinking || g.hintBusy}>Gợi ý</button>
        <button type="button" className="btn" onClick={() => g.undo()} disabled={!g.canUndo}>Đi lại</button>
      </div>
      <div className="row">
        <button type="button" className={`btn danger ${g.confirmResign ? 'armed' : ''}`} onClick={() => g.resign()}>
          {g.confirmResign ? 'Bấm lần nữa để đầu hàng' : 'Đầu hàng'}
        </button>
        {g.confirmResign && <button type="button" className="btn" onClick={() => g.cancelResign()}>Chơi tiếp</button>}
      </div>
      <p className="note">Đã dùng {g.hints} gợi ý, {g.undos} lần đi lại.</p>
    </>
  );
}
