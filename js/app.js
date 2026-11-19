/**
 * app.js — inicialização: conexão, menu lateral, filtros globais (quem/mês), ações rápidas e sincronização.
 */
import * as api from './api.js';
import * as store from './store.js';
import { ROUTES, start, refresh, renderNav, renderTabbar, markActive, onRoute } from './router.js';
import { $, $$, h, esc, icon, toast, setBusy, monthLabel, currentMonth } from './ui.js';
import { addMonths } from './projections.js';
import { CONFIG } from './config.js';
import { toggleTheme, getTheme } from './theme.js';
import { familySvg } from './logo.js';
import { waveSet } from './waves.js';
import { showLoader, hideLoader, setLoaderText } from './loader.js';
import { initRipple, initOrbs } from './fx.js';

const show = (el, on) => { el.hidden = !on; };
initRipple(); initOrbs();

// ---------------------------------------------------------------- acesso: entrar, criar conta, recuperar senha
const WAVES = `<div class="waves waves-page" aria-hidden="true">${waveSet()}</div>`;
const device = () => (navigator.userAgent || '').slice(0, 60);
const anon = (action, payload) => api.call(action, payload, { conn: { url: CONFIG.API_URL || api.getConn().url, token: '' }, anon: true });

const SCREENS = {
  login: { title: 'Entrar', sub: 'Use o e-mail e a senha do seu cadastro.', btn: 'Entrar',
    fields: [['email', 'E-mail', 'email', 'username'], ['password', 'Senha', 'password', 'current-password']],
    links: [['register', 'Criar conta'], ['forgot', 'Esqueci a senha']] },
  register: { title: 'Criar conta', sub: 'Vamos enviar um código para o seu e-mail para confirmar.', btn: 'Enviar código',
    fields: [['name', 'Nome', 'text', 'name'], ['email', 'E-mail (Gmail)', 'email', 'username'], ['password', 'Senha (mín. 8 caracteres)', 'password', 'new-password'], ['confirm', 'Repita a senha', 'password', 'new-password']],
    links: [['login', 'Já tenho conta']] },
  verify: { title: 'Confirme seu e-mail', sub: 'Digite o código de 6 dígitos que enviamos. Vale por 10 minutos.', btn: 'Confirmar',
    fields: [['code', 'Código', 'text', 'one-time-code']], links: [['register', 'Voltar']] },
  forgot: { title: 'Esqueci a senha', sub: 'Informe o e-mail do cadastro e enviaremos um código.', btn: 'Enviar código',
    fields: [['email', 'E-mail', 'email', 'username']], links: [['login', 'Voltar']] },
  reset: { title: 'Nova senha', sub: 'Digite o código recebido e escolha a nova senha.', btn: 'Salvar nova senha',
    fields: [['code', 'Código', 'text', 'one-time-code'], ['password', 'Nova senha (mín. 8 caracteres)', 'password', 'new-password'], ['confirm', 'Repita a senha', 'password', 'new-password']],
    links: [['forgot', 'Pedir outro código']] }
};
let conn = { mode: 'login', email: '' };

function showConnect(message = '', mode = 'login', info = '') {
  show($('#app'), false); show($('#connect'), true);
  conn.mode = mode;
  const sc = SCREENS[mode], card = $('#connect-card');
  if (!$('#connect .waves-page')) $('#connect').insertAdjacentHTML('afterbegin', WAVES);
  const urlField = CONFIG.API_URL ? '' : `<div class="field"><label for="c-url">URL do Web App</label><input id="c-url" name="url" type="url" placeholder="https://script.google.com/macros/s/.../exec" autocomplete="off" value="${esc(api.getConn().url)}" required></div>`;
  card.innerHTML = `<form id="connect-form" novalidate class="stack">
    ${familySvg({ cls: 'logo logo-hero' })}
    <h1>${sc.title}</h1><p class="muted">${sc.sub}</p>
    <div class="form-error" id="connect-error" role="alert" ${message ? '' : 'hidden'}>${esc(message)}</div>
    ${info ? `<p class="pill pill-ok" role="status">${esc(info)}</p>` : ''}
    ${urlField}
    ${sc.fields.map(([n, l, t, ac]) => `<div class="field"><label for="c-${n}">${l}</label><input id="c-${n}" name="${n}" type="${t}" autocomplete="${ac}" ${t === 'email' ? 'autocapitalize="none" spellcheck="false"' : ''} ${n === 'code' ? 'inputmode="numeric" maxlength="6"' : ''} ${n === 'email' && conn.email ? `value="${esc(conn.email)}"` : ''} required></div>`).join('')}
    <button class="btn btn-primary btn-block" type="submit">${sc.btn}</button>
    <div class="btn-row">${sc.links.map(([m, l]) => `<button class="btn btn-ghost sm" type="button" data-go="${m}">${l}</button>`).join('')}</div>
  </form>`;
  $$('[data-go]', card).forEach((b) => { b.onclick = () => showConnect('', b.dataset.go); });
  $('#connect-form').addEventListener('submit', submitConnect);
}

async function submitConnect(e) {
  e.preventDefault();
  const f = e.target, v = (n) => (f.elements[n]?.value || '').trim(), raw = (n) => f.elements[n]?.value || '';
  const fail = (m) => { const er = $('#connect-error'); er.textContent = m; er.hidden = false; };
  if (!CONFIG.API_URL) {
    const url = v('url');
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) return fail('A URL deve começar com https://script.google.com/ e terminar em /exec.');
    api.setConn({ url, token: '' });
  }
  const btn = $('button[type=submit]', f); btn.disabled = true;
  const LOAD = { login: 'Entrando…', register: 'Enviando o código para seu e-mail…', verify: 'Confirmando seu cadastro…', forgot: 'Enviando o código…', reset: 'Salvando a nova senha…' };
  showLoader(LOAD[conn.mode] || 'Carregando…');
  try {
    const email = v('email').toLowerCase() || conn.email;
    if (email) conn.email = email;
    if (conn.mode === 'login') {
      const r = await anon('auth.login', { username: email, password: raw('password'), device: device() });
      return enter(r);
    }
    if (conn.mode === 'register') {
      if (raw('password') !== raw('confirm')) return fail('As senhas não conferem.');
      conn.pending = { name: v('name'), email, password: raw('password'), confirm: raw('confirm') };
      await anon('auth.register', conn.pending);
      return showConnect('', 'verify', `Código enviado para ${email}.`);
    }
    if (conn.mode === 'verify') {
      const r = await anon('auth.verify', { email: conn.email, code: v('code'), device: device() });
      conn.pending = null;
      if (r.pending) return showConnect('', 'login', 'Cadastro confirmado! Aguarde a aprovação de quem administra o app para entrar.');
      return enter(r);
    }
    if (conn.mode === 'forgot') {
      await anon('auth.forgot', { email });
      return showConnect('', 'reset', 'Se o e-mail estiver cadastrado, enviamos um código.');
    }
    if (conn.mode === 'reset') {
      if (raw('password') !== raw('confirm')) return fail('As senhas não conferem.');
      await anon('auth.reset', { email: conn.email, code: v('code'), password: raw('password'), confirm: raw('confirm') });
      return showConnect('', 'login', 'Senha alterada! Entre com a nova senha.');
    }
  } catch (ex) { fail(ex.message); }
  finally { btn.disabled = false; hideLoader(); }
}
async function enter(r) {
  api.setConn({ url: CONFIG.API_URL || api.getConn().url, token: r.token });
  await boot();
}

// ---------------------------------------------------------------- shell
function paintStatic() {
  $('#side-toggle').innerHTML = icon('chevR');
  $('#menu-btn').innerHTML = icon('menu');
  $('#m-prev').innerHTML = icon('chevL'); $('#m-next').innerHTML = icon('chevR');
  $('#fab-btn').innerHTML = icon('plus');
  $('#brand-logo').innerHTML = familySvg({ cls: 'logo logo-sm' });
  const themeIcons = `${icon('moon', 'i-moon')}${icon('sun', 'i-sun')}`;
  $('#theme-btn').innerHTML = themeIcons;
  $('#theme-side').innerHTML = `${icon('moon', 'ts-moon')}${icon('sun', 'ts-sun')}<span class="nav-l">Tema claro/escuro</span>`;
  $('#side-waves').innerHTML = waveSet();
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
  const side = $('#side'), mobile = () => matchMedia('(max-width: 800px)').matches;
  let pinned = false;     // fixado pelo botão de seta; sem fixar, o menu abre ao clicar e recolhe sozinho
  const setSide = (open) => { side.classList.toggle('open', open); document.body.classList.toggle('menu-open', open); $('#side-toggle').setAttribute('aria-expanded', open); $('#side-toggle').setAttribute('aria-label', open ? 'Recolher menu' : 'Expandir menu'); };
  $('#side-toggle').addEventListener('click', () => { const open = !side.classList.contains('open'); pinned = open && !mobile(); setSide(open); });
  $('#menu-btn').addEventListener('click', () => setSide(true));
  $('#side-backdrop').addEventListener('click', () => setSide(false));
  // 1º clique em qualquer ponto do menu recolhido só EXPANDE (mostra os nomes); o seguinte navega
  side.addEventListener('click', (e) => {
    if (mobile() || side.classList.contains('open') || e.target.closest('#side-toggle')) return;
    e.preventDefault(); e.stopPropagation(); setSide(true);
  }, true);
  $('#nav').addEventListener('click', (e) => {
    if (!e.target.closest('a')) return;
    if (mobile()) setSide(false); else if (!pinned) setTimeout(() => setSide(false), 260);
  });
  document.addEventListener('click', (e) => { if (!mobile() && !pinned && side.classList.contains('open') && !e.target.closest('#side')) setSide(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && side.classList.contains('open') && !document.body.classList.contains('modal-open')) { pinned = false; setSide(false); } });

  const doTheme = () => { const t = toggleTheme(); toast(t === 'dark' ? 'Tema escuro ligado.' : 'Tema claro ligado.', { kind: 'info', ms: 1800 }); };
  $('#theme-btn').addEventListener('click', doTheme);
  $('#theme-side').addEventListener('click', doTheme);
  renderTabbar($('#tabbar'));
  $('#tabbar').addEventListener('click', (e) => { if (e.target.closest('[data-more]')) setSide(true); });

  $('#scope').addEventListener('change', (e) => store.setWho(e.target.value));
  $('#m-prev').addEventListener('click', () => store.setMonth(addMonths(store.prefs.month, -1)));
  $('#m-next').addEventListener('click', () => store.setMonth(addMonths(store.prefs.month, 1)));
  $('#m-label').addEventListener('click', () => store.setMonth(currentMonth()));
  $('#sync-btn').addEventListener('click', async () => {
    try { await store.sync({ force: true }); } catch { /* o aviso de erro já aparece na lateral */ }
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
      if (b.dataset.act === 'payslip') (await import('./payslips.js')).openPayslipEditor();
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
  showLoader('Carregando seus dados…');
  try { await store.load(); }
  catch (e) {
    hideLoader(true);
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
  setLoaderText('Montando seu painel…');
  try { await start($('#view')); } finally { hideLoader(); }
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
