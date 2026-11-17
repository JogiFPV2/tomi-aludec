/**
 * Multitouch dla przycisków: na ekranach dotykowych przycisk działa na podniesienie palca (pointerup)
 * niezależnie od innych palców – można trzymać gałkę i jednocześnie naciskać przyciski.
 * Przeglądarki (zwłaszcza iOS) gubią zwykłe „click”, gdy na ekranie jest już inny palec.
 * Przyciski z własną obsługą dotyku (trzymane, przeciągane) mają klasę .hold, .mtile albo atrybut data-touch-own.
 */
const OWN = '.hold, .mtile, [data-touch-own], input, select, textarea';
export function enableMultitouch(doc: Document = document): () => void {
  const down = new Map<number, HTMLElement>();
  const recent = new WeakMap<HTMLElement, number>();
  let firing = false;
  const target = (e: Event) => (e.target as Element | null)?.closest?.('button, [role=button]') as HTMLElement | null;
  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return; const b = target(e);
    if (!b || b.matches(OWN) || b.closest(OWN) || (b as HTMLButtonElement).disabled) return;
    down.set(e.pointerId, b); b.classList.add('pressed');
  };
  const onUp = (e: PointerEvent) => {
    const b = down.get(e.pointerId); if (!b) return; down.delete(e.pointerId); b.classList.remove('pressed');
    if ((b as HTMLButtonElement).disabled || !b.isConnected) return;
    const r = b.getBoundingClientRect(), pad = 12;
    if (e.clientX < r.left - pad || e.clientX > r.right + pad || e.clientY < r.top - pad || e.clientY > r.bottom + pad) return; // palec zjechał z przycisku
    recent.set(b, performance.now()); firing = true; try { b.click(); } finally { firing = false; }
  };
  const onCancel = (e: PointerEvent) => { const b = down.get(e.pointerId); if (b) { b.classList.remove('pressed'); down.delete(e.pointerId); } };
  // zwykły „click” wygenerowany przez przeglądarkę po tym samym dotknięciu – pomijamy, żeby nie było dwóch naciśnięć
  const onClick = (e: MouseEvent) => {
    if (firing) return; const b = target(e); if (!b) return; const t = recent.get(b);
    if (t !== undefined && performance.now() - t < 800) { e.stopImmediatePropagation(); e.preventDefault(); }
  };
  doc.addEventListener('pointerdown', onDown, true); doc.addEventListener('pointerup', onUp, true); doc.addEventListener('pointercancel', onCancel, true); doc.addEventListener('click', onClick, true);
  return () => { doc.removeEventListener('pointerdown', onDown, true); doc.removeEventListener('pointerup', onUp, true); doc.removeEventListener('pointercancel', onCancel, true); doc.removeEventListener('click', onClick, true); };
}
