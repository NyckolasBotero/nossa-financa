/**
 * theme.js — tema claro/escuro. Segue o sistema até a pessoa escolher; a escolha fica neste aparelho.
 * O atributo data-theme é aplicado cedo (script inline no index.html) para não piscar.
 */
const KEY = 'nf.theme';
const sys = () => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
export const getTheme = () => { try { return localStorage.getItem(KEY) || sys(); } catch { return sys(); } };
export function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#0b1824' : '#2d9cdb');
}
export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  const root = document.documentElement;
  root.classList.add('theme-anim');              // transição suave só durante a troca
  applyTheme(next);
  try { localStorage.setItem(KEY, next); } catch { /* sem armazenamento */ }
  setTimeout(() => root.classList.remove('theme-anim'), 600);
  return next;
}
applyTheme(getTheme());
