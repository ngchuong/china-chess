import { ANALYSIS_MS } from '../game/constants';
import { useGame } from '../game/useGame';
import { MoveList } from './MoveList';
import { Option } from './Option';

export function OverPanel() {
  const g = useGame();
  const n = g.moves.length;
  const est = (ms: number) => Math.max(1, Math.round(((n + 1) * (ms + 40)) / 1000));

  return (
    <>
      <div className="result">
        <b>{g.resultTitle}</b>
        <span>{g.result?.reason} · {Math.ceil(n / 2)} nước · {g.hints} gợi ý · {g.undos} lần đi lại</span>
      </div>
      {n > 0 ? (
        <>
          <div className="field">
            <div className="label">Mức phân tích ({g.engineLabel})</div>
            <div className="seg seg-2">
              <Option pressed={g.settings.anMode === 'fast'} onClick={() => g.updateSetting('anMode', 'fast')}>
                <b>Nhanh</b><small>khoảng {est(ANALYSIS_MS.fast)} giây</small>
              </Option>
              <Option pressed={g.settings.anMode === 'deep'} onClick={() => g.updateSetting('anMode', 'deep')}>
                <b>Kỹ</b><small>khoảng {est(ANALYSIS_MS.deep)} giây</small>
              </Option>
            </div>
          </div>
          <button type="button" className="btn primary big" onClick={() => void g.startReview()}>Phân tích ván đấu</button>
        </>
      ) : (
        <p className="note">Ván kết thúc trước khi có nước đi nào nên không có gì để phân tích.</p>
      )}
      <button type="button" className="btn" onClick={() => g.newGame()}>Ván mới</button>
      <MoveList />
    </>
  );
}

export function AnalyzingPanel() {
  const g = useGame();
  const total = g.moves.length + 1;
  return (
    <>
      <h2>Đang phân tích ván đấu</h2>
      <div className="prog"><i style={{ width: `${(g.progress / total) * 100}%` }} /></div>
      <div className="note">Đã phân tích {g.progress}/{total} thế cờ · {g.engineLabel}</div>
      <p className="note">Máy tìm nước tốt nhất ở từng thế cờ, rồi so với nước đã đi để chấm điểm.</p>
      <button type="button" className="btn" onClick={() => g.cancelReview()}>Hủy</button>
    </>
  );
}
