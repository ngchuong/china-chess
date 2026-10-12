export const GLYPH: Record<'1' | '-1', string[]> = {
  '1': ['', '帥', '仕', '相', '傌', '俥', '炮', '兵'],
  '-1': ['', '將', '士', '象', '馬', '車', '砲', '卒'],
};
export const VGLYPH = ['', 'Tg', 'S', 'T', 'M', 'X', 'P', 'B'];
export const NAME = ['', 'Tướng', 'Sĩ', 'Tượng', 'Mã', 'Xe', 'Pháo', 'Tốt'];
/** Rough piece values in pawns, used only to judge exchanges in explanations. */
export const PVAL = [0, 100, 2, 2, 4, 9, 4.5, 1];

export interface Level {
  name: string;
  desc: string;
  builtin: { depth: number; time: number; noise: number };
  /**
   * Pikafish has no strength limit option, so weaker levels search shallowly with
   * MultiPV and pick at random among lines within `window` centipawns of the best.
   */
  pikafish: { depth?: number; movetime?: number; multipv: number; window: number };
}

export const LEVELS: Level[] = [
  { name: 'Nhập môn', desc: 'Đi ngẫu hứng, thường để hở quân',
    builtin: { depth: 1, time: 300, noise: 220 }, pikafish: { depth: 1, multipv: 8, window: 300 } },
  { name: 'Dễ', desc: 'Hay sơ hở khi bị tấn công',
    builtin: { depth: 2, time: 400, noise: 90 }, pikafish: { depth: 3, multipv: 5, window: 150 } },
  { name: 'Trung bình', desc: 'Chơi chắc, đôi khi thiếu chính xác',
    builtin: { depth: 4, time: 900, noise: 20 }, pikafish: { depth: 6, multipv: 3, window: 50 } },
  { name: 'Khó', desc: 'Tính sâu khoảng 1–2 giây mỗi nước',
    builtin: { depth: 14, time: 2000, noise: 0 }, pikafish: { movetime: 1000, multipv: 1, window: 0 } },
  { name: 'Đại kiện tướng', desc: 'Toàn lực, tới 4–5 giây mỗi nước',
    builtin: { depth: 40, time: 5000, noise: 0 }, pikafish: { movetime: 4000, multipv: 1, window: 0 } },
];

export interface TimeControl { id: string; label: string; sub: string; min: number; inc: number }
export const TIMES: TimeControl[] = [
  { id: '0', label: 'Không giới hạn', sub: 'Thong thả', min: 0, inc: 0 },
  { id: '3+2', label: '3 phút', sub: '+2 giây/nước', min: 3, inc: 2 },
  { id: '5+0', label: '5 phút', sub: 'Cờ chớp', min: 5, inc: 0 },
  { id: '10+0', label: '10 phút', sub: 'Cờ nhanh', min: 10, inc: 0 },
  { id: '15+10', label: '15 phút', sub: '+10 giây/nước', min: 15, inc: 10 },
  { id: '30+0', label: '30 phút', sub: 'Cờ tiêu chuẩn', min: 30, inc: 0 },
];

export type CatKey = 'best' | 'great' | 'good' | 'inacc' | 'mistake' | 'blunder' | 'forced';
export const CATS: Record<CatKey, { name: string; sym: string; color: string }> = {
  best: { name: 'Tốt nhất', sym: '★', color: 'var(--c-best)' },
  great: { name: 'Rất tốt', sym: '!', color: 'var(--c-great)' },
  good: { name: 'Tốt', sym: '✓', color: 'var(--c-good)' },
  inacc: { name: 'Thiếu chính xác', sym: '?!', color: 'var(--c-inacc)' },
  mistake: { name: 'Sai lầm', sym: '?', color: 'var(--c-mistake)' },
  blunder: { name: 'Sai lầm nghiêm trọng', sym: '??', color: 'var(--c-blunder)' },
  forced: { name: 'Nước bắt buộc', sym: '□', color: 'var(--c-forced)' },
};
export const CAT_ORDER: CatKey[] = ['best', 'great', 'good', 'inacc', 'mistake', 'blunder', 'forced'];

/** Analysis time per position, in ms. */
export const ANALYSIS_MS = { fast: 350, deep: 1100 } as const;
export const HINT_MS = 1200;
