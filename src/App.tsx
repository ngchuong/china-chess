import type { Side } from './engine/engine';
import { Board } from './components/Board';
import { AnalyzingPanel, OverPanel } from './components/OverPanel';
import { PlayerBar } from './components/PlayerBar';
import { PlayPanel } from './components/PlayPanel';
import { ReviewPanel } from './components/ReviewPanel';
import { SetupPanel } from './components/SetupPanel';
import { useGame } from './game/useGame';

const PANELS = {
  setup: SetupPanel,
  play: PlayPanel,
  over: OverPanel,
  analyzing: AnalyzingPanel,
  review: ReviewPanel,
} as const;

export default function App() {
  const g = useGame();
  const Panel = PANELS[g.phase];

  return (
    <div className="app">
      <header>
        <div className="seal" aria-hidden="true">帥</div>
        <div>
          <h1>Cờ Tướng Đấu Máy</h1>
          <p>Chọn độ khó, thời gian, bên cầm quân. Hết ván, máy chấm điểm từng nước và chỉ ra nước tốt hơn.</p>
        </div>
      </header>
      <div className="main">
        <div className="board-col">
          <PlayerBar side={-g.player as Side} />
          <div className="board-wrap">
            <Board />
            {g.phase === 'over' && g.result && (
              <div className="overlay">
                <div className="ov-card"><b>{g.resultTitle}</b><span>{g.result.reason}</span></div>
              </div>
            )}
          </div>
          <PlayerBar side={g.player} />
        </div>
        <aside className="panel" aria-live="polite">
          {g.notice && (
            <div className="notice" role="status">
              {g.notice}
              <button type="button" className="linkbtn" onClick={() => g.dismissNotice()}>Đóng</button>
            </div>
          )}
          <Panel />
        </aside>
      </div>
    </div>
  );
}
