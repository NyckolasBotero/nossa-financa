// Testes da lógica pura (projections.js, insights.js, format.js). Dados SINTÉTICOS, só para teste.
import assert from 'node:assert/strict';
import * as P from '../js/projections.js';
import { computeInsights } from '../js/insights.js';
import { parseMoney, brl, dayLabel } from '../js/format.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const TODAY = '2026-11-19';

const cats = [
  { id: 'sal', name: 'Salário', type: 'income', tag: 'salary', bucket: '' },
  { id: 'mer', name: 'Mercado', type: 'expense', tag: 'food', bucket: 'bills' },
  { id: 'ff', name: 'Fast food', type: 'expense', tag: 'fastfood', bucket: 'others' },
  { id: 'sub', name: 'Assinaturas', type: 'expense', tag: 'subscription', bucket: 'others' },
  { id: 'mor', name: 'Moradia', type: 'expense', tag: 'housing', bucket: 'bills' },
  { id: 'lzr', name: 'Lazer', type: 'expense', tag: 'leisure', bucket: 'others' }
];
let k = 0;
const tx = (date, type, amount, o = {}) => ({ id: 't' + ++k, date, type, amount, ownerId: 'u1', scope: 'individual', accountId: 'a1', ...o });
const T = [];
for (const m of ['2026-08', '2026-09', '2026-10', '2026-11']) {
  T.push(tx(`${m}-05`, 'income', 5000, { description: 'Salário', categoryId: 'sal' }));
  T.push(tx(`${m}-03`, 'expense', 40, { description: 'Netflix', categoryId: 'sub' }));
}
// aluguel: Ago em dia, Set 5 dias atrasado, Out 2 dias atrasado, Nov em dia
T.push(tx('2026-08-10', 'expense', 1500, { description: 'Aluguel', categoryId: 'mor', fixedBillId: 'b1' }));
T.push(tx('2026-09-15', 'expense', 1500, { description: 'Aluguel', categoryId: 'mor', fixedBillId: 'b1' }));
T.push(tx('2026-10-12', 'expense', 1500, { description: 'Aluguel', categoryId: 'mor', fixedBillId: 'b1' }));
T.push(tx('2026-11-10', 'expense', 1500, { description: 'Aluguel', categoryId: 'mor', fixedBillId: 'b1' }));
// gasto variável: 100/dia em dias alternados, de 20/09 a 18/11
for (let i = 0; i < 60; i += 2) T.push(tx(P.addDays('2026-09-20', i), 'expense', 100, { description: 'Compras', categoryId: 'lzr' }));
// 5 fast foods nos últimos 30 dias
['2026-10-25', '2026-10-30', '2026-11-04', '2026-11-09', '2026-11-15'].forEach((dt) => T.push(tx(dt, 'expense', 50, { description: 'iFood', categoryId: 'ff' })));
// cartão alimentação (entra 800, gasta 200+80) e crédito
T.push(tx('2026-11-06', 'income', 800, { accountId: undefined, cardId: 'f1', description: 'Benefício' }));
T.push(tx('2026-11-07', 'expense', 200, { accountId: undefined, cardId: 'f1', categoryId: 'mer', description: 'Mercado' }));
T.push(tx('2026-11-14', 'expense', 80, { accountId: undefined, cardId: 'f1', categoryId: 'mer', description: 'Mercado' }));
T.push(tx('2026-11-03', 'expense', 300, { accountId: undefined, cardId: 'c1', categoryId: 'lzr', description: 'Show', scope: 'shared', ownerId: 'u2' }));
T.push(tx('2026-11-10', 'expense', 500, { accountId: undefined, cardId: 'c1', categoryId: 'lzr', description: 'Tênis', ownerId: 'u2' }));
T.push(tx('2026-11-12', 'saving', 400, { goalId: 'g1' }));

const state = {
  transactions: T,
  accounts: [{ id: 'a1', name: 'Conta', kind: 'checking', ownerId: 'u1', initialBalance: 1000 }],
  cards: [
    { id: 'f1', kind: 'food', name: 'Alimentação', ownerId: 'u1', initialBalance: 0 },
    { id: 'c1', kind: 'credit', name: 'Crédito', ownerId: 'u1', limit: 1000, closingDay: 5, dueDay: 12 }
  ],
  categories: cats, goals: [{ id: 'g1', name: 'Reserva', target: 10000, ownerId: 'u1' }],
  fixedBills: [{ id: 'b1', name: 'Aluguel', amount: 1500, dueDay: 10, ownerId: 'u1', startMonth: '2026-08', createdAt: '2026-08-01T00:00:00Z' }],
  settings: {}
};
const d = P.scoped(state, 'family');

ok('datas e dinheiro', () => {
  assert.equal(P.addMonths('2026-12', 1), '2027-01'); assert.equal(P.addMonths('2026-01', -1), '2025-12');
  assert.equal(P.daysInMonth('2026-02'), 28); assert.equal(P.diffDays('2026-11-19', '2026-11-30'), 11);
  assert.equal(P.dueDate('2026-02', 31), '2026-02-28');
  assert.equal(parseMoney('1.234,56'), 1234.56); assert.equal(parseMoney('R$ 45,9'), 45.9); assert.equal(parseMoney('abc'), null);
  assert.match(brl(1234.5), /1\.234,50/);
});
ok('totais do mês separam cartão alimentação e valor guardado', () => {
  const t = P.monthTotals(d, '2026-11');
  assert.equal(t.income, 5000);                      // 800 do benefício fica de fora
  assert.equal(t.expense, 40 + 1500 + 300 + 500 + 150 + 9 * 100);   // netflix, aluguel, 2 compras no crédito, 3 fast foods, 9 compras variáveis
  assert.equal(t.foodSpent, 280); assert.equal(t.foodIncome, 800); assert.equal(t.saved, 400);
  assert.equal(P.foodSpending(t), 280 + 150);        // mercado (cartão alimentação) + fast food
  assert.equal(t.shared, 300);
  assert.equal(t.result, t.income - t.expense);
});
ok('saldos: conta, cartão alimentação, guardado e meta', () => {
  const acc = state.accounts[0];
  const manual = 1000 + T.filter((x) => x.accountId === 'a1').reduce((s, x) => s + (x.type === 'income' ? x.amount : -x.amount), 0);
  assert.equal(P.accountBalance(d, acc), manual);
  assert.equal(P.foodBalance(d, state.cards[0]), 800 - 280);
  assert.equal(P.savedTotal(d), 400); assert.equal(P.goalSaved(d, state.goals[0]), 400);
});
ok('escopo individual mantém o saldo real da conta', () => {
  const du2 = P.scoped(state, 'u2');
  assert.equal(du2.accounts.length, 0);               // conta é do u1
  const du1 = P.scoped(state, 'u1');
  assert.equal(P.bankBalance(du1), P.bankBalance(d));
  assert.ok(du1.transactions.length < d.transactions.length);
});
ok('fatura do cartão: fechamento dia 5, vencimento dia 12', () => {
  const c = state.cards[1];
  assert.equal(P.invoiceMonth(c, '2026-11-03'), '2026-11');   // fecha 5/nov, vence 12/nov
  assert.equal(P.invoiceMonth(c, '2026-11-10'), '2026-12');   // fecha 5/dez, vence 12/dez
  assert.equal(P.invoiceInfo(d, c, '2026-11').open, 300);
  assert.equal(P.invoiceInfo(d, c, '2026-12').open, 500);
  assert.equal(P.creditUsed(d, c), 800);
  const paid = { ...state, transactions: [...T, tx('2026-11-11', 'card_payment', 300, { cardId: 'c1', refMonth: '2026-11' })] };
  const dp = P.scoped(paid, 'family');
  assert.equal(P.invoiceInfo(dp, c, '2026-11').open, 0); assert.equal(P.creditUsed(dp, c), 500);
  assert.equal(P.bankBalance(dp), P.bankBalance(d) - 300);
});
ok('contas fixas: status e histórico de atraso', () => {
  const b = state.fixedBills[0];
  assert.equal(P.billStatus(d, b, '2026-11', TODAY).status, 'paid');
  assert.equal(P.billStatus(d, b, '2026-09', TODAY).lateDays, 5);
  assert.deepEqual(P.lateHistory(d, b, TODAY), { late: 2, counted: 4 });
  assert.equal(P.billStatus(d, b, '2026-12', TODAY).status, 'pending');
  const unpaid = P.billStatus({ ...d, transactions: [], allTx: [] }, b, '2026-11', TODAY);
  assert.equal(unpaid.status, 'late'); assert.equal(unpaid.lateDays, 9);
  assert.equal(P.billsForMonth(d, '2026-07', TODAY).length, 0, 'não existia antes do início');
});
ok('projeções de gasto 7/15/30 dias', () => {
  const v = P.variableStats(d, d.transactions, TODAY);
  assert.ok(v.daily > 40 && v.daily < 75, 'média diária plausível: ' + v.daily);
  assert.equal(v.lowConfidence, false);
  const p7 = P.projectSpend(d, TODAY, 7), p30 = P.projectSpend(d, TODAY, 30);
  assert.equal(p7.fixed, 0); assert.equal(p30.fixed, 1500);   // aluguel de dezembro cai dentro de 30 dias
  assert.equal(p30.total, Math.round((p30.variable + p30.fixed) * 100) / 100);
  assert.ok(p30.variable > p7.variable * 4);
  const curve = P.spendCurve(d, TODAY, 30);
  assert.equal(curve.length, 31); assert.equal(curve[0].value, 0); assert.equal(curve[30].value, p30.total);
});
ok('receita prevista e fim do mês', () => {
  const inc = P.expectedIncome(d, TODAY);
  assert.equal(inc.expected, 5000); assert.equal(inc.remaining, 0); assert.equal(inc.has, true);
  const me = P.monthEnd(d, TODAY);
  assert.equal(me.daysLeft, 11);
  assert.equal(me.pendingFixed, 0);
  assert.equal(me.invoicesDue, 300, 'fatura de novembro (vencida e em aberto) entra; a de dezembro vence depois do fim do mês');
  const expected = Math.round((me.balance + me.remainingIncome - me.pendingFixed - me.invoicesDue - me.remainingVariable) * 100) / 100;
  assert.equal(me.projected, expected);
  const nm = P.nextMonth(d, TODAY);
  assert.equal(nm.month, '2026-12'); assert.equal(nm.income, 5000); assert.equal(nm.fixed, 1500);
  assert.equal(nm.leftover, Math.round((5000 - 1500 - nm.variable) * 100) / 100);
});
ok('sem histórico de receita não inventa previsão', () => {
  const few = P.scoped({ ...state, transactions: T.filter((x) => x.type !== 'income') }, 'family');
  const inc = P.expectedIncome(few, TODAY);
  assert.equal(inc.has, false); assert.equal(inc.expected, 0);
});
ok('despesas recorrentes e crescimento por categoria', () => {
  const rec = P.recurringExpenses(d, TODAY);
  assert.ok(rec.some((r) => r.label === 'Netflix' && r.avg === 40 && r.months === 4));
  assert.ok(!rec.some((r) => r.label === 'Mercado'), 'cartão alimentação fica de fora');
  // Lazer em novembro sem gasto variável extra: cria cenário de crescimento
  const boost = P.scoped({ ...state, transactions: [...T, tx('2026-11-18', 'expense', 3000, { categoryId: 'lzr', description: 'Viagem' })] }, 'family');
  const g = P.categoryGrowth(boost, TODAY);
  assert.equal(g[0].categoryId, 'lzr');
});
ok('planejamento 30/50/20 compara com o gasto real', () => {
  const b = P.budget(d, TODAY);
  assert.equal(b.base, 5000);
  const [res, bills, oth] = b.rows;
  assert.equal(res.planned, 1500); assert.equal(res.actual, 400); assert.equal(res.status, 'behind');
  assert.equal(bills.planned, 2500); assert.equal(bills.actual, 1500);   // aluguel; mercado do cartão alimentação fica fora
  assert.equal(oth.planned, 1000); assert.equal(oth.status, 'over');     // netflix 40 + show 300 + tênis 500 + fast food 150 + compras
  const custom = P.budget(P.scoped({ ...state, settings: { budgetSplit: { reserve: 10, bills: 60, others: 30 } } }, 'family'), TODAY);
  assert.equal(custom.rows[0].planned, 500);
});
ok('insights vêm dos dados reais', () => {
  const ins = computeInsights(d, TODAY, { inboxPending: 2 });
  const ids = ins.map((i) => i.id);
  assert.ok(ids.includes('late-hist-b1'), ids.join(','));
  assert.ok(ids.includes('fastfood'));
  assert.ok(ids.includes('subs'));
  assert.ok(ids.includes('inbox'));
  assert.ok(ids.includes('budget-others'));
  const order = ins.map((i) => ({ bad: 0, warn: 1, info: 2, good: 3 }[i.level]));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'ordenados por gravidade');
  const empty = computeInsights(P.scoped({ ...state, transactions: [] }, 'family'), TODAY);
  assert.equal(empty.length, 1); assert.equal(empty[0].id, 'start');
});
ok('resultado projetado do mês', () => {
  const r = P.monthResult(d, TODAY), me = P.monthEnd(d, TODAY), t = P.monthTotals(d, '2026-11');
  assert.equal(r.income, 5000);
  assert.equal(r.result, Math.round((5000 - t.expense - me.remainingVariable - me.pendingFixed) * 100) / 100);
});
ok('rótulos de dia', () => assert.match(dayLabel('2026-11-03'), /^[A-ZÀ-Ú][a-zç-]+, 03\/11$/));

// ---- receitas fixas, projeção de entradas, nota de saúde e copo
{
  const sal = { id: 'i1', kind: 'income', name: 'Salário', amount: 5000, dueDay: 5, ownerId: 'u1', startMonth: '2026-09', createdAt: '2026-09-01T00:00:00Z' };
  const aluguel = { id: 'i2', kind: 'income', name: 'Aluguel recebido', amount: 800, dueDay: 25, ownerId: 'u1', startMonth: '2026-11', createdAt: '2026-11-01T00:00:00Z' };
  const st2 = { ...state, fixedBills: [...state.fixedBills, sal, aluguel] };
  const d2 = P.scoped(st2, 'family');
  ok('receita fixa não vira conta fixa nem atrasa as contas', () => {
    assert.equal(P.billsForMonth(d2, '2026-11', TODAY).length, 1);
    assert.equal(P.billsForMonth(d2, '2026-11', TODAY, 'income').length, 2);
    assert.equal(P.billKind({}), 'expense');
    assert.equal(P.projectSpend(d2, TODAY, 30).fixed, P.projectSpend(d, TODAY, 30).fixed);
  });
  ok('receita fixa recebida/atrasada e projeção de entradas', () => {
    const rows = P.billsForMonth(d2, '2026-11', TODAY, 'income');
    const aluguelRow = rows.find((x) => x.bill.id === 'i2');
    assert.equal(aluguelRow.status, 'pending');
    const inc = P.expectedIncome(d2, TODAY);
    assert.ok(inc.groups.some((g) => g.fixed && g.label === 'Aluguel recebido'));
    assert.ok(inc.remaining >= 800, 'o que falta receber inclui a receita fixa pendente');
    const f = P.projectFlow(d2, TODAY, 30);
    assert.ok(f.incomeItems.some((x) => x.bill.id === 'i2'));
    assert.equal(P.projectFlow(d, TODAY, 30).income, 0, 'sem receita fixa cadastrada não inventa entrada');
  });
  ok('receita fixa paga (lançamento vinculado) sai do que falta receber', () => {
    const pay = tx('2026-11-25', 'income', 800, { fixedBillId: 'i2', description: 'Aluguel recebido' });
    const d3 = P.scoped({ ...st2, transactions: [...T, pay] }, 'family');
    assert.equal(P.billsForMonth(d3, '2026-11', TODAY, 'income').find((x) => x.bill.id === 'i2').status, 'paid');
    assert.equal(P.pendingIncomeUntil(d3, TODAY, '2026-11-30').some((x) => x.bill.id === 'i2'), false);
  });
  ok('previsão dos próximos meses usa receitas e contas fixas', () => {
    const o = P.outlook(d2, TODAY, 6);
    assert.equal(o.length, 7); assert.equal(o[0].current, true);
    assert.equal(o[1].month, '2026-12'); assert.equal(o[1].income >= 5800, true);
    assert.equal(o[1].fixed, 1500);
    assert.equal(o[6].cumulative, Math.round(o.reduce((a, r) => a + r.leftover, 0) * 100) / 100);
  });
  ok('nota de saúde financeira: transparente e limitada a 0-100', () => {
    const h = P.healthScore(d2, TODAY);
    assert.ok(h.score >= 0 && h.score <= 100); assert.ok(h.parts.length >= 2);
    assert.ok(['Atenção', 'Regular', 'Boa', 'Ótima'].includes(h.label));
    const empty = P.healthScore(P.scoped({ ...state, transactions: [], fixedBills: [] }, 'family'), TODAY);
    assert.equal(empty.hasData, false); assert.equal(empty.label, 'Sem dados');
  });
  ok('copo de reserva: metas ou 3 meses de gastos', () => {
    const g = P.reserveGlass(d2, TODAY);
    assert.equal(g.basis, 'goals'); assert.equal(g.target, 10000); assert.equal(g.level, g.saved / 10000);
    const none = P.reserveGlass(P.scoped({ ...state, goals: [], transactions: [] }, 'family'), TODAY);
    assert.equal(none.basis, 'none'); assert.equal(none.level, 0);
    const r3 = P.reserveGlass(P.scoped({ ...state, goals: [] }, 'family'), TODAY);
    assert.ok(r3.basis === 'reserve3m' || r3.basis === 'none');
  });
}
{
  // conta variável, cofre, despensa e contracheque (dados sintéticos)
  const mk = (id, date, amount, fx) => ({ id, date, type: 'expense', amount, description: 'x', categoryId: '', accountId: 'a', ownerId: 'u', scope: 'shared', fixedBillId: fx, createdAt: date });
  const bill = { id: 'v', name: 'Água', kind: 'expense', billType: 'variable', amount: 100, dueDay: 10, ownerId: 'u', startMonth: '2026-06', createdAt: '2026-06-01' };
  const d = { fixedBills: [bill], transactions: [mk('1', '2026-09-10', 80, 'v'), mk('2', '2026-10-10', 120, 'v'), mk('3', '2026-11-10', 95, 'v')], goals: [], accounts: [], cards: [], categories: [] };
  ok('conta variável: média dos meses anteriores e valor real quando paga', () => {
    assert.deepEqual(P.billAverage(d, bill, '2026-11'), { avg: 100, count: 2 });
    const paid = P.billsForMonth(d, '2026-11', TODAY)[0]; assert.equal(paid.bill.amount, 95); assert.equal(paid.status, 'paid');
    const d2 = { ...d, transactions: d.transactions.slice(0, 2) };
    const pend = P.billsForMonth(d2, '2026-11', TODAY)[0]; assert.equal(pend.bill.amount, 100); assert.equal(pend.avg, 100);
    const fixed = P.billsForMonth({ ...d2, fixedBills: [{ ...bill, billType: 'fixed' }] }, '2026-11', TODAY)[0]; assert.equal(fixed.bill.amount, 100);
  });
  ok('variável reconhece gastos do extrato pelo nome (sem vínculo)', () => {
    const loose = [{ ...mk('9', '2026-10-08', 130), description: 'Conta de ÁGUA', fixedBillId: '' }, { ...mk('8', '2026-10-09', 50), description: 'Mercado', fixedBillId: '' }];
    const dl = { ...d, transactions: loose };
    assert.equal(P.billPaid(dl, bill, '2026-10'), 130);
    assert.equal(P.billPaid(dl, { ...bill, billType: 'fixed' }, '2026-10'), null);
  });
  ok('série mês a mês das variáveis com filtro de categoria', () => {
    const s = P.variableSeries(d, '2026-11', 6); assert.equal(s.months.length, 6); assert.equal(s.lines.length, 1);
    assert.deepEqual(s.lines[0].values.slice(-3), [80, 120, 95]);
    assert.equal(P.variableSeries({ ...d, fixedBills: [{ ...bill, categoryId: 'c1' }] }, '2026-11', 6, 'c2').lines.length, 0);
  });
  ok('cofre: meta = custo × meses, meses e dias de segurança', () => {
    const g = { id: 'gv', kind: 'vault', target: 1, archived: false };
    const dv = { ...d, goals: [g], transactions: [{ id: 's', date: '2026-10-01', type: 'saving', amount: 6000, goalId: 'gv', accountId: 'a', ownerId: 'u', createdAt: '2026-10-01' }] };
    const v = P.vaultInfo(dv, TODAY, { vault: { monthlyCost: 2000, months: 6 } });
    assert.equal(v.target, 12000); assert.equal(v.level, 0.5); assert.equal(v.monthsSafe, 3); assert.equal(v.daysSafe, 90); assert.equal(v.missing, 6000);
    assert.equal(P.vaultInfo({ ...dv, transactions: [] }, TODAY, {}).cost.basis, 'fixed');
    assert.equal(P.reserveGlass(dv, TODAY).saved, 0);   // dinheiro do cofre não entra no copo da reserva
  });
  ok('despensa: unidades, dias de estoque e validade', () => {
    const items = [{ id: '1', name: 'Arroz', packs: 2, perPack: 5, units: 1, perPersonDay: 0.25, expiry: '2026-12-01' }, { id: '2', name: 'Sal', packs: 0, units: 3, perPersonDay: 0, expiry: '2026-11-01' }];
    const r = P.pantryInfo(items, 4, TODAY);
    assert.equal(P.pantryUnits(items[0]), 11); assert.equal(r.rows[0].days, 11); assert.equal(r.rows[0].status, 'soon'); assert.equal(r.rows[0].expiresIn, 12);
    assert.equal(r.rows[1].status, 'expired'); assert.equal(r.avgDays, 11); assert.equal(r.expired, 1); assert.equal(r.soon, 1); assert.equal(r.first.it.name, 'Arroz');
  });
  ok('resumo do ano: passado real, mês atual e 6 previstos com acumulado', () => {
    const r = P.yearOverview(d, TODAY, 6);
    assert.equal(r[0].month, '2026-01'); assert.equal(r.at(-1).month, '2027-05');
    assert.equal(r.filter((x) => x.state === 'current').length, 1); assert.equal(r.filter((x) => x.state === 'future').length, 6);
    let acc = 0; for (const x of r) { acc = Math.round((acc + x.leftover) * 100) / 100; assert.equal(x.cumulative, acc); }
  });
  ok('salário em dobro: mesma pessoa, categoria e mês conflita; outra categoria ou pessoa não', () => {
    const cats = [{ id: 'cs', type: 'income', tag: 'salary' }, { id: 'cm', type: 'income', tag: 'other' }];
    const t = (id, o) => ({ id, type: 'income', amount: 100, date: '2026-11-05', ownerId: 'u', categoryId: 'cs', ...o });
    const dd = { ...d, categories: cats, _ix: undefined };
    const base = [t('a')];
    assert.ok(P.salaryConflict(dd, t('b'), base));
    assert.equal(P.salaryConflict(dd, t('a'), base), null);
    assert.equal(P.salaryConflict(dd, t('b', { categoryId: 'cm' }), base), null);
    assert.equal(P.salaryConflict(dd, t('b', { ownerId: 'w' }), base), null);
    assert.equal(P.salaryConflict(dd, t('b', { date: '2026-12-05' }), base), null);
  });
  ok('conta de outubro paga em novembro conta como paga em outubro (refMonth), mas o gasto cai em novembro', () => {
    const b = { id: 'lz', name: 'Luz', kind: 'expense', amount: 200, dueDay: 10, startMonth: '2026-10', endMonth: '2026-10', archived: false };
    const tx = { id: 'p', type: 'expense', amount: 210, date: '2026-11-05', refMonth: '2026-10', fixedBillId: 'lz', ownerId: 'u', accountId: 'a', createdAt: '2026-11-05' };
    const dd = { ...d, fixedBills: [b], transactions: [tx] };
    assert.equal(P.billStatus(dd, b, '2026-10', '2026-11-19').status, 'paid');
    assert.equal(P.billApplies(b, '2026-11'), false);
    assert.equal(P.monthTotals(dd, '2026-11', dd.transactions).expense, 210);
  });
  ok('vence no mês seguinte: luz de outubro vence em novembro e não conta atraso se paga a tempo', () => {
    const b = { id: 'lz2', name: 'Luz', kind: 'expense', amount: 200, dueDay: 10, dueOffset: 1, startMonth: '2026-10', endMonth: '2026-10', archived: false };
    const dd = { ...d, fixedBills: [b], transactions: [] };
    assert.equal(P.billStatus(dd, b, '2026-10', '2026-11-05').due, '2026-11-10');
    assert.equal(P.billStatus(dd, b, '2026-10', '2026-11-05').status, 'pending');
    assert.equal(P.billStatus(dd, b, '2026-10', '2026-11-12').status, 'late');
    const paid = { id: 'q', type: 'expense', amount: 200, date: '2026-11-01', refMonth: '2026-10', fixedBillId: 'lz2', ownerId: 'u', accountId: 'a', createdAt: '2026-11-01' };
    assert.equal(P.billStatus({ ...dd, transactions: [paid] }, b, '2026-10', '2026-11-12').lateDays, 0);
  });
  ok('salário à mão x contracheque: o contracheque substitui e o aviso some', () => {
    const cats = [{ id: 'cs', type: 'income', tag: 'salary' }];
    const man = { id: 'm1', type: 'income', amount: 2500, date: '2026-11-05', ownerId: 'u', categoryId: 'cs', origin: 'manual' };
    const outro = { id: 'm2', type: 'income', amount: 100, date: '2026-11-06', ownerId: 'u', categoryId: '', origin: 'manual' };
    const dd = { ...d, categories: cats, fixedBills: [], transactions: [man, outro], _ix: undefined };
    assert.equal(P.manualSalaryFor(dd, [], 'u', '2026-11-05').id, 'm1');
    assert.equal(P.manualSalaryFor(dd, [], 'w', '2026-11-05'), null);
    assert.equal(P.manualSalaryFor(dd, [], 'u', '2026-12-05'), null);
    assert.deepEqual(P.salaryWithoutPayslip(dd, []).map((x) => [x.month, x.total]), [['2026-11', 2500]]);
    assert.equal(P.salaryWithoutPayslip(dd, [{ id: 'p', transactionId: 'm1' }]).length, 0);
    assert.equal(P.manualSalaryFor(dd, [{ id: 'p', transactionId: 'm1' }], 'u', '2026-11-05'), null);
  });
  ok('receita/conta já paga mostra o valor que realmente entrou no mês, não o cadastrado', () => {
    const b = { id: 'sal', name: 'Salário', kind: 'income', amount: 2686.16, dueDay: 5, startMonth: '2026-08', archived: false, billType: 'fixed' };
    const tx = { id: 's1', type: 'income', amount: 2284.64, date: '2026-09-04', fixedBillId: 'sal', ownerId: 'u', accountId: 'a', createdAt: '2026-09-04' };
    const dd = { ...d, fixedBills: [b], transactions: [tx] };
    assert.equal(P.billsForMonth(dd, '2026-09', '2026-11-20', 'income')[0].bill.amount, 2284.64);
    assert.equal(P.billsForMonth(dd, '2026-10', '2026-11-20', 'income')[0].bill.amount, 2686.16);
  });
  ok('dia a dia: acumulado de receitas e saídas, filtro por categoria e dias que a receita dura', () => {
    const cats = [{ id: 'cv', type: 'expense', tag: 'other' }, { id: 'cm', type: 'expense', tag: 'other' }, { id: 'cs', type: 'income', tag: 'salary' }];
    const tx = (id, date, amount, type, categoryId, extra = {}) => ({ id, date, amount, type, categoryId, ownerId: 'u', accountId: 'a', createdAt: date, ...extra });
    const dd = { ...d, categories: cats, fixedBills: [{ id: 'f', kind: 'expense', name: 'X' }], transactions: [tx('1', '2026-11-05', 1000, 'income', 'cs'), tx('2', '2026-11-03', 100, 'expense', 'cv'), tx('3', '2026-11-10', 300, 'expense', 'cm'), tx('4', '2026-11-10', 50, 'expense', 'cm', { fixedBillId: 'f' })], _ix: undefined };
    const all = P.dailyCumulative(dd, '2026-11', '2026-11-10');
    assert.equal(all.days.length, 30); assert.equal(all.days[9].expense, 450); assert.equal(all.days[9].income, 1000); assert.equal(all.days[10].expense, null);
    assert.equal(all.perDay, 45); assert.equal(all.lasts, 22.2);
    assert.equal(P.dailyCumulative(dd, '2026-11', '2026-11-10', { categoryId: 'cv' }).expenseTotal, 100);
    assert.equal(P.dailyCumulative(dd, '2026-11', '2026-11-10', { onlyBills: true }).expenseTotal, 50);
    assert.equal(P.dailyCumulative(dd, '2026-11', '2026-11-10', { categoryId: 'cv' }).incomeTotal, 1000);
    assert.equal(P.dailyCumulative({ ...dd, transactions: [tx('9', '2026-11-02', 500, 'income', 'cs'), tx('8', '2026-11-04', 600, 'expense', 'cv')] }, '2026-11', '2026-11-10').crossingDay, 4);
    assert.equal(P.dailyCumulative({ ...dd, transactions: [tx('7', '2026-11-03', 100, 'expense', 'cv'), tx('6', '2026-11-05', 1000, 'income', 'cs')] }, '2026-11', '2026-11-10').crossingDay, null);
  });
  ok('contracheque: pagamento em 05/10 é referente a setembro', () => { assert.equal(P.refMonthOf('2026-10-05'), '2026-09'); assert.equal(P.refMonthOf('2026-01-05'), '2025-12'); });
}
console.log(`\n${n} grupos de testes de lógica passaram.`);
