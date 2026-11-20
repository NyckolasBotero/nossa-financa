/**
 * fixedbills.js — contas fixas (saídas) e receitas fixas (entradas): cadastro, status do mês e histórico de atrasos.
 * "Pagar"/"Receber" abre o lançamento já preenchido e vinculado; é o lançamento que marca como paga/recebida.
 */
import * as store from './store.js';
import * as P from './projections.js';
import { $, $$, esc, drop, monthShort, pill, emptyState, formModal, confirmDialog, toast, brl, fmtDate, monthLabel } from './ui.js';
import { openTxModal, askMethod } from './transactions.js';
import { askCategory } from './categories.js';
import { renderDayChart } from './daychart.js';
import { renderVariableChart } from './varchart.js';
import * as notify from './notify.js';

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
    values: bill ? { ...bill, dueOffset: Number(bill.dueOffset) === 1, billType: bill.billType || 'fixed', repeat: bill.startMonth && bill.startMonth === bill.endMonth ? 'once' : 'monthly', refOnce: bill.startMonth || store.prefs.month, source: bill.accountId ? `a:${bill.accountId}` : bill.cardId ? `c:${bill.cardId}` : '' }
      : { ownerId: store.prefs.who !== 'family' ? store.prefs.who : store.state.me.id, scope: kind === 'income' ? 'individual' : 'shared', billType: 'fixed', repeat: 'monthly', startMonth: store.prefs.month, refOnce: store.prefs.month },
    fields: [
      { name: 'name', label: 'Nome', required: true, full: true, placeholder: t.ph, suggest: () => [...new Map(store.state.fixedBills.filter((x) => P.billKind(x) === kind).sort((a, b) => (a.archived ? 1 : 0) - (b.archived ? 1 : 0)).map((x) => [P.norm(x.name), { label: x.name, bill: x }])).values()],
        onPick: (it, c) => { const b = it.bill, v = c.values(), fillIf = (n, val, empty) => { if (val && empty) c.set(n, val); };
          fillIf('categoryId', b.categoryId, !v.categoryId); fillIf('source', b.accountId ? `a:${b.accountId}` : b.cardId ? `c:${b.cardId}` : '', !v.source); fillIf('method', b.method, !v.method);
          fillIf('amount', b.amount, !v.amount); fillIf('dueDay', b.dueDay, !v.dueDay); if (kind === 'expense' && b.billType) c.set('billType', b.billType); } },
      { name: 'repeat', label: 'Essa conta', type: 'segmented', full: true, options: [{ value: 'monthly', label: 'Repete todo mês' }, { value: 'once', label: 'Só uma vez (avulsa)' }] },
      ...(kind === 'expense' ? [{ name: 'billType', label: 'Essa conta é', type: 'segmented', full: true, options: [{ value: 'fixed', label: 'Fixa (sempre igual)' }, { value: 'variable', label: 'Variável (muda todo mês)' }] }] : []),
      { name: 'amount', label: kind === 'expense' ? 'Valor (estimado, se variável)' : 'Valor', type: 'money', required: true },
      { name: 'dueDay', label: t.day, type: 'number', min: 1, max: 31, required: true },
      ...(kind === 'expense' ? [{ name: 'dueOffset', label: 'Vencimento', type: 'check', checkLabel: 'Vence no mês seguinte ao consumo (ex.: luz de outubro vence em novembro)', full: true }] : []),
      { name: 'categoryId', label: t.cat, type: 'select', options: store.categoryOptions(kind, { withNew: true }), placeholder: 'Sem categoria' },
      { name: 'source', label: t.src, type: 'select', options: sources, placeholder: kind === 'income' ? 'Escolho na hora de receber' : 'Escolho na hora de pagar' },
      { name: 'method', label: t.method, type: 'select', options: store.methodOptions(), placeholder: 'Não informar' },
      { name: 'ownerId', label: t.owner, type: 'select', options: store.ownerOptions(), required: true },
      { name: 'scope', label: kind === 'income' ? 'Tipo de receita' : 'Tipo de gasto', type: 'segmented', options: [{ value: 'individual', label: 'Individual' }, { value: 'shared', label: 'Compartilhado' }] },
      { name: 'startMonth', label: 'Vale a partir de', type: 'month', hint: t.hint, showIf: (v) => v.repeat !== 'once' },
      { name: 'endMonth', label: 'Vale até', type: 'month', hint: 'Deixe vazio se não tem fim.', showIf: (v) => v.repeat !== 'once' },
      { name: 'refOnce', label: 'Mês a que a conta se refere', type: 'month', required: true, hint: 'Ex.: a luz de outubro. Depois use Pagar na data em que realmente pagar; o gasto cai no mês do pagamento.', showIf: (v) => v.repeat === 'once' }
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
      const payload = { name: v.name, amount: v.amount, dueDay: v.dueDay, categoryId: v.categoryId && v.categoryId !== store.NEW_CAT ? v.categoryId : '', billType: kind === 'expense' ? v.billType || 'fixed' : 'fixed', dueOffset: kind === 'expense' && v.dueOffset ? 1 : 0, accountId: k === 'a' ? id : '', cardId: k === 'c' ? id : '', ownerId: v.ownerId, scope: v.scope, startMonth: v.repeat === 'once' ? v.refOnce || '' : v.startMonth || '', endMonth: v.repeat === 'once' ? v.refOnce || '' : v.endMonth || '', method: v.method && v.method !== store.NEW_METHOD ? v.method : '', kind };
      const rec = editing ? await store.update('fixedBills', { id: bill.id, ...payload }) : await store.create('fixedBills', payload);
      toast(t.saved, { kind: 'ok' }); c.close();
      if (payload.billType === 'variable' && v.repeat !== 'once') await linkHistory(rec, { quiet: false });
      if (!editing && v.repeat === 'once') {
        store.setMonth?.(payload.startMonth);
        if (await confirmDialog({ title: 'Essa conta já foi paga?', text: `"${rec.name}" de ${monthLabel(payload.startMonth)}. Registre o pagamento agora, na data em que pagou; o gasto entra no mês do pagamento.`, okLabel: kind === 'income' ? 'Registrar recebimento' : 'Registrar pagamento', cancelLabel: 'Ainda não' })) payBill(rec, payload.startMonth);
      }
    }
  });
}

/** Ao virar variável: oferece ligar os gastos antigos do extrato com o nome da conta (ex.: todos os de "Água"). */
async function linkHistory(rec, { quiet = false } = {}) {
  const list = store.state.transactions.filter((x) => !x.archived && !x.fixedBillId && P.matchesBill(x, rec)).slice(0, 80);
  if (!list.length) {
    if (!quiet && !store.state.transactions.some((x) => x.fixedBillId === rec.id)) toast(`Nenhum lançamento do extrato tem "${rec.name}" no nome. Use o mesmo nome do extrato ou pague pelo botão Pagar.`, { kind: 'warn' });
    return;
  }
  const total = list.reduce((a, x) => a + x.amount, 0);
  if (!(await confirmDialog({ title: `Mover o histórico de "${rec.name}"`, text: `Encontrei ${list.length} ${list.length === 1 ? 'lançamento' : 'lançamentos'} no extrato com esse nome (${brl(total)} no total). Ligar todos a esta conta variável para montar a média e o gráfico mês a mês?`, okLabel: 'Ligar histórico' }))) return;
  const nt = notify.start('Ligando histórico…', `${list.length} lançamentos`);
  try { for (const x of list) await store.update('transactions', { id: x.id, fixedBillId: rec.id }, { silent: true, feedback: null }); nt.done('Histórico ligado', `${list.length} lançamentos agora fazem parte de "${rec.name}"`); }
  catch (e) { nt.fail('Não consegui ligar tudo', e.message); }
}

export function payBill(bill, month = '') {   // para conta variável, `bill.amount` já vem com a média dos meses anteriores
  const kind = P.billKind(bill);
  return openTxModal({ type: kind, amount: bill.amount, date: store.today(), description: bill.name, categoryId: bill.categoryId, accountId: bill.accountId, cardId: bill.cardId, ownerId: bill.ownerId, scope: bill.scope, fixedBillId: bill.id, method: bill.method || '', origin: 'fixed', refMonth: month || '' },
    { title: `${T[kind].act} · ${bill.name}${P.isVariable(bill) ? ' (confira o valor deste mês)' : ''}` });
}

const STATUS = {
  expense: { paid: ['Paga', 'ok'], pending: ['A vencer', 'info'], late: ['Atrasada', 'bad'] },
  income: { paid: ['Recebida', 'ok'], pending: ['A receber', 'info'], late: ['Atrasada', 'bad'] }
};
let tab = 'expense';

/** Aviso ao lado do seletor de mês: meses em que o salário foi lançado à mão, sem contracheque. */
function renderSalaryAlert(d, month) {
  const el = document.getElementById('top-alert'); if (!el) return;
  const list = P.salaryWithoutPayslip(d, store.state.payslips);
  if (!list.length) { el.hidden = true; return; }
  const here = list.find((x) => x.month === month), others = list.filter((x) => x.month !== month);
  const names = (arr) => arr.map((x) => monthLabel(x.month).split(' ')[0]).join(', ');
  const detail = list.map((x) => `${monthLabel(x.month)}: ${brl(x.total)} lançado à mão`).join(' · ');
  el.innerHTML = `<span class="ta-i" aria-hidden="true">⚠</span><span class="ta-t">${here ? `${esc(monthLabel(month).split(' ')[0])} sem contracheque` : `${list.length} ${list.length === 1 ? 'mês' : 'meses'} sem contracheque`}${here && others.length ? ` · +${others.length}` : ''}</span>`;
  el.title = `Salário lançado manualmente, sem contracheque. ${detail}. Clique para lançar o contracheque.`;
  el.setAttribute('aria-label', el.title);
  el.classList.toggle('here', !!here); el.hidden = false;
  el.onclick = () => { location.hash = '#/payslips'; };
}
/** Gastos avulsos do mês: despesas lançadas sem conta cadastrada nem vencimento (combustível, padaria...). Só consomem a receita do mês. */
function renderFree(view, d, today, month) {
  const box = $('#fx-free', view);
  if (!box) return;
  box.hidden = tab !== 'expense';
  if (box.hidden) return;
  const list = d.transactions.filter((x) => x.type === 'expense' && P.compMonth(x) === month && !x.fixedBillId && !P.isFood(d, x) && !d.fixedBills.some((b) => P.matchesBill(x, b)))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const total = list.reduce((s, x) => s + x.amount, 0), income = P.monthTotals(d, month).income;
  const pct = income > 0 ? Math.round((total / income) * 100) : null;
  box.innerHTML = `<header class="card-h"><h3>Gastos avulsos</h3><button class="btn btn-soft sm" type="button" data-fnew>＋ Novo gasto avulso</button></header>
    <p class="muted small">Sem vencimento: só consomem a receita de ${esc(monthLabel(month))}. ${list.length ? `Total <b class="neg">${esc(brl(total))}</b>${pct != null ? ` · <b>${pct}%</b> da receita do mês` : ''}.` : 'Nada lançado neste mês.'}</p>
    <div class="free-list">${list.map((x) => { const c = store.categoryOf(x.categoryId); return `<div class="free-i">${drop(c?.icon || '🧾', c?.color, 'sm')}<div class="free-m"><b>${esc(x.description || x.merchant || c?.name || 'Gasto')}</b><small class="muted">${esc(fmtDate(x.date))}${c ? ` · ${esc(c.name)}` : ''}${x.method ? ` · ${esc(x.method)}` : ''}</small></div><b class="neg">− ${esc(brl(x.amount))}</b><button class="btn btn-soft sm" data-fedit="${esc(x.id)}">Editar</button><button class="btn btn-danger-soft sm" data-fdel="${esc(x.id)}" aria-label="Excluir gasto">Excluir</button></div>`; }).join('')}</div>`;
}
const money0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const m0 = (v) => `R$ ${money0.format(v)}`, n0 = (v) => money0.format(v);   // n0: sem símbolo, para a tabela
/** Quadro do ano: o que sobrou/faltou, o acumulado e a previsão dos próximos 6 meses. */
function renderOverview(el, d, today, month) {
  const all = P.yearOverview(d, today, 6), rows = all.filter((r) => r.state !== 'past' || r.income || r.fixed || r.variable), cur = rows.find((r) => r.state === 'current'), prev = [...rows].reverse().find((r) => r.state === 'past');
  const tone = (v) => (v < 0 ? 'neg' : v > 0 ? 'pos' : '');
  const sg = (v) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${m0(Math.abs(v))}`, sn = (v) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${n0(Math.abs(v))}`;
  const lab = (m) => `${monthShort(m)}${m.slice(2, 4) !== today.slice(2, 4) ? `/${m.slice(2, 4)}` : ''}`;
  const sum = (k, f) => rows.filter(f).reduce((s, r) => s + r[k], 0);
  const futures = rows.filter((r) => r.state === 'future'), last = rows[rows.length - 1];
  el.innerHTML = `<header class="card-h"><h3>Resumo do ano e próximos meses</h3><span class="muted small">valores em R$</span></header>
    <div class="ov-kpis">
      <div><span class="muted small">${prev ? `Mês passado (${lab(prev.month)})` : 'Mês passado'}</span><b class="${prev ? tone(prev.leftover) : ''}">${prev ? `${prev.leftover < 0 ? 'Faltou ' : 'Sobrou '}${m0(Math.abs(prev.leftover))}` : '—'}</b></div>
      <div><span class="muted small">Acumulado até o mês passado</span><b class="${prev ? tone(prev.cumulative) : ''}">${prev ? sg(prev.cumulative) : '—'}</b></div>
      <div><span class="muted small">Fecha ${esc(monthShort(today.slice(0, 7)))} em</span><b class="${cur ? tone(cur.cumulative) : ''}">${cur ? sg(cur.cumulative) : '—'}</b></div>
      <div><span class="muted small">Em ${esc(lab(last.month))}, acumulado</span><b class="${tone(last.cumulative)}">${sg(last.cumulative)}</b></div>
    </div>
    <div class="ov-scroll"><table class="ov-t"><thead><tr><th>Mês</th><th>Receitas</th><th>Contas</th><th>Variável</th><th>Sobra</th><th>Acum.</th></tr></thead><tbody>
    ${rows.map((r) => `<tr class="${r.state}${r.month === month ? ' sel' : ''}"><th scope="row">${esc(lab(r.month))}${r.state === 'future' ? '<i title="Previsão">~</i>' : r.state === 'current' ? '<i title="Mês atual (parte já aconteceu)">•</i>' : ''}</th><td>${n0(r.income)}</td><td>${n0(r.fixed)}</td><td>${n0(r.variable)}</td><td class="${tone(r.leftover)}">${sn(r.leftover)}</td><td class="${tone(r.cumulative)}"><b>${sn(r.cumulative)}</b></td></tr>`).join('')}
    </tbody><tfoot><tr><th>Próx. ${futures.length}</th><td>${n0(sum('income', (r) => r.state === 'future'))}</td><td>${n0(sum('fixed', (r) => r.state === 'future'))}</td><td>${n0(sum('variable', (r) => r.state === 'future'))}</td><td class="${tone(sum('leftover', (r) => r.state === 'future'))}">${sn(sum('leftover', (r) => r.state === 'future'))}</td><td></td></tr></tfoot></table></div>
    <p class="muted small">Passado = o que aconteceu. <b>~</b> = previsão (receitas e contas fixas cadastradas, média das variáveis e gasto variável médio). <b>•</b> = mês atual. Acumulado = soma das sobras desde janeiro.</p>`;
}

/** Garante que os blocos novos existam mesmo que o navegador tenha guardado a versão antiga da tela. */
function ensureBlocks(view) {
  const add = (id, after, html) => { if (!$(`#${id}`, view)) $(after, view)?.insertAdjacentHTML('afterend', html); };
  add('fx-free', '#fx-list', '<article class="card" id="fx-free"></article>');
  add('fx-day-card', '#fx-list', '<article class="card" id="fx-day-card"><header class="card-h"><h3>Dia a dia do mês</h3><span class="muted small">Receitas x saídas acumuladas</span></header><div id="fx-day"></div></article>');
  add('fx-ov', '.fx-main', '<aside class="card fx-ov" id="fx-ov"></aside>');
}
export function render(view) {
  ensureBlocks(view);
  import("./payslips.js").then((m) => m.autoLinkPayslips()).catch(() => {});
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

  renderOverview($('#fx-ov', view), d, today, month);
  renderSalaryAlert(d, month);
  renderFree(view, d, today, month);
  $('#fx-var-card', view).hidden = income;
  renderDayChart($('#fx-day', view));
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
      <div class="bill-a">${status === 'paid' ? (tx ? `<button class="btn btn-primary sm" data-editpay="${esc(tx.id)}">${income ? 'Editar recebimento' : 'Editar pagamento'}</button>` : '') : `<button class="btn btn-primary sm" data-pay="${esc(bill.id)}">${t.act}</button>`}<button class="btn btn-soft sm" data-edit="${esc(bill.id)}">Editar</button>${P.isVariable(bill) ? `<button class="btn btn-ghost sm" data-link="${esc(bill.id)}">Ligar histórico</button>` : ''}<button class="btn btn-danger-soft sm" data-arch="${esc(bill.id)}" aria-label="Excluir ${esc(bill.name)}">Excluir</button></div></article>`;
  }).join('') : `<div class="card">${income
    ? emptyState('wallet', 'Nenhuma receita fixa neste mês', 'Cadastre salário, aluguel recebido, pensão... Elas entram na projeção de entradas dos próximos meses.', '<button class="btn btn-primary" data-new>Cadastrar receita fixa</button>')
    : emptyState('calendar', 'Nenhuma conta fixa neste mês', 'Cadastre aluguel, internet, escola... Elas entram na previsão de gastos e nos alertas de atraso.', '<button class="btn btn-primary" data-new>Cadastrar conta fixa</button>')}</div>`;

  $('#fx-tabs', view).onchange = (e) => { tab = e.target.value; render(view); };
  view.onclick = async (e) => {
    const g = (a) => e.target.closest(`[data-${a}]`)?.dataset[a];
    if (e.target.closest('[data-new]')) return openBillModal(null, kind);
    if (g('link')) return linkHistory(store.byId('fixedBills', g('link')));
    if (g('editpay')) { const x = store.byId('transactions', g('editpay')); return x && (await import('./transactions.js')).openTxModal(x); }
    if (g('pay')) return payBill(rows.find((r) => r.bill.id === g('pay')).bill, month);
    if (g('edit')) return openBillModal(store.byId('fixedBills', g('edit')));
    if (e.target.closest('[data-fnew]')) return openTxModal({ type: 'expense', date: month === today.slice(0, 7) ? today : `${month}-01`, origin: 'manual' }, { title: 'Novo gasto avulso' });
    if (g('fedit')) { const x = store.byId('transactions', g('fedit')); return x && openTxModal(x); }
    if (g('fdel')) {
      const x = store.byId('transactions', g('fdel'));
      if (!x || !(await confirmDialog({ title: 'Excluir gasto', text: `${x.description || 'Gasto'} · ${brl(x.amount)} em ${fmtDate(x.date)}.`, okLabel: 'Excluir', danger: true }))) return;
      try { await store.remove('transactions', x.id); toast('Gasto excluído.', { kind: 'ok' }); } catch (err) { toast(err.message, { kind: 'err' }); }
      return;
    }
    if (g('arch')) {
      const b = store.byId('fixedBills', g('arch'));
      if (!(await confirmDialog({ title: income ? 'Excluir receita fixa' : 'Excluir conta', text: `"${b.name}" deixa de ser prevista. Lançamentos já feitos continuam no extrato.`, okLabel: 'Excluir', danger: true }))) return;
      try { await store.remove('fixedBills', b.id); toast(income ? 'Receita fixa excluída.' : 'Conta excluída.', { kind: 'ok' }); } catch (err) { toast(err.message, { kind: 'err' }); }
    }
  };
  $('#fx-new', view).onclick = () => openBillModal(null, kind);
}
