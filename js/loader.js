/**
 * loader.js — tela de carregamento animada: arco 3D girando atrás da família e, em cima dela,
 * um coração que vira nota, boleto e outros ícones de finanças em loop (motion design em CSS).
 * showLoader(texto) / hideLoader(). Dá para chamar várias vezes: conta referências.
 */
import { familySvg } from './logo.js';

const S = (inner, fill = false) => `<svg viewBox="0 0 48 48" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
// Ordem: o coração abre a sequência; depois nota, boleto e os demais ícones.
const ICONS = [
  ['#f2677a', S('<path d="M24 41S7 30.500 7 18.500C7 12.500 11.500 8.500 16.500 8.500c3.200 0 5.800 1.700 7.500 4.500 1.700-2.800 4.300-4.500 7.500-4.500C36.500 8.500 41 12.500 41 18.500 41 30.500 24 41 24 41z"/>', true)],
  ['#2d9cdb', S('<path d="M12 6h24v36l-4-3-4 3-4-3-4 3-4-3-4 3z"/><path d="M18 16h12M18 23h12M18 30h7"/>')],
  ['#8b7cf6', S('<rect x="7" y="9" width="34" height="30" rx="4"/><path d="M13 16v16M17 16v16M22 16v16M25 16v16M30 16v16M34 16v16" stroke-width="2.200"/>')],
  ['#f4a62a', S('<circle cx="24" cy="24" r="16"/><path d="M28.500 18.500c-1-1.300-2.600-2-4.500-2-2.600 0-4.500 1.300-4.500 3.300 0 4.700 9.500 2.200 9.500 7 0 2-1.900 3.300-5 3.300-2 0-3.700-.8-4.700-2.200M24 12.500v3M24 32.500v3"/>')],
  ['#1fb58a', S('<rect x="5" y="11" width="38" height="26" rx="5"/><path d="M5 19h38M12 30h8"/>')],
  ['#e17055', S('<path d="M5 8h6l4 20h20l4-14H13"/><circle cx="19" cy="37" r="2.800"/><circle cx="33" cy="37" r="2.800"/>')],
  ['#3d6ea8', S('<path d="M8 30l3-10c.6-2 2.200-3 4.200-3h17.600c2 0 3.600 1 4.200 3l3 10v6H8z"/><path d="M8 30h32M14 36v3M34 36v3"/><circle cx="14" cy="30" r="1" fill="currentColor"/><circle cx="34" cy="30" r="1" fill="currentColor"/>')],
  ['#16a39a', S('<path d="M6 24L24 8l18 16"/><path d="M11 21v19h26V21"/><path d="M20 40V29h8v11"/>')],
  ['#e84393', S('<path d="M10 40V22M20 40V12M30 40V28M40 40V18"/><path d="M6 44h38" />')]
];
const N = ICONS.length, STEP = 1.25;   // segundos por ícone

let refs = 0, el = null, hideTimer = 0, shownAt = 0;

function build(text) {
  const d = document.createElement('div');
  d.className = 'loader'; d.setAttribute('role', 'status'); d.setAttribute('aria-live', 'polite');
  d.style.setProperty('--ld-n', N); d.style.setProperty('--ld-step', `${STEP}s`);
  d.innerHTML = `<div class="ld-stage">
    <div class="ld-glow"></div><div class="ld-ring ld-r1"></div><div class="ld-ring ld-r2"></div>
    <div class="ld-family">${familySvg({ cls: 'logo ld-logo' })}</div>
    <div class="ld-icons" aria-hidden="true">${ICONS.map(([c, svg], i) => `<span class="ld-ic" style="--c:${c};--i:${i}">${svg}</span>`).join('')}</div>
  </div>
  <p class="ld-text">${text || 'Carregando…'}</p><div class="ld-dots" aria-hidden="true"><i></i><i></i><i></i></div>`;
  return d;
}

export function showLoader(text = 'Carregando…') {
  refs++;
  clearTimeout(hideTimer);
  if (!el || !document.body.contains(el)) { el = build(text); document.body.append(el); shownAt = Date.now(); requestAnimationFrame(() => el.classList.add('in')); }
  else { setLoaderText(text); el.classList.add('in'); }
}
export function setLoaderText(text) { const t = el?.querySelector('.ld-text'); if (t) t.textContent = text; }
export function hideLoader(force = false) {
  refs = force ? 0 : Math.max(0, refs - 1);
  if (refs > 0 || !el) return;
  const wait = Math.max(0, 700 - (Date.now() - shownAt));    // evita "piscar" quando a resposta é rápida
  hideTimer = setTimeout(() => { el?.classList.remove('in'); const gone = el; setTimeout(() => { if (refs === 0) gone?.remove(); }, 420); }, wait);
}
