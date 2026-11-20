/**
 * brandanim.js — logo animado do menu. Quatro bolinhas viram um círculo com 4 partes coloridas, depois
 * coração e casinha (cada forma pulsa antes de virar a próxima); no fim as bolinhas
 * crescem como barras de um gráfico e as cabeças aparecem, revelando a família em pé, lado a lado.
 * A família fica parada um tempo, desfaz e recomeça — enquanto o site estiver aberto.
 * Cores vêm das variáveis --logo-1..4 (acompanham o tema). Sem movimento reduzido: logo estático.
 * mountBrandAnim(elemento) → { stop(), seek(t), duration, untilFamily() } | null
 */
import { familySvg } from './logo.js';

const NS = 'http://www.w3.org/2000/svg';
const DEF = ['#2d9cdb', '#f2677a', '#f4a62a', '#1fb58a'];   // pai, mãe, menina, menino
const HEX = /^#[0-9a-f]{6}$/i;

const FR = [0.40, 0.27, 0.20, 0.13], START = [0, 0.40, 0.67, 0.87];   // proporções das 4 partes
const DW = [22, 20, 17, 14];                                           // bolinha = diâmetro da cabeça
const DOTS = [[-51, 0], [-17, 0], [17, 0], [51, 0]];
const BW = [26, 24, 20, 15], HFIN = [80, 73, 52, 35], STAND_X = [-49, -11, 25, 55], HEAD_Y = [-42, -34, -10, 8];
const D = {
  ring: 'M0 -62A62 62 0 1 1 0 62A62 62 0 1 1 0 -62Z',
  heart: 'M0 -34C10 -58 52 -56 52 -22C52 8 20 30 0 52C-20 30 -52 8 -52 -22C-52 -56 -10 -58 0 -34Z',
  house: 'M0 -64L66 -8V56H-66V-8Z'
};
const N = 720, K = 26;
const DRESS = [null, { S: 5, th: 7, bh: 18 }, { S: 4.5, th: 4.5, bh: 12 }];
const RSO = [0.6, 0.4, 0.2, 0], HSO = [1.35, 1.5, 1.65, 1.8];           // crescer (verde primeiro) e cabeças
const GROW_END = 2.4, HOLD = 6, REV = 1.2, RET = 0.8, SHAPE_K = 0.78;

const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const eio = (t) => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const eob = (t) => { t = clamp(t); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const elastic = (t) => { t = clamp(t); return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * 2.0944) + 1; };
const imp = (s) => { s = clamp(s); if (s < .5) return Math.pow(s / .5, 2.4); const x = (s - .5) / .5; return 1 + 0.14 * Math.exp(-4 * x) * Math.sin(2 * Math.PI * 1.6 * x); };
const lerp = (a, b, u) => a + (b - a) * u;

// linha do tempo: ciclo fixo por forma → transforma, chega (bate), pulsa, segura, agacha, próxima (sem sobreposição)
const KF = [[0, 'dots', 0, 0, 1, 'e'], [1.5, 'dots', 0, 0, 1, 'e']];
const ANTICIP = [], ARR = [], PUL = [];
{
  let tt = 1.5;
  [['ring', 1.0, 0.6], ['heart', 0.95, 0.9], ['house', 0.95, 0.6]].forEach((c) => {
    const arr = tt + c[1]; KF.push([arr, c[0], 0, 0, 1, 'i']);
    tt = arr + c[2] + 0.4; KF.push([tt, c[0], 0, 0, 1, 'e']);
    ARR.push(arr); PUL.push(c[2]); ANTICIP.push(tt);
  });
  const arr = tt + 1.4; KF.push([arr, 'ring', 1, 540, 1, 'i']);
  KF.push([arr + 0.25, 'ring', 1, 540, 1, 'e']);
  KF.push([arr + 0.85, 'base', 0, 720, 1, 'e']);
}
const T_FAM = KF[KF.length - 1][0];
KF.push([T_FAM + RET, 'dots', 0, 720, 1, 'e']);                          // volta às bolinhas para o loop fechar liso
const T_STAND_END = T_FAM + GROW_END + HOLD, T_REV_END = T_STAND_END + REV, T_END = T_REV_END + RET;

let TAB = null;
function tables() {
  if (TAB) return TAB;
  TAB = {};
  Object.keys(D).forEach((k) => {
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', D[k]);
    const L = p.getTotalLength(), pts = [];
    for (let i = 0; i <= N; i++) { const q = p.getPointAtLength(L * i / N); pts.push([q.x, q.y]); }
    TAB[k] = { pts, L };
  });
  return TAB;
}
function samp(pts, u) {
  u = ((u % 1) + 1) % 1; const f = u * N, i = Math.floor(f), k = f - i, a = pts[i], b = pts[i + 1];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}
function pointsOf(type) {
  const pos = [];
  for (let i = 0; i < 4; i++) {
    const p = type === 'dots' ? DOTS[i] : [STAND_X[i], 52 - BW[i] / 2], arr = [];
    for (let k = 0; k < K; k++) arr.push([p[0] + k * 0.001, p[1]]);
    pos.push(arr);
  }
  return pos;
}
function outline(tab, phase) {
  const gap = -0.004, out = [];
  for (let i = 0; i < 4; i++) {
    const a = START[i] + gap + phase, b = START[i] + FR[i] - gap + phase, arr = [];
    for (let k = 0; k < K; k++) arr.push(samp(tab.pts, a + (b - a) * k / (K - 1)));
    out.push(arr);
  }
  return out;
}
const isTab = (t) => t !== 'dots' && t !== 'base';

function shapeAt(t) {
  const T = tables();
  let i = 0; while (i < KF.length - 2 && t >= KF[i + 1][0]) i++;
  const A = KF[i], B = KF[i + 1];
  const raw = t <= A[0] ? 0 : t >= B[0] ? 1 : (t - A[0]) / (B[0] - A[0]);
  const u = B[5] === 'i' ? imp(raw) : eio(raw);
  const rot = lerp(A[3], B[3], u), sc = lerp(A[4], B[4], u), w = [];
  let pts;
  if (isTab(A[1]) && isTab(B[1])) {
    const ta = T[A[1]], tb = T[B[1]], mixT = { pts: [], L: lerp(ta.L, tb.L, u) };
    for (let j = 0; j <= N; j++) mixT.pts.push([lerp(ta.pts[j][0], tb.pts[j][0], u), lerp(ta.pts[j][1], tb.pts[j][1], u)]);
    const W = A[1] === 'heart' || B[1] === 'heart' ? 13 : 14;
    pts = outline(mixT, lerp(A[2], B[2], u));
    for (let q = 0; q < 4; q++) w.push(W);
  } else {
    const pa = isTab(A[1]) ? outline(T[A[1]], A[2]) : pointsOf(A[1]);
    const pb = isTab(B[1]) ? outline(T[B[1]], B[2]) : pointsOf(B[1]);
    const wa = isTab(A[1]) ? [14, 14, 14, 14] : (A[1] === 'base' ? BW : DW), wb = isTab(B[1]) ? [14, 14, 14, 14] : (B[1] === 'base' ? BW : DW);
    pts = [];
    for (let s = 0; s < 4; s++) {
      const arr = [];
      for (let k = 0; k < K; k++) arr.push([lerp(pa[s][k][0], pb[s][k][0], u), lerp(pa[s][k][1], pb[s][k][1], u)]);
      pts.push(arr); w.push(Math.max(2, lerp(wa[s], wb[s], u)));
    }
  }
  return { pts, w, rot, sc };
}

function squash(t) {      // agacha antes de cada transformação e solta suavemente depois que ela começa
  let a = 0;
  for (let i = 0; i < ANTICIP.length; i++) {
    const T0 = ANTICIP[i]; let b = 0;
    if (t > T0 - 0.25 && t < T0) b = eio((t - (T0 - 0.25)) / 0.25);
    else if (t >= T0 && t < T0 + 0.15) b = 1 - eio((t - T0) / 0.15);
    if (b > a) a = b;
  }
  return a;
}

function mixColor(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round((pa >> s & 255) * (1 - k) + (pb >> s & 255) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function readPal() {
  const cs = getComputedStyle(document.documentElement), g = (n) => cs.getPropertyValue(n).trim();
  const c = ['--logo-1', '--logo-2', '--logo-4', '--logo-3'].map((n, i) => (HEX.test(g(n)) ? g(n) : DEF[i]));
  return { c, muted: g('--muted') || '#8fa9bd', line: g('--line') || '#d9e6ef' };
}

let uid = 0;
const markup = (id) => `<svg class="logo-anim" viewBox="-66 -57 132 114" role="img" aria-label="Nossa Finança" xmlns="http://www.w3.org/2000/svg">
  <defs><filter id="${id}" filterUnits="userSpaceOnUse" x="-120" y="-110" width="240" height="220" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="b"/><feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"/></filter></defs>
  <g class="ba-world">
    <g class="ba-gh2" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0"><path/><path/><path/><path/></g>
    <g class="ba-gh1" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0"><path/><path/><path/><path/></g>
    <g class="ba-shape">
      <g class="ba-goo" filter="url(#${id})"><path fill="none" stroke-linecap="round" stroke-linejoin="round"/><path fill="none" stroke-linecap="round" stroke-linejoin="round"/><path fill="none" stroke-linecap="round" stroke-linejoin="round"/><path fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
    </g>
    <g class="ba-fam" visibility="hidden">
      <line class="ba-floor" x1="-66" x2="66" y1="52" y2="52" stroke-width="2.5" stroke-linecap="round" opacity="0"/>
      <g><rect/><circle r="0" cy="-42"/></g>
      <g><polygon stroke-linejoin="round"/><circle r="0" cy="-34"/></g>
      <g><polygon stroke-linejoin="round"/><circle r="0" cy="-10"/></g>
      <g><rect/><circle r="0" cy="8"/></g>
    </g>
    <g class="ba-fx"></g>
  </g>
</svg>`;

export function mountBrandAnim(host, { speed = 1 } = {}) {
  if (!host) return null;
  const still = () => { host.innerHTML = familySvg({ cls: 'logo logo-sm' }); return null; };
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return still();
  let svg, raf = 0, stopped = false;
  try {
    host.innerHTML = markup('nf-gooF' + (++uid));
    svg = host.firstElementChild;
    tables();
  } catch { return still(); }

  const q = (c) => svg.querySelector('.' + c);
  const world = q('ba-world'), shapeG = q('ba-shape'), famG = q('ba-fam'), goo = q('ba-goo'), fx = q('ba-fx'), floor = q('ba-floor');
  const gh1 = q('ba-gh1'), gh2 = q('ba-gh2'), ghp = [[...gh1.children], [...gh2.children]];
  const paths = [...goo.children];
  const figs = [...famG.querySelectorAll(':scope > g')];
  const bods = figs.map((f) => f.firstElementChild), heads = figs.map((f) => f.lastElementChild);
  let pal = readPal();


  // ---- encontros: gotinhas, ondinhas e brilho (um efeito diferente por forma)
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const ITEMS = [];
  const item = (kind, o, parent, tag) => {
    o.kind = kind; o.on = false; o.el = document.createElementNS(NS, tag); o.el.setAttribute('visibility', 'hidden');
    if (kind === 'ring') o.el.setAttribute('fill', 'none');
    parent.appendChild(o.el); ITEMS.push(o);
  };
  const EVT = { 2: ['bulge', 'drops'], 4: ['ripple', 'dropsS'], 6: ['ripple', 'bulge'], 8: ['drops', 'ripple', 'glint'] };
  function build(ei) {
    const A = KF[ei - 1], B = KF[ei], t0 = A[0] + 0.5 * (B[0] - A[0]), th = B[3] * Math.PI / 180, P = [];
    for (let i = 0; i < 4; i++) P.push(samp(TAB[B[1]].pts, START[i] + B[2]));
    const gx = Math.sin(th) * 95, gy = Math.cos(th) * 95, up = Math.atan2(-Math.cos(th), -Math.sin(th));
    (EVT[ei] || []).forEach((name) => {
      for (let i = 0; i < 4; i++) {
        const p = P[i], cj = (i + 3) % 4, wx = p[0] * Math.cos(th) - p[1] * Math.sin(th), wy = p[0] * Math.sin(th) + p[1] * Math.cos(th);
        if (name === 'bulge') item('blob', { t: t0, life: .6, x: p[0], y: p[1], ci: i, cj, R: ei === 2 ? 11.5 : 9 }, goo, 'circle');
        if (name === 'drops' || name === 'dropsS') {
          const n = name === 'drops' ? 3 : 2;
          for (let k = 0; k < n; k++) {
            const ang = Math.atan2(p[1], p[0]) + (rnd() - .5) * 1.3, sp = (name === 'drops' ? 60 : 48) + rnd() * 45;
            item('drop', { t: t0 + k * 0.04, life: .85 + rnd() * .35, x: p[0], y: p[1], vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, gx, gy, r: 2.8 + rnd() * 1.8, ci: i, cj, k: rnd() }, goo, 'circle');
          }
        }
        if (name === 'splash') {
          for (let k = 0; k < 3; k++) {
            const ang = up + (rnd() - .5) * 1.7, sp = 90 + rnd() * 50;
            item('drop', { t: t0 + k * 0.03, life: .75 + rnd() * .3, x: p[0], y: p[1], vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, gx, gy, r: 2.6 + rnd() * 1.8, ci: i, cj, k: rnd() }, goo, 'circle');
          }
        }
        if (name === 'ripple') item('ring', { t: t0, life: .55, x: wx, y: wy, r0: 6, r1: 26, ci: i, cj }, fx, 'circle');
        if (name === 'glint') for (let k = 0; k < 2; k++) item('glint', { t: t0 + k * 0.07, life: .45, x: wx + (rnd() - .5) * 18, y: wy + (rnd() - .5) * 18 }, fx, 'circle');
      }
    });
  }
  for (let e = 1; e < KF.length; e++) if (KF[e][5] === 'i') build(e);

  function setColors() {
    paths.forEach((p, i) => p.setAttribute('stroke', pal.c[i]));
    ghp.forEach((g) => g.forEach((p, i) => p.setAttribute('stroke', pal.c[i])));
    heads.forEach((h, i) => h.setAttribute('fill', pal.c[i]));
    bods.forEach((el, i) => { el.setAttribute('fill', pal.c[i]); el.setAttribute('stroke', el.tagName === 'polygon' ? pal.c[i] : 'none'); });
    floor.setAttribute('stroke', pal.muted);
  }

  function drawShape(t, els, withBounce) {
    const st = shapeAt(t);
    const bw = (t < 1.3 ? 1 : t > 1.7 ? 0 : 1 - eio((t - 1.3) / 0.4)) * clamp(t / 0.4);
    for (let i = 0; i < 4; i++) {
      const th = Math.PI * (t * 1.25 - i * 0.17); let yo = 0, sh = 0, sv = 0;
      if (withBounce && bw > 0) {
        yo = -18 * bw * Math.abs(Math.sin(th));
        sv = 8 * bw * Math.pow(Math.abs(Math.cos(th)), 1.5);
        sh = 3.5 * bw * Math.max(0, 1 - Math.abs(Math.sin(th)) * 6);
      }
      let d = ''; const arr = st.pts[i];
      for (let k = 0; k < arr.length; k++) {
        const f = k / (arr.length - 1) - .5, dx = bw > 0 ? f * sh : 0, dy = bw > 0 ? f * sv : 0;
        d += (k ? 'L' : 'M') + (arr[k][0] + dx).toFixed(2) + ' ' + (arr[k][1] + yo + dy).toFixed(2);
      }
      els[i].setAttribute('d', d);
      els[i].setAttribute('stroke-width', st.w[i].toFixed(2));
    }
    return st;
  }

  function frame(t) {
    const showFam = t >= T_FAM && t < T_REV_END;
    const tt = t < T_REV_END ? t : T_FAM + (t - T_REV_END);          // tempo da fase de formas (volta às bolinhas no fim)
    famG.setAttribute('visibility', showFam ? 'visible' : 'hidden');
    shapeG.setAttribute('visibility', showFam ? 'hidden' : 'visible');
    // a escala acompanha: formas um pouco menores para caber; família em tamanho cheio
    const S = showFam ? 1 : t < T_FAM ? eio((t - (T_FAM - 0.6)) / 0.6) : 1 - eio((tt - T_FAM) / 0.6);
    world.setAttribute('transform', 'scale(' + (SHAPE_K + (1 - SHAPE_K) * S).toFixed(4) + ')');

    if (!showFam) {
      const st = drawShape(tt, paths, true);
      const st1 = shapeAt(Math.max(0, tt - 0.05)); let dist = 0, n = 0;
      for (let i = 0; i < 4; i++) for (let k = 0; k < K; k += 5) { dist += Math.hypot(st.pts[i][k][0] - st1.pts[i][k][0], st.pts[i][k][1] - st1.pts[i][k][1]); n++; }
      dist /= n; const g1 = Math.min(0.32, dist * 0.035);
      if (g1 > 0.02 && tt > 1.6) {
        const sa = drawShape(tt - 0.05, ghp[0], false), sb = drawShape(tt - 0.1, ghp[1], false);
        gh1.setAttribute('opacity', g1.toFixed(2)); gh2.setAttribute('opacity', (g1 * 0.5).toFixed(2));
        gh1.setAttribute('transform', 'rotate(' + sa.rot.toFixed(2) + ')'); gh2.setAttribute('transform', 'rotate(' + sb.rot.toFixed(2) + ')');
      } else { gh1.setAttribute('opacity', 0); gh2.setAttribute('opacity', 0); }
      let pulse = 1;
      for (let i = 0; i < ARR.length; i++) {
        const u = (tt - ARR[i]) / PUL[i];
        if (u > 0 && u < 1) {
          { const sn = Math.sin((i === 1 ? 2 : 1) * Math.PI * u); pulse = 1 + (i === 1 ? 0.08 : 0.05) * sn * sn; }
        }
      }
      const a = squash(tt), sx = st.sc * pulse * (1 + 0.07 * a), sy = st.sc * pulse * (1 - 0.07 * a);
      shapeG.setAttribute('transform', 'rotate(' + st.rot.toFixed(2) + ') scale(' + sx.toFixed(3) + ' ' + sy.toFixed(3) + ')');
    } else {
      gh1.setAttribute('opacity', 0); gh2.setAttribute('opacity', 0);
      // as bolinhas da base crescem como barras de gráfico (verde, na direita, primeiro); depois as cabeças revelam a família
      const tau = t < T_STAND_END ? t - T_FAM : GROW_END * (1 - eio((t - T_STAND_END) / REV));
      for (let j = 0; j < 4; j++) {
        const gj = eob((tau - RSO[j]) / 0.7), h = lerp(BW[j], HFIN[j], gj), bar = bods[j];
        figs[j].setAttribute('transform', 'translate(' + STAND_X[j] + ' 0)');
        if (j === 0 || j === 3) {
          bar.setAttribute('x', (-BW[j] / 2).toFixed(2)); bar.setAttribute('width', BW[j]); bar.setAttribute('y', (52 - h).toFixed(2)); bar.setAttribute('height', h.toFixed(2)); bar.setAttribute('rx', BW[j] / 2);
        } else {   // mãe e menina: a barra vira vestido quando a cabeça aparece
          const m = eio((tau - HSO[j]) / 0.5), dr = DRESS[j], Sw = lerp(BW[j], dr.S, m), thw = lerp(0.05, dr.th, m), bhw = lerp(0.05, dr.bh, m);
          const ty = 52 - h + Sw / 2, by = 52 - Sw / 2, yb = Math.max(ty + 0.05, by).toFixed(2);
          bar.setAttribute('stroke-width', Sw.toFixed(2));
          bar.setAttribute('points', (-thw).toFixed(2) + ',' + ty.toFixed(2) + ' ' + thw.toFixed(2) + ',' + ty.toFixed(2) + ' ' + bhw.toFixed(2) + ',' + yb + ' ' + (-bhw).toFixed(2) + ',' + yb);
        }
        const sh = elastic((tau - HSO[j]) / 0.55), hd = heads[j];
        hd.setAttribute('r', (DW[j] / 2 * Math.max(0, sh)).toFixed(2));
        hd.setAttribute('cy', lerp(52 - HFIN[j], HEAD_Y[j], Math.min(1.15, Math.max(0, sh))).toFixed(2));
      }
      floor.setAttribute('opacity', (0.5 * eio(tau / 0.5) * (1 - eio((tau - 1.6) / 0.5))).toFixed(2));
      shapeG.setAttribute('transform', '');
    }

    for (let i = 0; i < ITEMS.length; i++) {
      const o = ITEMS[i], tau = tt - o.t, el = o.el;
      if (tau < 0 || tau > o.life) { if (o.on) { el.setAttribute('visibility', 'hidden'); o.on = false; } continue; }
      const k = tau / o.life, ci = pal.c[o.ci], cj = pal.c[o.cj];
      if (o.kind === 'blob') {
        el.setAttribute('cx', o.x.toFixed(1)); el.setAttribute('cy', o.y.toFixed(1));
        el.setAttribute('r', (o.R * Math.pow(Math.sin(Math.PI * k), 0.7)).toFixed(2)); el.setAttribute('fill', mixColor(ci, cj, .5));
      } else if (o.kind === 'drop') {
        const dr = (1 - Math.exp(-3 * tau)) / 3;
        el.setAttribute('cx', (o.x + o.vx * dr + 0.5 * o.gx * tau * tau).toFixed(1)); el.setAttribute('cy', (o.y + o.vy * dr + 0.5 * o.gy * tau * tau).toFixed(1));
        el.setAttribute('r', (o.r * (1 - 0.45 * k)).toFixed(2)); el.setAttribute('fill', mixColor(ci, cj, o.k)); el.setAttribute('opacity', (k < .7 ? 1 : (1 - k) / .3).toFixed(2));
      } else if (o.kind === 'ring') {
        const e3 = 1 - Math.pow(1 - k, 3);
        el.setAttribute('cx', o.x.toFixed(1)); el.setAttribute('cy', o.y.toFixed(1)); el.setAttribute('r', lerp(o.r0, o.r1, e3).toFixed(1));
        el.setAttribute('stroke', mixColor(ci, cj, .5)); el.setAttribute('stroke-width', (2.4 * (1 - k) + 0.4).toFixed(2)); el.setAttribute('opacity', (0.75 * (1 - k)).toFixed(2));
      } else if (o.kind === 'glint') {
        el.setAttribute('cx', o.x.toFixed(1)); el.setAttribute('cy', o.y.toFixed(1)); el.setAttribute('r', (1.7 * Math.sin(Math.PI * k) + 0.2).toFixed(2));
        el.setAttribute('fill', '#ffffff'); el.setAttribute('opacity', Math.sin(Math.PI * k).toFixed(2));
      }
      el.setAttribute('visibility', 'visible'); o.on = true;
    }
  }

  // ---- laço: ~30 quadros por segundo, pausa sozinho com a aba em segundo plano
  let t = 0, last = 0, drawn = 0;
  function tick(now) {
    if (stopped) return;
    raf = requestAnimationFrame(tick);
    if (!last) last = now;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (document.hidden) return;
    t += dt * speed; if (t >= T_END) t = 0;
    if (now - drawn < 30) return;
    drawn = now; frame(t);
  }
  setColors(); frame(0);
  raf = requestAnimationFrame(tick);
  const mo = new MutationObserver(() => { pal = readPal(); setColors(); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return {
    stop() { stopped = true; cancelAnimationFrame(raf); mo.disconnect(); },
    seek(x) { stopped = true; cancelAnimationFrame(raf); frame(x); },   // para testes visuais
    duration: T_END,
    untilFamily() { const f = T_FAM + GROW_END; return t < f ? (f - t) / speed : 0; }   // segundos até a família ficar completa
  };
}
