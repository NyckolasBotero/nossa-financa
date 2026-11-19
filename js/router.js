/**
 * router.js — rotas por hash (#/dashboard). Cada rota = fragmento pages/<id>.html + módulo js/<module>.js.
 * O módulo exporta render(view) e, opcionalmente, dispose(). Os módulos são carregados sob demanda.
 */
import { $, $$, esc, icon, emptyState } from './ui.js';

/** month: a tela usa o seletor de mês do topo. */
export const ROUTES = [
  { id: 'dashboard', label: 'Painel', icon: 'dashboard', module: 'dashboard', month: true },
  { id: 'extract', label: 'Extrato', icon: 'extract', module: 'transactions', month: true },
  { id: 'inbox', label: 'Notificações', icon: 'bell', module: 'notifications' },
  { id: 'fixed', label: 'Fixas', icon: 'calendar', module: 'fixedbills', month: true },
  { id: 'accounts', label: 'Contas', icon: 'bank', module: 'accounts' },
  { id: 'cards', label: 'Cartões', icon: 'card', module: 'cards' },
  { id: 'planning', label: 'Planejamento', icon: 'target', module: 'planning', month: true },
  { id: 'goals', label: 'Metas', icon: 'flag', module: 'goals' },
  { id: 'insights', label: 'Insights', icon: 'bulb', module: 'insights-view' },
  { id: 'reports', label: 'Relatórios', icon: 'chart', module: 'reports' },
  { id: 'settings', label: 'Configurações', icon: 'gear', module: 'settings' }
];

const pages = new Map();
let view = null, current = null, token = 0;
const listeners = new Set();
export const onRoute = (fn) => { listeners.add(fn); };
export const currentRoute = () => current?.route;

async function fetchPage(id) {
  if (!pages.has(id)) {
    const res = await fetch(`pages/${id}.html`);
    if (!res.ok) throw new Error(`Tela ${id} não encontrada.`);
    pages.set(id, await res.text());
  }
  return pages.get(id);
}

async function show(keepScroll = false) {
  const id = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const route = ROUTES.find((r) => r.id === id) || ROUTES[0];
  const my = ++token, scroll = keepScroll ? window.scrollY : 0;
  view.setAttribute('aria-busy', 'true');
  try {
    const [html, mod] = await Promise.all([fetchPage(route.id), import(`./${route.module}.js`)]);
    if (my !== token) return;
    if (current?.mod !== mod) current?.mod.dispose?.();
    const isNew = !current || current.route.id !== route.id;
    view.onclick = null; view.onchange = null;   // handlers da tela anterior não podem sobrar
    view.innerHTML = html;
    view.dataset.page = route.id;
    current = { route, mod };
    await mod.render(view);
    if (my !== token) return;
    if (isNew) { view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); }
    window.scrollTo(0, scroll);
    listeners.forEach((fn) => fn(route));
  } catch (err) {
    if (my !== token) return;
    console.error(err);
    view.innerHTML = `<div class="card">${emptyState('bulb', 'Não foi possível abrir esta tela', err.message || 'Erro inesperado.', '<button class="btn btn-primary" data-retry>Tentar de novo</button>')}</div>`;
    $('[data-retry]', view)?.addEventListener('click', () => show());
  } finally { if (my === token) view.removeAttribute('aria-busy'); }
}

export function start(el) {
  view = el;
  window.addEventListener('hashchange', () => show());
  return show();
}
/** Redesenha a tela atual (depois de salvar algo ou de trocar escopo/mês), mantendo a rolagem. */
export const refresh = () => (view ? show(true) : null);
export function navigate(id) { if (location.hash === `#/${id}`) refresh(); else location.hash = `#/${id}`; }

export function renderNav(container) {
  container.innerHTML = ROUTES.map((r, i) => `<a class="nav-i" style="--i:${i}" href="#/${r.id}" data-route="${r.id}" title="${esc(r.label)}">${icon(r.icon)}<span class="nav-l">${esc(r.label)}</span><span class="nav-badge" data-badge="${r.id}" hidden></span></a>`).join('');
}
export function markActive(route) {
  $$('.nav-i[data-route], .tab-i[data-route]').forEach((a) => a.classList.toggle('on', a.dataset.route === route.id));
}

/** Barra inferior do celular: as 4 telas mais usadas + "Mais" (abre o menu completo). */
export const TAB_ROUTES = ['dashboard', 'extract', 'fixed', 'goals'];
export function renderTabbar(container) {
  container.innerHTML = TAB_ROUTES.map((id) => { const r = ROUTES.find((x) => x.id === id); return `<a class="tab-i" href="#/${r.id}" data-route="${r.id}">${icon(r.icon)}<span>${esc(r.label)}</span></a>`; }).join('')
    + `<button class="tab-i" type="button" data-more>${icon('menu')}<span>Mais</span></button>`;
}
