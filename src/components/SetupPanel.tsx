import { LEVELS, TIMES } from '../game/constants';
import { useGame } from '../game/useGame';
import { Option } from './Option';

function EngineStatus() {
  const g = useGame();
  const st = g.pikafishStatus;
  if (st.state === 'checking') return <small>Đang kiểm tra server…</small>;
  if (st.state === 'ok') return <small>Đã kết nối · {st.name}</small>;
  return <small>Chưa kết nối: chạy <code>npm run server</code></small>;
}

export function SetupPanel() {
  const g = useGame();
  const s = g.settings;
  const pfOff = g.pikafishStatus.state !== 'ok';

  return (
    <>
      <h2>Ván mới</h2>

      <div className="field">
        <div className="label">Cầm quân</div>
        <div className="seg seg-3">
          <Option pressed={s.side === 'red'} onClick={() => g.updateSetting('side', 'red')}>
            <b><span className="han">帥</span> Đỏ</b><small>Đi trước</small>
          </Option>
          <Option pressed={s.side === 'black'} onClick={() => g.updateSetting('side', 'black')}>
            <b><span className="han ink">將</span> Đen</b><small>Đi sau</small>
          </Option>
          <Option pressed={s.side === 'random'} onClick={() => g.updateSetting('side', 'random')}>
            <b>Ngẫu nhiên</b><small>Bốc thăm</small>
          </Option>
        </div>
      </div>

      <div className="field">
        <div className="label">Độ khó</div>
        <div className="levels">
          {LEVELS.map((L, i) => (
            <Option key={L.name} pressed={s.level === i} onClick={() => g.updateSetting('level', i)}>
              <span className="pips">{[0, 1, 2, 3, 4].map(k => <i key={k} className={k <= i ? 'on' : ''} />)}</span>
              <span className="txt"><b>{L.name}</b><small>{L.desc}</small></span>
            </Option>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="label">Thời gian mỗi bên</div>
        <div className="seg seg-wrap">
          {TIMES.map(t => (
            <Option key={t.id} pressed={s.time === t.id} onClick={() => g.updateSetting('time', t.id)}>
              <b>{t.label}</b><small>{t.sub}</small>
            </Option>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="label">Engine của máy</div>
        <div className="seg seg-2">
          <Option pressed={s.engine === 'pikafish'} onClick={() => g.updateSetting('engine', 'pikafish')}>
            <b>Pikafish</b><EngineStatus />
          </Option>
          <Option pressed={s.engine === 'builtin'} onClick={() => g.updateSetting('engine', 'builtin')}>
            <b>Tích hợp</b><small>Chạy ngay trong trình duyệt</small>
          </Option>
        </div>
        {s.engine === 'pikafish' && pfOff && g.pikafishStatus.state !== 'checking' && (
          <p className="note">
            Không thấy server Pikafish nên ván sẽ dùng engine tích hợp.{' '}
            <button type="button" className="linkbtn" onClick={() => void g.detectPikafish()}>Kiểm tra lại</button>
          </p>
        )}
      </div>

      <div className="field">
        <div className="label">Mặt quân</div>
        <div className="seg seg-2">
          <Option pressed={s.glyph === 'han'} onClick={() => g.updateSetting('glyph', 'han')}>
            <b><span className="han">俥 炮</span> Chữ Hán</b><small>Kiểu truyền thống</small>
          </Option>
          <Option pressed={s.glyph === 'vn'} onClick={() => g.updateSetting('glyph', 'vn')}>
            <b>X · P · M</b><small>Chữ cái tiếng Việt</small>
          </Option>
        </div>
      </div>

      <button type="button" className="btn primary big" onClick={() => g.startGame()}>Bắt đầu ván</button>
      <p className="note">
        Hết ván, máy phân tích lại từng nước: chấm điểm, phân loại (tốt nhất, sai lầm…), giải thích lý do và chỉ ra nước
        nên đi. Ký hiệu: <b>.</b> tiến, <b>/</b> thoái, <b>-</b> bình.
      </p>
    </>
  );
}
