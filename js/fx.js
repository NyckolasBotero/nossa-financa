/**
 * fx.js — efeitos de interface: ondinha ao clicar (ripple) e orbes de fundo.
 * Respeita "reduzir movimento".
 */
const SEL = '.btn, .btn-icon, .nav-i, .tab, .tab-i, .fab-btn, .fab-i, .seg-i span, .pick, .tx, .ent, .kpi, .insight';
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

export function initRipple() {
  document.addEventListener('pointerdown', (e) => {
    if (reduce.matches || e.button > 0) return;
    const el = e.target.closest(SEL);
    if (!el || el.disabled) return;
    const r = el.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2.2;
    const dot = document.createElement('span');
    dot.className = 'ripple';
    dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    const cs = getComputedStyle(el);
    if (cs.position === 'static') el.style.position = 'relative';
    el.classList.add('has-ripple');
    el.append(dot);
    dot.addEventListener('animationend', () => dot.remove());
  }, { passive: true });
}

/** Orbes foscos que correm pelo fundo. Atrás do menu lateral (vidro) eles ficam mais claros e desfocados. */
export function initOrbs() {
  if (document.querySelector('.orbs')) return;
  const wrap = document.createElement('div');
  wrap.className = 'orbs'; wrap.setAttribute('aria-hidden', 'true');
  const cfg = [[1, 260, 34, 0], [2, 190, 28, -9], [3, 320, 46, -20], [1, 140, 22, -5], [2, 230, 38, -28], [3, 120, 19, -13], [1, 200, 31, -17]];
  wrap.innerHTML = cfg.map(([c, s, d, delay], i) => `<i class="orb orb-${c}" style="--s:${s}px;--d:${d}s;--delay:${delay}s;--y:${8 + ((i * 37) % 78)}vh;--r:${i % 2 ? 'orb-run-b' : 'orb-run-a'}"></i>`).join('');
  document.body.prepend(wrap);
}
