/**
 * fixedbills.js — contas fixas (saídas) e receitas fixas (entradas): cadastro, status do mês e histórico de atrasos.
 * "Pagar"/"Receber" abre o lançamento já preenchido e vinculado; é o lançamento que marca como paga/recebida.
 */
import * as store from './store.js';
import * as P from './projections.js';
import { $, $$, esc, drop, pill, emptyState, formModal, confirmDialog, toast, brl, fmtDate, monthLabel } from './ui.js';
import { openTxModal, askMethod } from './transactions.js';
import { askCategory } from './categories.js';
import { renderVariableChart } from './varchart.js';

const T = {
  expense: { new: 'Nova conta', edit: 'Editar conta', create: 'Criar conta', day: 'Vence todo dia', src: 'Conta ou cartão', method: 'Paga com', owner: 'Responsável', saved: 'Conta salva.', hint: 'Meses anteriores não contam como atrasados.',
    ph: 'Ex.: Aluguel, Internet, Água, Luz', act: 'Pagar', cat: 'Categoria' },
  income: { new: 'Nova receita fixa', edit: 'Editar receita fixa', create: 'Criar receita fixa', day: 'Cai todo dia', src: 'Cai em qual conta', method: 'Recebida via', owner: 'De quem é', saved: 'Receita fixa salva.', hint: 'Meses anteriores não contam como atrasadas.',
    ph: 'Ex.: Salário, Aluguel recebido, Pensão', act: 'Receber', cat: 'Categoria' }
};

export function openBillModal(bill = null, kindArg = 'expense') {
  const editing = !!bill, kind = bill ? P.billKind(bill) : kindArg, t = T[kind];
  const sources = store.sourceOptions({ type: kind });
  return formModal({
    title: editing ? t.edit : t.new, submitLabel: editing ? 'Salvar' : t.create,
    values: bill ? { ...bill, billType: bill.billType || 'fixed', source: bill.accountId ? `a:${bill.accountId}` : bill.cardId ? `c:${bill.cardId}` : '' }
      : { ownerId: store.prefs.who !== 'family' ? store.prefs.who : store.state.me.id, scope: kind === 'income' ? 'individual' : 'shared', billType: 'fixed', startMonth: store.prefs.month },
    fields: [
      { name: 'name', label: 'Nome', required: true, full: true, placeholder: t.ph },
      ...(kind === 'expense' ? [{ name: 'billType', label: 'Essa conta é', type: 'segmented', full: true, options: [{ value: 'fixed', label: 'Fixa (sempre igual)' }, { value: 'variable', label: 'Variável (muda todo mês)' }] }] : []),
      { name: 'amount', label: kind === 'expense' ? 'Valor (estimado, se variável)' : 'Valor', type: 'money', required: true },
      { name: 'dueDay', label: t.day, type: 'number', min: 1, max: 31, required: true },
      { name: 'categoryId', label: t.cat, type: 'select', options: store.categoryOptions(kind, { withNew: true }), placeholder: 'Sem categoria' },
      { name: 'source', label: t.src, type: 'select', options: sources, placeholder: kind === 'income' ? 'Escolho na hora de receber' : 'Escolho na hora de pagar' },
      { name: 'method', label: t.method, type: 'select', options: store.methodOptions(), placeholder: 'Não informar' },
      { name: 'ownerId', label: t.owner, type: 'select', options: store.ownerOptions(), required: true },
      { name: 'scope', label: kind === 'income' ? 'Tipo de receita' : 'Tipo de gasto', type: 'segmented', options: [{ value: 'individual', label: 'Individual' }, { value: 'shared', label: 'Compartilhado' }] },
      { name: 'startMonth', label: 'Vale a partir de', type: 'month', hint: t.hint },
      { name: 'endMonth', label: 'Vale até', type: 'month', hint: 'Deixe vazio se não tem fim.' }
    ],
    onChange: async (name, c) => {
      if (name === 'categoryId' && c.values().categoryId === store.NEW_CAT) {
        c.set('categoryId', '');
        const id = await askCategory(kind);
        if (id) { c.setOptions('categoryId', store.categoryOptions(kind, { withNew: true }), 'Sem categoria'); c.set('categoryId', id); }
        return;
      }
      if (name !== 'method' || c.values().method !== store.NEW_METHOD) return;
      c.set('method', '');
      const made = await askMethod();
      if (made) { c.setOptions('method', store.methodOptions(), 'Não informar'); c.set('method', made); }
    },
    onSubmit: async (v, c) => {
      const [k, id] = (v.source || ':').split(':');
      const payload = { name: v.name, amount: v.amount, dueDay: v.dueDay, categoryId: v.categoryId && v.categoryId !== store.NEW_CAT ? v.categoryId : '', billType: kind === 'expense' ? v.billType || 'fixed' : 'fixed', accountId: k === 'a' ? id : '', cardId: k === 'c' ? id : '', ownerId: v.ownerId, scope: v.scope, startMonth: v.startMonth || '', endMonth: v.endMonth || '', method: v.method && v.method !== store.NEW_METHOD ? v.method : '', kind };
      if (editing) await store.update('fixedBills', { id: bill.id, ...payload }); else await store.create('fixedBills', payload);
      toast(t.saved, { kind: 'ok' }); c.close();
    }
  });
}

export function payBill(bill) {   // para conta variável, `bill.amount` já vem com a média dos meses anteriores
  const kind = P.billKind(bill);
  return openTxModal({ type: kind, amount: bill.amount, date: store.today(), description: bill.name, categoryId: bill.categoryId, accountId: bill.accountId, cardId: bill.cardId, ownerId: bill.ownerId, scope: bill.scope, fixedBillId: bill.id, method: bill.method || '', origin: 'fixed' },
    { title: `${T[kind].act} · ${bill.name}${P.isVariable(bill) ? ' (confira o valor deste mês)' : ''}` });
}

const STATUS = {
  expense: { paid: ['Paga', 'ok'], pending: ['A vencer', 'info'], late: ['Atrasada', 'bad'] },
  income: { paid: ['Recebida', 'ok'], pending: ['A receber', 'info'], late: ['Atrasada', 'bad'] }
};
let tab = 'expense';

export function render(view) {
  const d = store.data(), today = store.today(), month = store.prefs.month, kind = tab, income = kind === 'income', t = T[kind];
  const rows = P.billsForMonth(d, month, today, kind);
  const sum = (f) => rows.filter(f).reduce((s, x) => s + x.bill.amount, 0);
  const k = (l, v, cls = '') => `<div class="kpi mini"><span class="kpi-l">${l}</span><span class="kpi-v ${cls}">${esc(brl(v))}</span></div>`;
  $('#fx-summary', view).innerHTML = income
    ? k('Receita fixa do mês', sum(() => true), 'pos') + k('Recebido', sum((x) => x.status === 'paid'), 'pos') + k('A receber', sum((x) => x.status === 'pending')) + k('Atrasado', sum((x) => x.status === 'late'), 'neg')
    : k('Gasto fixo do mês', sum(() => true)) + k('Pago', sum((x) => x.status === 'paid'), 'pos') + k('A vencer', sum((x) => x.status === 'pending')) + k('Atrasado', sum((x) => x.status === 'late'), 'neg');
  $('#fx-title', view).textContent = income ? 'Receitas fixas' : 'Contas F.V';
  $('#fx-sub', view).textContent = income ? `Entradas previstas de ${monthLabel(month)}. Receber cria o lançamento e marca como recebida; elas entram na projeção dos próximos meses.` : `Fixas e variáveis de ${monthLabel(month)}. Nas variáveis, informe o valor do mês ao pagar.`;
  $('#fx-new', view).textContent = t.new;
  $$('#fx-tabs input', view).forEach((r) => { r.checked = r.value === kind; });

  $('#fx-var-card', view).hidden = income;
  if (!income) renderVariableChart($('#fx-var', view));
  $('#fx-list', view).innerHTML = rows.length ? rows.map(({ bill, status, due, tx, lateDays, avg, avgCount }) => {
    const cat = store.categoryOf(bill.categoryId), h = P.lateHistory(d, bill, today), [label, tone] = STATUS[kind][status];
    const done = income ? 'Recebida' : 'Paga', late = income ? 'de atraso' : 'de atraso';
    const detail = status === 'paid' ? `${done} em ${fmtDate(tx.date)}${lateDays ? ` (${lateDays} dia${lateDays > 1 ? 's' : ''} ${late})` : ''}` : status === 'late' ? `${income ? 'Era para' : 'Venceu'} ${income ? 'cair' : ''} em ${fmtDate(due)} · ${lateDays} dia${lateDays > 1 ? 's' : ''} ${late}`.replace('  ', ' ') : `${income ? 'Cai' : 'Vence'} em ${fmtDate(due)}`;
    return `<article class="bill st-${status} kind-${kind}">${drop(cat?.icon || (income ? '💰' : '📅'), cat?.color)}
      <div class="bill-main"><h3>${esc(bill.name)}</h3><p class="muted">${esc(detail)} · ${esc(store.userName(bill.ownerId))}${bill.method ? ` · ${esc(bill.method)}` : ''}</p>
      ${P.isVariable(bill) ? `<p class="muted small">Variável${avg != null ? ` · média ${esc(brl(avg))} (${avgCount} ${avgCount === 1 ? 'mês' : 'meses'})` : ' · ainda sem histórico'}</p>` : ''}
      ${h.counted >= 3 && h.late > 0 ? `<p class="hint-warn">${income ? 'Atrasou' : 'Atrasou'} em ${h.late} dos últimos ${h.counted} meses</p>` : ''}</div>
      <div class="bill-r"><b class="${income ? 'pos' : ''}">${esc(brl(bill.amount))}</b>${pill(label, tone)}</div>
      <div class="bill-a">${status === 'paid' ? '' : `<button class="btn btn-primary sm" data-pay="${esc(bill.id)}">${t.act}</button>`}<button class="btn btn-soft sm" data-edit="${esc(bill.id)}">Editar</button><button class="btn btn-danger-soft sm" data-arch="${esc(bill.id)}" aria-label="Excluir ${esc(bill.name)}">Excluir</button></div></article>`;
  }).join('') : `<div class="card">${income
    ? emptyState('wallet', 'Nenhuma receita fixa neste mês', 'Cadastre salário, aluguel recebido, pensão... Elas entram na projeção de entradas dos próximos meses.', '<button class="btn btn-primary" data-new>Cadastrar receita fixa</button>')
    : emptyState('calendar', 'Nenhuma conta fixa neste mês', 'Cadastre aluguel, internet, escola... Elas entram na previsão de gastos e nos alertas de atraso.', '<button class="btn btn-primary" data-new>Cadastrar conta fixa</button>')}</div>`;

  $('#fx-tabs', view).onchange = (e) => { tab = e.target.value; render(view); };
  view.onclick = async (e) => {
    const g = (a) => e.target.closest(`[data-${a}]`)?.dataset[a];
    if (e.target.closest('[data-new]')) return openBillModal(null, kind);
    if (g('pay')) return payBill(rows.find((r) => r.bill.id === g('pay')).bill);
    if (g('edit')) return openBillModal(store.byId('fixedBills', g('edit')));
    if (g('arch')) {
      const b = store.byId('fixedBills', g('arch'));
      if (!(await confirmDialog({ title: income ? 'Excluir receita fixa' : 'Excluir conta', text: `"${b.name}" deixa de ser prevista. Lançamentos já feitos continuam no extrato.`, okLabel: 'Excluir', danger: true }))) return;
      try { await store.remove('fixedBills', b.id); toast(income ? 'Receita fixa excluída.' : 'Conta excluída.', { kind: 'ok' }); } catch (err) { toast(err.message, { kind: 'err' }); }
    }
  };
  $('#fx-new', view).onclick = () => openBillModal(null, kind);
}
