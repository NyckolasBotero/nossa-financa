/**
 * fixedbills.js — contas fixas: cadastro, status do mês (paga, pendente, atrasada) e histórico de atrasos.
 * "Pagar" abre o lançamento já preenchido e vinculado à conta; é o lançamento que marca como paga.
 */
import * as store from './store.js';
import * as P from './projections.js';
import { $, esc, drop, pill, emptyState, formModal, confirmDialog, toast, brl, fmtDate, monthLabel } from './ui.js';
import { openTxModal } from './transactions.js';

export function openBillModal(bill = null) {
  const editing = !!bill;
  const sources = store.sourceOptions({ type: 'expense' });
  return formModal({
    title: editing ? 'Editar conta fixa' : 'Nova conta fixa', submitLabel: editing ? 'Salvar' : 'Criar conta fixa',
    values: bill ? { ...bill, source: bill.accountId ? `a:${bill.accountId}` : bill.cardId ? `c:${bill.cardId}` : '' }
      : { ownerId: store.prefs.who !== 'family' ? store.prefs.who : store.state.me.id, scope: 'shared', startMonth: store.prefs.month },
    fields: [
      { name: 'name', label: 'Nome', required: true, full: true, placeholder: 'Ex.: Aluguel, Internet, Escola' },
      { name: 'amount', label: 'Valor', type: 'money', required: true },
      { name: 'dueDay', label: 'Vence todo dia', type: 'number', min: 1, max: 31, required: true },
      { name: 'categoryId', label: 'Categoria', type: 'select', options: store.categoryOptions('expense'), placeholder: 'Sem categoria' },
      { name: 'source', label: 'Paga com', type: 'select', options: sources, placeholder: 'Escolho na hora de pagar' },
      { name: 'ownerId', label: 'Responsável', type: 'select', options: store.ownerOptions(), required: true },
      { name: 'scope', label: 'Tipo de gasto', type: 'segmented', options: [{ value: 'individual', label: 'Individual' }, { value: 'shared', label: 'Compartilhado' }] },
      { name: 'startMonth', label: 'Vale a partir de', type: 'month', hint: 'Meses anteriores não contam como atrasados.' },
      { name: 'endMonth', label: 'Vale até', type: 'month', hint: 'Deixe vazio se não tem fim.' }
    ],
    onSubmit: async (v, c) => {
      const [kind, id] = (v.source || ':').split(':');
      const payload = { name: v.name, amount: v.amount, dueDay: v.dueDay, categoryId: v.categoryId || '', accountId: kind === 'a' ? id : '', cardId: kind === 'c' ? id : '', ownerId: v.ownerId, scope: v.scope, startMonth: v.startMonth || '', endMonth: v.endMonth || '' };
      if (editing) await store.update('fixedBills', { id: bill.id, ...payload }); else await store.create('fixedBills', payload);
      toast('Conta fixa salva.', { kind: 'ok' }); c.close();
    }
  });
}

export function payBill(bill) {
  return openTxModal({ type: 'expense', amount: bill.amount, date: store.today(), description: bill.name, categoryId: bill.categoryId, accountId: bill.accountId, cardId: bill.cardId, ownerId: bill.ownerId, scope: bill.scope, fixedBillId: bill.id, origin: 'fixed' }, { title: `Pagar · ${bill.name}` });
}

const STATUS = { paid: ['Paga', 'ok'], pending: ['A vencer', 'info'], late: ['Atrasada', 'bad'] };

export function render(view) {
  const d = store.data(), today = store.today(), month = store.prefs.month;
  const rows = P.billsForMonth(d, month, today);
  const sum = (f) => rows.filter(f).reduce((s, x) => s + x.bill.amount, 0);
  const k = (l, v, cls = '') => `<div class="kpi mini"><span class="kpi-l">${l}</span><span class="kpi-v ${cls}">${esc(brl(v))}</span></div>`;
  $('#fx-summary', view).innerHTML = k('Gasto fixo do mês', sum(() => true)) + k('Pago', sum((x) => x.status === 'paid'), 'pos') + k('A vencer', sum((x) => x.status === 'pending')) + k('Atrasado', sum((x) => x.status === 'late'), 'neg');
  $('#fx-month', view).textContent = monthLabel(month);

  $('#fx-list', view).innerHTML = rows.length ? rows.map(({ bill, status, due, tx, lateDays }) => {
    const cat = store.categoryOf(bill.categoryId), h = P.lateHistory(d, bill, today), [label, tone] = STATUS[status];
    const detail = status === 'paid' ? `Paga em ${fmtDate(tx.date)}${lateDays ? ` (${lateDays} dia${lateDays > 1 ? 's' : ''} de atraso)` : ''}` : status === 'late' ? `Venceu em ${fmtDate(due)} · ${lateDays} dia${lateDays > 1 ? 's' : ''} de atraso` : `Vence em ${fmtDate(due)}`;
    return `<article class="bill st-${status}">${drop(cat?.icon || '📅', cat?.color)}
      <div class="bill-main"><h3>${esc(bill.name)}</h3><p class="muted">${esc(detail)} · ${esc(store.userName(bill.ownerId))}</p>
      ${h.counted >= 3 && h.late > 0 ? `<p class="hint-warn">Atrasou em ${h.late} dos últimos ${h.counted} meses</p>` : ''}</div>
      <div class="bill-r"><b>${esc(brl(bill.amount))}</b>${pill(label, tone)}</div>
      <div class="bill-a">${status === 'paid' ? '' : `<button class="btn btn-primary sm" data-pay="${esc(bill.id)}">Pagar</button>`}<button class="btn btn-soft sm" data-edit="${esc(bill.id)}">Editar</button><button class="btn btn-ghost sm" data-arch="${esc(bill.id)}">Arquivar</button></div></article>`;
  }).join('') : `<div class="card">${emptyState('calendar', 'Nenhuma conta fixa neste mês', 'Cadastre aluguel, internet, escola... Elas entram na previsão de gastos e nos alertas de atraso.', '<button class="btn btn-primary" data-new>Cadastrar conta fixa</button>')}</div>`;

  view.onclick = async (e) => {
    const g = (a) => e.target.closest(`[data-${a}]`)?.dataset[a];
    if (e.target.closest('[data-new]')) return openBillModal();
    if (g('pay')) return payBill(store.byId('fixedBills', g('pay')));
    if (g('edit')) return openBillModal(store.byId('fixedBills', g('edit')));
    if (g('arch')) {
      const b = store.byId('fixedBills', g('arch'));
      if (!(await confirmDialog({ title: 'Arquivar conta fixa', text: `"${b.name}" deixa de ser prevista. Lançamentos já feitos continuam no extrato.`, okLabel: 'Arquivar' }))) return;
      try { await store.remove('fixedBills', b.id); toast('Conta fixa arquivada.', { kind: 'ok' }); } catch (err) { toast(err.message, { kind: 'err' }); }
    }
  };
  $('#fx-new', view).addEventListener('click', () => openBillModal());
}
