/**
 * accounts.js — contas bancárias, poupança e dinheiro. O saldo é sempre calculado:
 * saldo inicial + receitas − despesas − faturas pagas − valores guardados.
 */
import * as store from './store.js';
import * as P from './projections.js';
import { $, esc, icon, pill, emptyState, formModal, confirmDialog, toast, brl } from './ui.js';

const KIND = { checking: 'Conta corrente', savings: 'Poupança', cash: 'Dinheiro' };

export function openAccountModal(acc = null) {
  const editing = !!acc;
  return formModal({
    title: editing ? 'Editar conta' : 'Nova conta', submitLabel: editing ? 'Salvar' : 'Criar conta',
    values: acc || { kind: 'checking', ownerId: store.prefs.who !== 'family' ? store.prefs.who : store.state.me.id, initialBalance: 0 },
    fields: [
      { name: 'name', label: 'Nome', required: true, full: true, placeholder: 'Ex.: Nubank, Itaú, Carteira' },
      { name: 'kind', label: 'Tipo', type: 'select', options: Object.entries(KIND).map(([value, label]) => ({ value, label })), required: true },
      { name: 'ownerId', label: 'De quem é', type: 'select', options: [...store.ownerOptions(), { value: 'family', label: 'Família (conta conjunta)' }], required: true },
      { name: 'institution', label: 'Instituição', full: true },
      { name: 'initialBalance', label: 'Saldo inicial', type: 'money', positive: false, full: true, hint: 'O saldo que a conta tinha no dia em que você começou a usar o app. O saldo atual é calculado a partir dele.' }
    ],
    onSubmit: async (v, c) => {
      const payload = { name: v.name, kind: v.kind, ownerId: v.ownerId, institution: v.institution, initialBalance: v.initialBalance ?? 0 };
      if (editing) await store.update('accounts', { id: acc.id, ...payload }); else await store.create('accounts', payload);
      toast('Conta salva.', { kind: 'ok' }); c.close();
    }
  });
}

export function render(view) {
  const d = store.data(), list = d.accounts;
  const total = P.bankBalance(d);
  $('#ac-total', view).textContent = brl(total);
  $('#ac-count', view).textContent = `${list.length} conta${list.length === 1 ? '' : 's'}`;
  $('#ac-list', view).innerHTML = list.length ? list.map((a) => {
    const bal = P.accountBalance(d, a);
    return `<article class="ent"><header class="ent-h"><span class="ent-ic">${icon(a.kind === 'cash' ? 'wallet' : 'bank')}</span><div><h3>${esc(a.name)}</h3><p class="muted">${esc(KIND[a.kind])}${a.institution ? ' · ' + esc(a.institution) : ''}</p></div>${pill(store.userName(a.ownerId), a.ownerId === 'family' ? 'info' : 'neutral')}</header>
      <div class="ent-v ${bal < 0 ? 'neg' : ''}">${esc(brl(bal))}</div>
      <div class="ent-actions"><button class="btn btn-soft sm" data-edit="${esc(a.id)}">Editar</button><button class="btn btn-ghost sm" data-arch="${esc(a.id)}">Arquivar</button></div></article>`;
  }).join('') : `<div class="card">${emptyState('bank', 'Nenhuma conta cadastrada', 'Cadastre suas contas para ver o saldo disponível e lançar entradas e saídas.', '<button class="btn btn-primary" data-new>Criar conta</button>')}</div>`;

  view.onclick = async (e) => {
    if (e.target.closest('[data-new]')) return openAccountModal();
    const ed = e.target.closest('[data-edit]'), ar = e.target.closest('[data-arch]');
    if (ed) openAccountModal(store.byId('accounts', ed.dataset.edit));
    if (ar) {
      const a = store.byId('accounts', ar.dataset.arch);
      if (!(await confirmDialog({ title: 'Arquivar conta', text: `"${a.name}" deixa de aparecer nas listas. O histórico de lançamentos é mantido.`, okLabel: 'Arquivar' }))) return;
      try { await store.remove('accounts', a.id); toast('Conta arquivada.', { kind: 'ok' }); } catch (err) { toast(err.message, { kind: 'err' }); }
    }
  };
  $('#ac-new', view).addEventListener('click', () => openAccountModal());
}
