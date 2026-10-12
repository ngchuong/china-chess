import type { ReactNode } from 'react';

export function Option({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="opt" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}
