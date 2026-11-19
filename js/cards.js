/**
 * cards.js — cartão alimentação (contabilizado à parte) e cartões de crédito (limite e faturas).
 */
import * as store from './store.js';
import * as P from './projections.js';
import { $, esc, icon, pill, emptyState, formModal, confirmDialog, toast, brl, fmtDate, monthLabel, uuid } from './ui.js';
import { bar } from './charts.js';
import { openTxModal } from './transactions.js';

export function openCardModal(card = null, kind = 'credit') {
  const editing = !!card;
  return formModal({
    title: editing ? 'Editar cartão' : 'Novo cartão', submitLabel: editing ? 'Salvar' : 'Criar cartão',
    values: card || { kind, ownerId: store.prefs.who !== 'family' ? store.prefs.who : store.state.me.id, initialBalance: 0 },
    fields: [
      { name: 'kind', label: 'Tipo', type: 'segmented', full: true, options: [{ value: 'credit', label: 'Crédito' }, { value: 'food', label: 'Alimentação' }] },
      { name: 'name', label: 'Nome', required: true, full: true, placeholder: 'Ex.: Nubank, Alelo, VR' },
      { name: 'ownerId', label: 'De quem é', type: 'select', options: store.ownerOptions(), required: true, full: true },
      { name: 'limit', label: 'Limite', type: 'money', showIf: (v) => v.kind === 'credit', positive: false },
      { name: 'closingDay', label: 'Dia do fechamento', type: 'number', min: 1, max: 31, required: true, showIf: (v) => v.kind === 'credit' },
      { name: 'dueDay', label: 'Dia do vencimento', type: 'number', min: 1, max: 31, required: true, showIf: (v) => v.kind === 'credit' },
      { name: 'initialBalance', label: 'Saldo inicial do cartão', type: 'money', positive: false, showIf: (v) => v.kind === 'food', hint: 'Saldo que havia no dia em que você começou a usar o app.' }
    ],
    onSubmit: async (v, c) => {
      const base = { name: v.name, kind: v.kind, ownerId: v.ownerId };
      const payload = v.kind === 'credit' ? { ...base, limit: v.limit ?? 0, closingDay: v.closingDay, dueDay: v.dueDay } : { ...base, initialBalance: v.initialBalance ?? 0 };
      if (editing) await store.update('cards', { id: card.id, ...payload }); else await store.create('cards', payload);
      toast('Cartão salvo.', { kind: 'ok' }); c.close();
    }
  });
}

function openPayInvoice(card) {
  const d = store.data(), cur = P.ym(store.today());
  const months = [P.addMonths(cur, -1), cur, P.addMonths(cur, 1)].map((m) => P.invoiceInfo(d, card, m)).filter((i) => i.open > 0);
  if (!months.length) return toast('Nenhuma fatura em aberto neste cartão.', { kind: 'info' });
  const accounts = store.activeOf('accounts');
  if (!accounts.length) return toast('Cadastre uma conta para pagar a fatura.', { kind: 'warn' });
  const clientId = uuid();   // repetir o envio não duplica o pagamento
  return formModal({
    title: `Pagar fatura · ${card.name}`, submitLabel: 'Registrar pagamento',
    values: { refMonth: months[0].month, amount: months[0].open, date: store.today(), accountId: accounts[0].id },
    fields: [
      { name: 'refMonth', label: 'Fatura', type: 'select', required: true, full: true, options: months.map((i) => ({ value: i.month, label: `${monthLabel(i.month)} · vence ${fmtDate(i.due)} · ${brl(i.open)}` })) },
      { name: 'amount', label: 'Valor pago', type: 'money', required: true },
      { name: 'date', label: 'Data', type: 'date', required: true },
      { name: 'accountId', label: 'Paga com a conta', type: 'select', required: true, full: true, options: accounts.map((a) => ({ value: a.id, label: a.name })) }
    ],
    onChange: (name, c) => { if (name === 'refMonth') c.set('amount', months.find((i) => i.month === c.values().refMonth)?.open); },
    onSubmit: async (v, c) => {
      const owner = card.ownerId === 'family' ? store.state.me.id : card.ownerId;
      await store.create('transactions', { type: 'card_payment', cardId: card.id, accountId: v.accountId, refMonth: v.refMonth, amount: v.amount, date: v.date, description: `Fatura ${card.name} · ${monthLabel(v.refMonth)}`, ownerId: owner, origin: 'manual', clientId });
      toast('Fatura registrada. O saldo da conta foi atualizado.', { kind: 'ok' }); c.close();
    }
  });
}

function foodCard(d, c, month) {
  const bal = P.foodBalance(d, c), tot = d.transactions.filter((t) => t.cardId === c.id && P.ym(t.date) === month);
  const inn = tot.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0), out = tot.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  return `<article class="ent ent-food"><header class="ent-h"><span class="ent-ic">${icon('wallet')}</span><div><h3>${esc(c.name)}</h3><p class="muted">Cartão alimentação · só paga comida</p></div>${pill(store.userName(c.ownerId))}</header>
    <div class="ent-v ${bal < 0 ? 'neg' : ''}">${esc(brl(bal))}</div>
    <p class="muted">${esc(monthLabel(month))}: entrou ${esc(brl(inn))} · gastou ${esc(brl(out))}</p>
    <div class="ent-actions"><button class="btn btn-primary sm" data-credit="${esc(c.id)}">Adicionar saldo</button><button class="btn btn-soft sm" data-spend="${esc(c.id)}">Lançar gasto</button><button class="btn btn-soft sm" data-edit="${esc(c.id)}">Editar</button><button class="btn btn-ghost sm" data-arch="${esc(c.id)}">Arquivar</button></div></article>`;
}

function creditCard(d, c) {
  const today = store.today(), cur = P.ym(today), used = P.creditUsed(d, c), ratio = c.limit > 0 ? used / c.limit : 0;
  const invs = [P.addMonths(cur, -1), cur, P.addMonths(cur, 1)].map((m) => P.invoiceInfo(d, c, m)).filter((i) => i.charged > 0 || i.open > 0);
  const rows = invs.map((i) => `<li><span>${esc(monthLabel(i.month))}<small class="muted"> · vence ${esc(fmtDate(i.due))}</small></span><span>${i.open === 0 ? pill('Paga', 'ok') : (i.due < today ? pill('Vencida', 'bad') : pill('Em aberto', 'warn'))} <b>${esc(brl(i.open || i.charged))}</b></span></li>`).join('');
  return `<article class="ent"><header class="ent-h"><span class="ent-ic">${icon('card')}</span><div><h3>${esc(c.name)}</h3><p class="muted">Fecha dia ${c.closingDay} · vence dia ${c.dueDay}</p></div>${pill(store.userName(c.ownerId))}</header>
    <div class="ent-v">${esc(brl(used))}<small class="muted"> usados${c.limit ? ` de ${esc(brl(c.limit))}` : ''}</small></div>
    ${c.limit ? bar(ratio, ratio > 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok') + `<p class="muted">Disponível: ${esc(brl(Math.max(0, c.limit - used)))}</p>` : ''}
    ${rows ? `<ul class="mini-list">${rows}</ul>` : '<p class="muted">Sem faturas com lançamentos.</p>'}
    <div class="ent-actions"><button class="btn btn-primary sm" data-pay="${esc(c.id)}">Pagar fatura</button><button class="btn btn-soft sm" data-spend="${esc(c.id)}">Lançar compra</button><button class="btn btn-soft sm" data-edit="${esc(c.id)}">Editar</button><button class="btn btn-ghost sm" data-arch="${esc(c.id)}">Arquivar</button></div></article>`;
}

export function render(view) {
  const d = store.data(), food = d.cards.filter((c) => c.kind === 'food'), credit = d.cards.filter((c) => c.kind === 'credit');
  $('#cd-food', view).innerHTML = food.length ? food.map((c) => foodCard(d, c, store.prefs.month)).join('') : `<div class="card">${emptyState('wallet', 'Nenhum cartão alimentação', 'Cadastre o seu para acompanhar o saldo separado do dinheiro das contas.', '<button class="btn btn-primary" data-newkind="food">Cadastrar cartão alimentação</button>')}</div>`;
  $('#cd-credit', view).innerHTML = credit.length ? credit.map((c) => creditCard(d, c)).join('') : `<div class="card">${emptyState('card', 'Nenhum cartão de crédito', 'Cadastre para acompanhar limite e faturas.', '<button class="btn btn-primary" data-newkind="credit">Cadastrar cartão de crédito</button>')}</div>`;

  view.onclick = async (e) => {
    const g = (a) => e.target.closest(`[data-${a}]`)?.dataset[a];
    if (g('newkind')) return openCardModal(null, g('newkind'));
    if (g('edit')) return openCardModal(store.byId('cards', g('edit')));
    if (g('pay')) return openPayInvoice(store.byId('cards', g('pay')));
    if (g('credit')) { const c = store.byId('cards', g('credit')); return openTxModal({ type: 'income', cardId: c.id, description: 'Crédito do benefício', ownerId: c.ownerId }, { title: 'Adicionar saldo ao cartão' }); }
    if (g('spend')) { const c = store.byId('cards', g('spend')); return openTxModal({ type: 'expense', cardId: c.id, ownerId: c.ownerId === 'family' ? undefined : c.ownerId }); }
    if (g('arch')) {
      const c = store.byId('cards', g('arch'));
      if (!(await confirmDialog({ title: 'Arquivar cartão', text: `"${c.name}" deixa de aparecer nas listas. O histórico é mantido.`, okLabel: 'Arquivar' }))) return;
      try { await store.remove('cards', c.id); toast('Cartão arquivado.', { kind: 'ok' }); } catch (err) { toast(err.message, { kind: 'err' }); }
    }
  };
  $('#cd-new', view).addEventListener('click', () => openCardModal());
}
