/**
 * notifications.js — fila de confirmação das notificações financeiras.
 * As notificações chegam pelo app auxiliar (Android) ou coladas aqui; o backend identifica
 * valor, estabelecimento, instituição, tipo e categoria sugerida. Nada vira lançamento sem confirmação.
 */
import * as api from './api.js';
import * as store from './store.js';
import { $, esc, drop, pill, emptyState, formModal, toast, brl, uuid } from './ui.js';
import { openTxModal } from './transactions.js';

let tab = 'pending';
const TABS = [['pending', 'Para confirmar'], ['rejected', 'Recusadas'], ['confirmed', 'Confirmadas']];

const localDate = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? store.today() : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const when = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };

function bump(from, to) {
  const c = { ...store.state.inboxCounts };
  if (c[from] !== undefined) c[from] = Math.max(0, c[from] - 1);
  if (c[to] !== undefined) c[to] += 1;
  store.setInboxCounts(c);
}
async function resolve(n, status, transactionId = '') {
  await api.call('inbox.resolve', { id: n.id, status, transactionId }, { feedback: { start: status === 'confirmed' ? 'Confirmando notificação…' : 'Guardando na lista reserva…', done: status === 'confirmed' ? 'Notificação confirmada' : 'Movida para a lista reserva' } });
  bump(n.status, status);
}

function item(n) {
  const cat = store.categoryOf(n.suggestedCategoryId), inc = n.type === 'income';
  const actions = n.status === 'pending' ? `<button class="btn btn-primary sm" data-ok="${esc(n.id)}">Confirmar</button><button class="btn btn-ghost sm" data-no="${esc(n.id)}">Recusar</button>`
    : n.status === 'rejected' ? `<button class="btn btn-soft sm" data-back="${esc(n.id)}">Reconsiderar</button>` : pill('Lançada no extrato', 'ok');
  return `<article class="notif"><header><span class="notif-app">${esc(n.app || 'Notificação')}${n.institution && n.institution !== n.app ? ' · ' + esc(n.institution) : ''}</span><time class="muted small">${esc(when(n.receivedAt))}</time></header>
    <blockquote>${esc(n.rawText)}</blockquote>
    <div class="notif-parsed">${n.amount === null || n.amount === '' ? pill('Valor não identificado', 'warn') : `<b class="notif-amt ${inc ? 'pos' : 'neg'}">${inc ? '+' : '−'} ${esc(brl(n.amount))}</b>`}${pill(inc ? 'Entrada' : 'Saída', inc ? 'ok' : 'neutral')}${n.merchant ? `<span class="notif-m">${esc(n.merchant)}</span>` : ''}${cat ? `<span class="notif-c">${drop(cat.icon, cat.color, 'sm')} ${esc(cat.name)}</span>` : ''}</div>
    <div class="notif-a">${actions}</div></article>`;
}

async function loadList(view) {
  const box = $('#nt-list', view);
  box.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
  try {
    const list = await api.call('inbox.list', { status: tab }, { retries: 1 });
    box.innerHTML = list.length ? list.map(item).join('') : emptyState('bell', tab === 'pending' ? 'Nada esperando confirmação' : 'Nada por aqui', tab === 'pending' ? 'Quando uma notificação financeira chegar, ela aparece aqui para você confirmar.' : '');
    box.onclick = async (e) => {
      const g = (a) => e.target.closest(`[data-${a}]`)?.dataset[a];
      const find = (id) => list.find((x) => x.id === id);
      try {
        if (g('ok')) {
          const n = find(g('ok'));
          openTxModal({ type: n.type === 'income' ? 'income' : 'expense', amount: n.amount === '' ? null : n.amount, date: localDate(n.receivedAt), description: n.merchant || n.app || '', merchant: n.merchant, categoryId: n.suggestedCategoryId, ownerId: n.ownerId, origin: 'notification' },
            { title: 'Confirmar lançamento', onSaved: async (rec) => { try { await resolve(n, 'confirmed', rec.id); } catch (err) { toast(err.message, { kind: 'err' }); } loadList(view); } });
        }
        if (g('no')) { await resolve(find(g('no')), 'rejected'); toast('Recusada. Ela fica na aba "Recusadas" caso você precise.', { kind: 'info' }); loadList(view); renderTabs(view); }
        if (g('back')) { await resolve(find(g('back')), 'pending'); toast('Voltou para a fila.', { kind: 'ok' }); loadList(view); renderTabs(view); }
      } catch (err) { toast(err.message, { kind: 'err' }); }
    };
  } catch (e) { box.innerHTML = emptyState('bell', 'Não consegui carregar', e.message, '<button class="btn btn-primary" data-retry>Tentar de novo</button>'); $('[data-retry]', box)?.addEventListener('click', () => loadList(view)); }
}

function renderTabs(view) {
  const c = store.state.inboxCounts;
  $('#nt-tabs', view).innerHTML = TABS.map(([k, l]) => `<button type="button" class="tab ${k === tab ? 'on' : ''}" data-tab="${k}">${l}${c[k] ? ` <span class="count">${c[k]}</span>` : ''}</button>`).join('');
}

export function render(view) {
  renderTabs(view);
  $('#nt-tabs', view).addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; renderTabs(view); loadList(view); });
  $('#nt-paste', view).addEventListener('click', () => openPasteModal());
  const apps = store.state.settings.monitoredApps || [];
  $('#nt-apps', view).innerHTML = apps.length ? apps.map((a) => `<li>${esc(a.name)}${a.package ? ` <small class="muted">${esc(a.package)}</small>` : ''}</li>`).join('') : '<li class="muted">Nenhum app na lista. Cadastre em Configurações.</li>';
  return loadList(view);
}

/** Cola o texto de uma notificação (ou de um SMS do banco) para ir à fila de confirmação. */
export function openPasteModal() {
  return formModal({
    title: 'Colar notificação', submitLabel: 'Enviar para a fila', values: { ownerId: store.state.me.id },
    fields: [
      { name: 'rawText', label: 'Texto da notificação', type: 'textarea', required: true, full: true, max: 1000, placeholder: 'Ex.: Compra aprovada no cartão final 1234 em PADARIA XYZ no valor de R$ 45,90' },
      { name: 'app', label: 'Banco ou aplicativo', placeholder: 'Ex.: Nubank', hint: 'Ajuda a identificar a instituição.' },
      { name: 'ownerId', label: 'De quem é', type: 'select', options: store.ownerOptions(), required: true }
    ],
    onSubmit: async (v, c) => {
      const n = await api.call('inbox.add', { rawText: v.rawText, app: v.app, ownerId: v.ownerId, receivedAt: new Date().toISOString() }, { feedback: { start: 'Lendo a notificação…', done: 'Notificação adicionada à fila' } });
      if (n.duplicate) { toast('Essa notificação já estava na fila.', { kind: 'info' }); c.close(); return; }
      store.setInboxCounts({ ...store.state.inboxCounts, pending: store.state.inboxCounts.pending + 1 });
      toast(n.amount ? `Identifiquei ${brl(n.amount)}. Confirme na fila.` : 'Enviada. Não achei o valor, você pode informar ao confirmar.', { kind: 'ok' });
      c.close();
      (await import('./router.js')).navigate('inbox');
    }
  });
}
