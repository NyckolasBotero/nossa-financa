/** format.js — formatação e conversões puras (reutilizadas por todos os módulos). */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WEEK = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const brl = (n) => BRL.format(Number.isFinite(n) ? n : 0);
export const brlShort = (n) => (Math.abs(n) >= 1000 ? `R$ ${(n / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1).replace('.', ',')} mil` : brl(n));
export const pct = (n) => `${Math.round(n * 100)}%`;

/** Aceita "1.234,56", "1234,56", "1234.56", "R$ 12". Devolve número ou null. */
export function parseMoney(s) {
  let t = String(s ?? '').replace(/[^\d.,-]/g, '');
  if (!t || t === '-') return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (!/^-?\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '');
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
export const moneyInput = (n) => (n === null || n === undefined || n === '' ? '' : Number(n).toFixed(2).replace('.', ','));

const p2 = (n) => String(n).padStart(2, '0');
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
export const currentMonth = () => todayISO().slice(0, 7);
export const fmtDate = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
export const fmtDay = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const weekday = (iso) => WEEK[new Date(`${iso}T12:00:00Z`).getUTCDay()];
export const monthName = (m) => MONTHS[Number(m.slice(5, 7)) - 1];
export const monthLabel = (m) => { const n = monthName(m); return `${n[0].toUpperCase()}${n.slice(1)} ${m.slice(0, 4)}`; };
export const monthShort = (m) => monthName(m).slice(0, 3);
export const dayLabel = (iso) => {
  const t = todayISO();
  const diff = Math.round((Date.parse(`${t}T12:00:00Z`) - Date.parse(`${iso}T12:00:00Z`)) / 864e5);
  const base = diff === 0 ? 'Hoje' : diff === 1 ? 'Ontem' : diff === -1 ? 'Amanhã' : weekday(iso);
  return `${base[0].toUpperCase()}${base.slice(1)}, ${fmtDay(iso)}`;
};

export const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
