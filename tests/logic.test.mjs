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
console.log(`\n${n} grupos de testes de lógica passaram.`);
