/**
 * settings.js — conexão, nome, categorias, apps monitorados nas notificações e backup.
 */
import * as api from './api.js';
import * as store from './store.js';
import { $, esc, confirmDialog, toast } from './ui.js';
import { CONFIG } from './config.js';
import { openCategoryModal, renderManager } from './categories.js';

function renderApps(view) {
  const apps = store.state.settings.monitoredApps || [];
  $('#st-apps', view).innerHTML = apps.length ? apps.map((a, i) => `<li class="app-i"><span><b>${esc(a.name)}</b>${a.package ? `<small class="muted"> ${esc(a.package)}</small>` : ''}</span><button class="btn btn-ghost sm" data-rm="${i}">Remover</button></li>`).join('') : '<li class="muted">Nenhum app cadastrado.</li>';
}
async function saveApps(apps) { await store.saveSettings({ monitoredApps: apps }); }

const STATUS = { ativo: ['Ativo', 'pill-ok'], pendente: ['Aguardando aprovação', 'pill-warn'], inativo: ['Desativado', 'pill-bad'] };
async function renderUsers(view) {
  const card = $('#st-users-card', view);
  if (store.state.me?.role !== 'admin') return;
  const draw = (list) => {
    card.hidden = false;
    $('#st-users', view).innerHTML = list.map((u) => `<li class="app-i"><span><b>${esc(u.nome)}</b> <small class="muted">${esc(u.usuario)} · ${u.perfil}</small> <span class="pill ${STATUS[u.status]?.[1] || ''}">${STATUS[u.status]?.[0] || esc(u.status)}</span></span><span class="btn-row">${u.status === 'ativo' ? `<button class="btn btn-ghost sm" data-st="${u.id}|inativo">Desativar</button>` : `<button class="btn btn-soft sm" data-st="${u.id}|ativo">${u.status === 'pendente' ? 'Aprovar' : 'Reativar'}</button>`}</span></li>`).join('');
  };
  try { draw(await api.call('user.admin.list', {}, { silent: true })); } catch { return; }
  $('#st-users', view).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-st]'); if (!b) return;
    const [id, status] = b.dataset.st.split('|');
    try { draw(await api.call('user.admin.set', { id, status }, { feedback: { start: 'Atualizando acesso…', done: 'Acesso atualizado' } })); } catch (err) { /* o aviso de erro já aparece na lateral */ }
  });
}

export function render(view) {
  renderUsers(view);
  const me = store.state.me, conn = api.getConn();
  $('#st-name', view).value = me?.name || '';
  $('#st-url', view).textContent = conn.url.replace(/(\/s\/[^/]{6})[^/]+/, '$1…');
  $('#st-ver', view).textContent = `${CONFIG.APP_NAME} ${CONFIG.VERSION}`;
  renderManager($('#st-cats', view));
  renderApps(view);

  $('#st-name-form', view).addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#st-name', view).value.trim();
    if (!name) return toast('Informe um nome.', { kind: 'warn' });
    try { await store.renameMe(name); toast('Nome atualizado.', { kind: 'ok' }); } catch (err) { toast(err.message, { kind: 'err' }); }
  });
  $('#st-newcat', view).addEventListener('click', () => openCategoryModal());

  $('#st-app-form', view).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, name = f.elements.name.value.trim(), pkg = f.elements.package.value.trim();
    if (!name) return;
    try { await saveApps([...(store.state.settings.monitoredApps || []), { name, package: pkg }]); f.reset(); toast('App adicionado.', { kind: 'ok' }); } catch (err) { toast(err.message, { kind: 'err' }); }
  });
  $('#st-apps', view).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    try { await saveApps((store.state.settings.monitoredApps || []).filter((_, i) => i !== Number(b.dataset.rm))); } catch (err) { toast(err.message, { kind: 'err' }); }
  });

  $('#st-backup', view).addEventListener('click', () => {
    const { accounts, cards, categories, fixedBills, goals, settings, transactions, users } = store.state;
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), version: CONFIG.VERSION, users: users.map(({ id, name }) => ({ id, name })), accounts, cards, categories, fixedBills, goals, settings, transactions }, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `nossa-financa-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('#st-sync', view).addEventListener('click', async () => { try { await store.sync({ force: true }); toast('Dados sincronizados.', { kind: 'ok' }); } catch (e) { toast(e.message, { kind: 'err' }); } });
  $('#st-logout', view).addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Sair deste aparelho', text: 'Sua sessão é encerrada. Seus dados continuam na planilha.', okLabel: 'Sair', danger: true }))) return;
    try { await api.call('auth.logout', {}, { silent: true }); } catch { /* sessão já expirada */ }
    api.clearConn(); location.reload();
  });
}
