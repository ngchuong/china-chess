import { useEffect, useRef } from 'react';
import { CATS } from '../game/constants';
import { useGame } from '../game/useGame';

export function MoveList({ clickable = false }: { clickable?: boolean }) {
  const g = useGame();
  const ref = useRef<HTMLDivElement>(null);
  const cur = g.phase === 'review' ? g.ri - 1 : g.notes.length - 1;

  // Keep the current move visible inside the list without scrolling the page.
  useEffect(() => {
    const box = ref.current, el = box?.querySelector<HTMLElement>('.cur');
    if (!box || !el) return;
    const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (r.top < b.top || r.bottom > b.bottom) box.scrollTop += r.top - b.top - b.height / 2;
  }, [cur, g.notes.length]);

  if (!g.notes.length) return <div className="ml"><div className="empty">Chưa có nước nào.</div></div>;

  const cell = (j: number) => {
    if (j >= g.notes.length) return <td className="mv" />;
    const n = g.notes[j], it = g.review?.items[j];
    const cls = ['mv', n.side > 0 ? 'red' : '', clickable ? 'click' : '', j === cur ? 'cur' : ''].join(' ');
    return (
      <td className={cls} tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? () => g.goTo(j + 1) : undefined}
        onKeyDown={clickable ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); g.goTo(j + 1); } } : undefined}>
        {n.n}{n.check ? '+' : ''}
        {it && <span className="badge" style={{ background: CATS[it.cat].color }} title={CATS[it.cat].name}>{CATS[it.cat].sym}</span>}
      </td>
    );
  };

  // Red always moves first, so plies pair up as (Red, Black).
  const rows = [];
  for (let i = 0; i < g.notes.length; i += 2) {
    rows.push(<tr key={i}><td className="no">{i / 2 + 1}.</td>{cell(i)}{cell(i + 1)}</tr>);
  }
  return <div className="ml" ref={ref}><table><tbody>{rows}</tbody></table></div>;
}
