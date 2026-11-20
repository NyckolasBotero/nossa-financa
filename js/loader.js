/**
 * loader.js — tela de carregamento: a mesma animação do logo (bolinhas → círculo → coração → boleto → moeda →
 * casinha → barras → família em pé), um pouco mais rápida. Ao terminar de carregar, se a família está perto de
 * ficar pronta ela espera um instante, para não cortar a animação no meio.
 * showLoader(texto) / hideLoader(). Dá para chamar várias vezes: conta referências.
 */
import { mountBrandAnim } from './brandanim.js';
import { familySvg } from './logo.js';

const SPEED = 2;           // velocidade da animação no carregamento
const MAX_WAIT = 2500;     // até quanto esperar a família ficar pronta (ms)

let anim = null;

let refs = 0, el = null, hideTimer = 0, shownAt = 0;

function build(text) {
  const d = document.createElement('div');
  d.className = 'loader'; d.setAttribute('role', 'status'); d.setAttribute('aria-live', 'polite');
  d.innerHTML = `<div class="ld-stage"><div class="ld-glow"></div><div class="ld-anim">${familySvg({ cls: 'logo ld-logo' })}</div></div>
  <p class="ld-text">${text || 'Carregando…'}</p><div class="ld-dots" aria-hidden="true"><i></i><i></i><i></i></div>`;
  return d;
}

export function showLoader(text = 'Carregando…') {
  refs++;
  clearTimeout(hideTimer);
  if (!el || !document.body.contains(el)) { el = build(text); document.body.append(el); anim?.stop(); anim = mountBrandAnim(el.querySelector('.ld-anim'), { speed: SPEED }); shownAt = Date.now(); requestAnimationFrame(() => el.classList.add('in')); }
  else { setLoaderText(text); el.classList.add('in'); }
}
export function setLoaderText(text) { const t = el?.querySelector('.ld-text'); if (t) t.textContent = text; }
export function hideLoader(force = false) {
  refs = force ? 0 : Math.max(0, refs - 1);
  if (refs > 0 || !el) return;
  const left = anim ? anim.untilFamily() * 1000 : 0;                 // falta pouco para a família ficar pronta? espera
  const wait = Math.max(left <= MAX_WAIT ? left : 0, 700 - (Date.now() - shownAt));    // e evita "piscar" quando a resposta é rápida
  hideTimer = setTimeout(() => { el?.classList.remove('in'); const gone = el; setTimeout(() => { if (refs === 0) { gone?.remove(); anim?.stop(); anim = null; } }, 420); }, wait);
}
