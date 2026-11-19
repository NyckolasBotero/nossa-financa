/**
 * app.js — inicialização: conexão, menu lateral, filtros globais (quem/mês), ações rápidas e sincronização.
 */
import * as api from './api.js';
import * as store from './store.js';
import { ROUTES, start, refresh, renderNav, markActive, onRoute } from './router.js';
import { $, $$, h, esc, icon, toast, setBusy, monthLabel, currentMonth } from './ui.js';
import { addMonths } from './projections.js';
import { CONFIG } from './config.js';

const show = (el, on) => { el.hidden = !on; };

// ---------------------------------------------------------------- conexão (primeiro acesso)
function showConnect(message = '') {
  show($('#app'), false); show($('#connect'), true);
  const c = api.getConn();
  $('#c-url').value = c.url;
  const err = $('#connect-error'); err.textContent = message; err.hidden = !message;
}
$('#connect-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = $('#c-url').value.trim(), token = $('#c-token').value.trim();
  const err = $('#connect-error'); err.hidden = true;
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) { err.textContent = 'A URL deve começar com https://script.google.com/ e terminar em /exec.'; err.hidden = false; return; }
  if (!token) { err.textContent = 'Informe o token.'; err.hidden = false; return; }
  const btn = $('#connect-form button[type=submit]'); btn.disabled = true;
  try {
    await api.call('auth.me', {}, { conn: { url, token } });
    api.setConn({ url, token });
    $('#c-token').value = '';
    await boot();
  } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  finally { btn.disabled = false; }
});

// ---------------------------------------------------------------- shell
function paintStatic() {
  $('#side-toggle').innerHTML = icon('chevR');
  $('#menu-btn').innerHTML = icon('menu');
  $('#m-prev').innerHTML = icon('chevL'); $('#m-next').innerHTML = icon('chevR');
  $('#fab-btn').innerHTML = icon('plus');
  $$('[data-ic]').forEach((el) => { el.innerHTML = icon(el.dataset.ic); });
  $('#sync-btn').innerHTML = `${icon('sync')}<span class="nav-l">Sincronizar</span>`;
}

function paintScope() {
  const { users } = store.state, me = store.state.me?.id;
  const opts = [{ value: 'family', label: 'Família' }, ...users.map((u) => ({ value: u.id, label: u.id === me ? `${u.name} (eu)` : u.name }))];
  const cur = opts.some((o) => o.value === store.prefs.who) ? store.prefs.who : 'family';
  $('#scope').innerHTML = opts.map((o) => `<label class="seg-i"><input type="radio" name="scope" value="${esc(o.value)}" ${o.value === cur ? 'checked' : ''}><span>${esc(o.label)}</span></label>`).join('');
}
function paintMonth() { $('#m-label').textContent = monthLabel(store.prefs.month); }
function paintBadges() {
  const n = store.state.inboxCounts.pending, b = $('[data-badge="inbox"]');
  if (b) { b.hidden = !n; b.textContent = n > 99 ? '99+' : n; }
}

function bindShell() {
  const side = $('#side');
  const setSide = (open) => { side.classList.toggle('open', open); document.body.classList.toggle('menu-open', open); $('#side-toggle').setAttribute('aria-expanded', open); $('#side-toggle').setAttribute('aria-label', open ? 'Recolher menu' : 'Expandir menu'); };
  $('#side-toggle').addEventListener('click', () => setSide(!side.classList.contains('open')));
  $('#menu-btn').addEventListener('click', () => setSide(true));
  $('#side-backdrop').addEventListener('click', () => setSide(false));
  $('#nav').addEventListener('click', (e) => { if (e.target.closest('a') && matchMedia('(max-width: 800px)').matches) setSide(false); });

  $('#scope').addEventListener('change', (e) => store.setWho(e.target.value));
  $('#m-prev').addEventListener('click', () => store.setMonth(addMonths(store.prefs.month, -1)));
  $('#m-next').addEventListener('click', () => store.setMonth(addMonths(store.prefs.month, 1)));
  $('#m-label').addEventListener('click', () => store.setMonth(currentMonth()));
  $('#sync-btn').addEventListener('click', async () => {
    try { await store.sync({ force: true }); toast('Dados sincronizados.', { kind: 'ok' }); } catch (e) { toast(e.message, { kind: 'err' }); }
  });

  // ação rápida em bolhas
  const fab = $('#fab-btn'), menu = $('#fab-menu');
  const setFab = (open) => { fab.setAttribute('aria-expanded', open); $('#fab').classList.toggle('open', open); menu.hidden = !open; };
  fab.addEventListener('click', () => setFab(menu.hidden));
  document.addEventListener('click', (e) => { if (!e.target.closest('#fab')) setFab(false); });
  menu.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    setFab(false);
    try {
      if (b.dataset.act === 'tx') (await import('./transactions.js')).openTxModal();
      if (b.dataset.act === 'paste') (await import('./notifications.js')).openPasteModal();
      if (b.dataset.act === 'payslip') (await import('./payslip.js')).openPayslipModal();
    } catch (err) { toast(err.message, { kind: 'err' }); }
  });
}

let rerender = 0;
store.subscribe(() => {
  paintMonth(); paintBadges();
  clearTimeout(rerender); rerender = setTimeout(refresh, 30);
});
// quem mudou o escopo/usuários: repinta o seletor
let lastUsers = '';
store.subscribe(() => { const k = JSON.stringify(store.state.users) + store.prefs.who; if (k !== lastUsers) { lastUsers = k; paintScope(); } });

onRoute((route) => {
  markActive(route);
  $('#page-title').textContent = route.label;
  show($('#month-nav'), !!route.month);
  document.title = `${route.label} · ${CONFIG.APP_NAME}`;
});

// ---------------------------------------------------------------- boot
let shellBound = false;
async function boot() {
  if (!api.isConfigured()) return showConnect();
  show($('#connect'), false);
  try { await store.load(); }
  catch (e) {
    if (['UNAUTHORIZED', 'NOT_CONFIGURED'].includes(e.code)) return showConnect(e.message);
    show($('#app'), false);
    const box = h(`<section class="connect"><div class="connect-card"><h1>Sem conexão</h1><p class="muted">${esc(e.message)}</p><button class="btn btn-primary btn-block" data-retry>Tentar de novo</button><button class="btn btn-ghost btn-block" data-reset>Trocar conexão</button></div></section>`);
    document.body.append(box);
    $('[data-retry]', box).onclick = () => { box.remove(); boot(); };
    $('[data-reset]', box).onclick = () => { box.remove(); showConnect(); };
    return;
  }
  show($('#app'), true);
  if (!shellBound) {
    shellBound = true;
    paintStatic(); renderNav($('#nav')); bindShell();
    api.onBusy(setBusy);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) store.sync().catch(() => {}); });
    setInterval(() => { if (!document.hidden) store.sync({ minInterval: 90000 }).catch(() => {}); }, 120000);
  }
  paintScope(); paintMonth(); paintBadges();
  await start($('#view'));
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
