/**
 * charts.js — gráficos minimalistas em SVG puro (sem biblioteca, carrega rápido).
 * Cada função devolve uma string HTML; as cores vêm de variáveis CSS ou hex.
 */
import { esc, brl, brlShort } from './format.js';

function niceMax(v) {
  if (v <= 0) return 1;
  const e = 10 ** Math.floor(Math.log10(v)), f = v / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
}

/** Barras agrupadas. series: [{ name, color, values[] }] */
export function barChart({ labels, series, height = 230, label = 'Gráfico de barras' }) {
  const W = 600, H = height, L = 52, R = 8, T = 12, B = 28;
  const iw = W - L - R, ih = H - T - B;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const slot = iw / labels.length, bw = Math.min(26, (slot * 0.72) / series.length);
  const y = (v) => T + ih - (v / max) * ih;
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i, yy = y(v);
    g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" class="grid"/><text x="${L - 8}" y="${yy + 4}" text-anchor="end" class="tick">${esc(brlShort(v).replace('R$ ', ''))}</text>`;
  }
  labels.forEach((lb, i) => {
    const cx = L + slot * i + slot / 2;
    g += `<text x="${cx}" y="${H - 8}" text-anchor="middle" class="tick">${esc(lb)}</text>`;
    series.forEach((s, j) => {
      const v = s.values[i] || 0, x = cx - (bw * series.length) / 2 + bw * j, yy = y(v);
      g += `<rect x="${x + 1}" y="${yy}" width="${bw - 2}" height="${Math.max(0, T + ih - yy)}" rx="6" fill="${s.color}"><title>${esc(s.name)} · ${esc(lb)}: ${esc(brl(v))}</title></rect>`;
    });
  });
  const legend = series.map((s) => `<span class="lg"><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${g}</svg><div class="legend">${legend}</div>`;
}

/** Rosca. items: [{ label, value, color }] */
export function donutChart({ items, centerTop = '', centerBottom = '', label = 'Gráfico de rosca' }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const r = 66, c = 2 * Math.PI * r;
  let off = 0, arcs = '';
  if (total > 0) {
    for (const it of items) {
      const len = (it.value / total) * c;
      arcs += `<circle cx="90" cy="90" r="${r}" fill="none" stroke="${it.color}" stroke-width="24" stroke-dasharray="${Math.max(0, len - 3)} ${c - Math.max(0, len - 3)}" stroke-dashoffset="${-off}" stroke-linecap="round" transform="rotate(-90 90 90)"><title>${esc(it.label)}: ${esc(brl(it.value))} (${Math.round((it.value / total) * 100)}%)</title></circle>`;
      off += len;
    }
  } else arcs = `<circle cx="90" cy="90" r="${r}" fill="none" stroke="var(--line)" stroke-width="24"/>`;
  const legend = items.slice(0, 6).map((i) => `<li><i style="background:${i.color}"></i><span>${esc(i.label)}</span><b>${esc(brl(i.value))}</b></li>`).join('');
  return `<div class="donut"><svg viewBox="0 0 180 180" role="img" aria-label="${esc(label)}">${arcs}<text x="90" y="86" text-anchor="middle" class="d-top">${esc(centerTop)}</text><text x="90" y="106" text-anchor="middle" class="d-bot">${esc(centerBottom)}</text></svg><ul class="legend-list">${legend}</ul></div>`;
}

/** Linha com área. points: [{ label, value }] */
export function areaChart({ points, height = 200, color = 'var(--brand)', label = 'Gráfico de linha', marks = [] }) {
  const W = 600, H = height, L = 52, R = 12, T = 12, B = 26, iw = W - L - R, ih = H - T - B;
  const max = niceMax(Math.max(1, ...points.map((p) => p.value)));
  const x = (i) => L + (iw * i) / Math.max(1, points.length - 1), y = (v) => T + ih - (v / max) * ih;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1)} ${T + ih} L${x(0)} ${T + ih} Z`;
  let g = '';
  for (let i = 0; i <= 4; i++) { const v = (max / 4) * i; g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="tick">${esc(brlShort(v).replace('R$ ', ''))}</text>`; }
  const every = Math.ceil(points.length / 6);
  points.forEach((p, i) => { if (i % every === 0 || i === points.length - 1) g += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="tick">${esc(p.label)}</text>`; });
  const last = points[points.length - 1];
  const dots = marks.map((m) => `<circle cx="${x(m.i)}" cy="${y(points[m.i].value)}" r="4" fill="var(--surface)" stroke="${color}" stroke-width="2"><title>${esc(m.label)}</title></circle>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}"><defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>${g}<path d="${area}" fill="url(#ag)"/><path d="${line}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${dots}<circle cx="${x(points.length - 1)}" cy="${y(last.value)}" r="5" fill="${color}"/></svg>`;
}

/** Anel de progresso (metas). pct de 0 a 1+. */
export function ring(pct, color = 'var(--brand)', text = '') {
  const r = 34, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct));
  return `<svg class="ring" viewBox="0 0 84 84" role="img" aria-label="${Math.round(pct * 100)}%"><circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--line)" stroke-width="9"/><circle cx="42" cy="42" r="${r}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c * p} ${c}" transform="rotate(-90 42 42)"/><text x="42" y="47" text-anchor="middle" class="ring-t">${esc(text || Math.round(pct * 100) + '%')}</text></svg>`;
}

/** Barra de progresso HTML. status: ok | warn | over */
export const bar = (ratio, status = 'ok') => `<div class="bar bar-${status}"><i style="width:${Math.max(0, Math.min(1, ratio)) * 100}%"></i></div>`;

// ------------------------------------------------------------------ velocímetro (saúde financeira)
const polar = (a, r) => [150 + r * Math.cos((a * Math.PI) / 180), 150 + r * Math.sin((a * Math.PI) / 180)];
const arc = (s0, s1, r) => { const [x0, y0] = polar(180 + s0 * 1.8, r), [x1, y1] = polar(180 + s1 * 1.8, r); return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
/** score 0-100; sem dados mostra o ponteiro parado em zero. */
export function gauge({ score = 0, label = '', hasData = true, tone = 'var(--ink)' }) {
  const segs = [[0, 40, '#f2677a'], [40, 70, '#f4a62a'], [70, 85, '#7ccf6a'], [85, 100, '#1fb58a']];
  const s = hasData ? Math.max(0, Math.min(100, score)) : 0;
  return `<svg class="gauge" viewBox="0 0 300 210" role="img" aria-label="Saúde financeira: ${hasData ? s + ' de 100, ' + esc(label) : 'sem dados'}">
    <path class="g-track" d="${arc(0, 100, 120)}"/>
    ${segs.map(([a, b, c]) => `<path class="g-seg" d="${arc(a + 0.6, b - 0.6, 120)}" stroke="${c}"/>`).join('')}
    <text class="g-tick" x="30" y="172">0</text><text class="g-tick" x="270" y="172">100</text>
    <g class="g-needle needle-in" style="transform:rotate(${(s * 1.8).toFixed(1)}deg)"><polygon class="g-needle-p" points="48,150 150,143 150,157"/></g>
    <circle class="g-hub" cx="150" cy="150" r="11"/><circle cx="150" cy="150" r="4.5" fill="var(--surface)"/>
    <text class="g-score" x="150" y="192">${hasData ? s : '—'}</text>
    <text class="g-label" x="150" y="208" fill="${tone}">${esc(hasData ? label : 'Sem dados ainda')}</text></svg>`;
}

// ------------------------------------------------------------------ copo d'água (nível = progresso 0-1)
let cupN = 0;
export function cup(level, { label = '' } = {}) {
  const id = `cup${++cupN}`, lv = Math.max(0, Math.min(1, level || 0)), top = 138 - lv * 120;
  const wave = 'M0 6q15-9 30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0V160H0z';
  return `<svg class="cup ${lv >= 1 ? 'full' : ''}" viewBox="0 0 120 150" role="img" aria-label="${label ? esc(label) + ': ' : ''}${Math.round(lv * 100)}% cheio">
    <defs><clipPath id="${id}"><path d="M24 16h72l-8 116q-1 8-9 8H41q-8 0-9-8z"/></clipPath>
    <linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--sky)"/><stop offset="1" stop-color="var(--brand)"/></linearGradient></defs>
    <g clip-path="url(#${id})"><g class="c-fill fill-in" style="transform:translateY(${top.toFixed(1)}px)">
      <rect x="0" y="6" width="120" height="150" fill="url(#${id}w)" class="c-water" style="fill:url(#${id}w)"/>
      <g transform="translate(-8 -4)"><path class="c-wave1" d="${wave}"/></g><g transform="translate(-30 0)"><path class="c-wave2" d="${wave}"/></g>
      <circle class="c-bubble" cx="48" cy="118" r="3"/><circle class="c-bubble" cx="70" cy="126" r="2.200"/><circle class="c-bubble" cx="86" cy="112" r="3.400"/></g></g>
    <path class="c-glass" d="M24 16h72l-8 116q-1 8-9 8H41q-8 0-9-8z" style="fill:none"/>
    <path class="c-shine" d="M34 26l6 88"/></svg>`;
}
