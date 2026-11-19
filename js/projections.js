/**
 * projections.js — cálculos financeiros PUROS (sem DOM, rede ou estado global).
 * Recebem `d` = { transactions, allTx, accounts, cards, categories, fixedBills, goals, settings }.
 *  - `transactions` já vem filtrado pelo escopo (eu / esposa / família);
 *  - `allTx` é o histórico completo: saldos de conta, fatura e metas usam ele, porque dinheiro
 *    de conta compartilhada não muda de saldo só porque o filtro mudou.
 *
 * Regras de contabilidade:
 *  - Receita/despesa mensal NÃO incluem o cartão alimentação (ele é contabilizado à parte).
 *  - Compra no crédito é despesa na data da compra; pagar a fatura (card_payment) só baixa o saldo.
 *  - Valor guardado (saving) sai do saldo da conta, não é despesa e alimenta as metas.
 */

export const pad = (n) => String(n).padStart(2, '0');
export const ym = (s) => String(s).slice(0, 7);
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const sum = (arr, f = (x) => x) => round2(arr.reduce((a, x) => a + f(x), 0));
const all = (d) => d.allTx || d.transactions;

export function addMonths(m, n) {
  let [y, mo] = m.split('-').map(Number);
  mo += n; y += Math.floor((mo - 1) / 12); mo = (((mo - 1) % 12) + 12) % 12 + 1;
  return `${y}-${pad(mo)}`;
}
export const daysInMonth = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).getUTCDate(); };
const utc = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const diffDays = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);
export const addDays = (iso, n) => new Date(utc(iso) + n * 864e5).toISOString().slice(0, 10);
export const dueDate = (m, day) => `${m}-${pad(Math.min(day, daysInMonth(m)))}`;
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// ------------------------------------------------------------------ índices
function ix(d) {
  if (d._ix) return d._ix;
  return (d._ix = {
    cat: new Map(d.categories.map((c) => [c.id, c])),
    food: new Set(d.cards.filter((c) => c.kind === 'food').map((c) => c.id))
  });
}
export const isFood = (d, t) => ix(d).food.has(t.cardId);
export const tagOf = (d, t) => ix(d).cat.get(t.categoryId)?.tag || 'other';
const bucketOf = (d, t) => ix(d).cat.get(t.categoryId)?.bucket || 'others';

/** Aplica o escopo: who = 'family' ou id do usuário. */
export function scoped(state, who) {
  const mine = (x) => who === 'family' || x.ownerId === who;
  return {
    transactions: state.transactions.filter(mine), allTx: state.transactions,
    accounts: state.accounts.filter((a) => !a.archived && mine(a)),
    cards: state.cards.filter((c) => !c.archived && (who === 'family' || mine(c))),
    categories: state.categories, goals: state.goals.filter((g) => !g.archived && mine(g)),
    fixedBills: state.fixedBills.filter((b) => !b.archived && mine(b)), settings: state.settings || {}
  };
}

// ------------------------------------------------------------------ totais do mês
export function monthTotals(d, month, txs = d.transactions) {
  const r = { month, income: 0, expense: 0, saved: 0, foodSpent: 0, foodIncome: 0, individual: 0, shared: 0, byCat: {}, byTag: {}, count: 0 };
  for (const t of txs) {
    if (ym(t.date) !== month) continue;
    r.count++;
    const food = isFood(d, t);
    if (t.type === 'saving') { r.saved += t.amount; continue; }
    if (t.type === 'card_payment') continue;
    if (t.type === 'income') { if (food) r.foodIncome += t.amount; else r.income += t.amount; continue; }
    const k = t.categoryId || 'none';
    r.byCat[k] = (r.byCat[k] || 0) + t.amount;
    const tag = tagOf(d, t); r.byTag[tag] = (r.byTag[tag] || 0) + t.amount;
    if (food) { r.foodSpent += t.amount; continue; }
    r.expense += t.amount;
    r[t.scope === 'shared' ? 'shared' : 'individual'] += t.amount;
  }
  for (const k of ['income', 'expense', 'saved', 'foodSpent', 'foodIncome', 'individual', 'shared']) r[k] = round2(r[k]);
  for (const m of [r.byCat, r.byTag]) for (const k in m) m[k] = round2(m[k]);
  r.result = round2(r.income - r.expense);
  return r;
}
/** Gastos de alimentação = tags food + fastfood (inclui o cartão alimentação). */
export const foodSpending = (tot) => round2((tot.byTag.food || 0) + (tot.byTag.fastfood || 0));

// ------------------------------------------------------------------ saldos
export function accountBalance(d, a) {
  let b = a.initialBalance || 0;
  for (const t of all(d)) {
    if (t.accountId !== a.id) continue;
    b += t.type === 'income' ? t.amount : -t.amount;   // despesa, fatura paga e valor guardado saem da conta
  }
  return round2(b);
}
export const bankBalance = (d) => round2(d.accounts.reduce((s, a) => s + accountBalance(d, a), 0));
export function foodBalance(d, card) {
  let b = card.initialBalance || 0;
  for (const t of all(d)) if (t.cardId === card.id) b += t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0;
  return round2(b);
}
export const savedTotal = (d) => sum(all(d).filter((t) => t.type === 'saving'), (t) => t.amount);
export const goalSaved = (d, g) => sum(all(d).filter((t) => t.type === 'saving' && t.goalId === g.id), (t) => t.amount);

// ------------------------------------------------------------------ cartão de crédito
/** Mês de VENCIMENTO da fatura em que uma compra feita em `date` cai. */
export function invoiceMonth(card, date) {
  const m = ym(date), day = Number(date.slice(8, 10));
  const closing = day > (card.closingDay || 31) ? addMonths(m, 1) : m;
  return (card.dueDay || 1) <= (card.closingDay || 31) ? addMonths(closing, 1) : closing;
}
export function invoiceInfo(d, card, month) {
  let charged = 0, paid = 0;
  for (const t of all(d)) {
    if (t.cardId !== card.id) continue;
    if (t.type === 'expense' && invoiceMonth(card, t.date) === month) charged += t.amount;
    if (t.type === 'card_payment' && t.refMonth === month) paid += t.amount;
  }
  charged = round2(charged); paid = round2(paid);
  return { month, charged, paid, open: Math.max(0, round2(charged - paid)), due: dueDate(month, card.dueDay || 1) };
}
export function creditUsed(d, card) {
  let u = 0;
  for (const t of all(d)) if (t.cardId === card.id) u += t.type === 'expense' ? t.amount : t.type === 'card_payment' ? -t.amount : 0;
  return Math.max(0, round2(u));
}

// ------------------------------------------------------------------ contas fixas
const billFrom = (b) => b.startMonth || ym(b.createdAt || '0000-01');
export const billApplies = (b, m) => !b.archived && billFrom(b) <= m && (!b.endMonth || b.endMonth >= m);

export function billStatus(d, b, month, today) {
  const paidTx = all(d).find((t) => t.fixedBillId === b.id && t.type === 'expense' && ym(t.date) === month);
  const due = dueDate(month, b.dueDay);
  if (paidTx) return { status: 'paid', due, tx: paidTx, lateDays: Math.max(0, diffDays(due, paidTx.date)) };
  const late = today > due;
  return { status: late ? 'late' : 'pending', due, tx: null, lateDays: late ? diffDays(due, today) : 0 };
}
export function billsForMonth(d, month, today) {
  return d.fixedBills.filter((b) => billApplies(b, month))
    .map((b) => ({ bill: b, ...billStatus(d, b, month, today) })).sort((a, b) => a.due.localeCompare(b.due));
}
/** Quantas vezes a conta foi paga depois do vencimento (ou segue em aberto vencida) nos últimos meses. */
export function lateHistory(d, b, today, back = 6) {
  const cur = ym(today); let late = 0, counted = 0;
  for (let i = -back; i <= 0; i++) {
    const m = addMonths(cur, i);
    if (!billApplies(b, m)) continue;
    const s = billStatus(d, b, m, today);
    if (s.status === 'pending') continue;
    counted++; if (s.lateDays > 0) late++;
  }
  return { late, counted };
}
/** Contas ainda não pagas com vencimento até `to` (inclui as atrasadas). */
export function unpaidBillsUntil(d, today, to) {
  const out = [];
  for (let m = addMonths(ym(today), -1); m <= ym(to); m = addMonths(m, 1)) {
    for (const x of billsForMonth(d, m, today)) if (x.status !== 'paid' && x.due <= to && (m >= ym(today) || x.status === 'late')) out.push(x);
  }
  return out;
}

// ------------------------------------------------------------------ projeções
/** Média diária de gastos variáveis (exclui contas fixas e cartão alimentação). */
export function variableStats(d, txs, today, windowDays = 60) {
  const start = addDays(today, -windowDays);
  const dates = all(d).map((t) => t.date).filter((x) => x <= today);
  const first = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : today;
  const span = Math.min(windowDays, Math.max(1, diffDays(first > start ? first : start, today)));
  const rel = txs.filter((t) => t.type === 'expense' && !t.fixedBillId && !isFood(d, t) && t.date >= start && t.date < today);
  const total = sum(rel, (t) => t.amount);
  return { daily: total / span, spanDays: span, total, lowConfidence: span < 14 || rel.length < 5 };
}

export function projectSpend(d, today, days, txs = d.transactions) {
  const v = variableStats(d, txs, today), end = addDays(today, days);
  const items = unpaidBillsUntil(d, today, end);
  const fixed = sum(items, (x) => x.bill.amount), variable = round2(v.daily * days);
  return { days, variable, fixed, total: round2(variable + fixed), items, lowConfidence: v.lowConfidence, dailyAvg: round2(v.daily) };
}
/** Curva acumulada de gasto previsto dia a dia (para o gráfico). */
export function spendCurve(d, today, days = 30, txs = d.transactions) {
  const v = variableStats(d, txs, today), items = unpaidBillsUntil(d, today, addDays(today, days));
  return Array.from({ length: days + 1 }, (_, i) => {
    const date = addDays(today, i);
    return { i, date, value: round2(v.daily * i + sum(items.filter((x) => (x.due < today ? 0 : diffDays(today, x.due)) <= i), (x) => x.bill.amount)) };
  });
}

/** Receitas recorrentes: aparecem em ao menos 2 dos 3 meses anteriores. */
export function expectedIncome(d, today, txs = d.transactions) {
  const cur = ym(today), prev = [-3, -2, -1].map((i) => addMonths(cur, i));
  const key = (t) => `${norm(t.description || t.merchant)}|${t.categoryId || ''}`;
  const groups = new Map();
  const bank = txs.filter((t) => t.type === 'income' && !isFood(d, t));
  for (const t of bank) {
    const m = ym(t.date);
    if (!prev.includes(m)) continue;
    const g = groups.get(key(t)) || { key: key(t), label: t.description || t.merchant || 'Receita', byMonth: {} };
    g.byMonth[m] = (g.byMonth[m] || 0) + t.amount; groups.set(key(t), g);
  }
  const rec = [...groups.values()].filter((g) => Object.keys(g.byMonth).length >= 2).map((g) => {
    const vals = Object.values(g.byMonth);
    const received = sum(bank.filter((t) => ym(t.date) === cur && key(t) === g.key), (t) => t.amount);
    const expected = round2(vals.reduce((a, b) => a + b, 0) / vals.length);
    return { key: g.key, label: g.label, expected, received, remaining: Math.max(0, round2(expected - received)) };
  });
  return {
    has: rec.length > 0, groups: rec, expected: sum(rec, (g) => g.expected), remaining: sum(rec, (g) => g.remaining),
    received: sum(bank.filter((t) => ym(t.date) === cur), (t) => t.amount)
  };
}

/** Saldo estimado no fim do mês (conservador: gasto variável futuro é tratado como saída da conta). */
export function monthEnd(d, today, txs = d.transactions) {
  const m = ym(today), last = `${m}-${pad(daysInMonth(m))}`, daysLeft = diffDays(today, last);
  const v = variableStats(d, txs, today), inc = expectedIncome(d, today, txs);
  const pendingFixed = sum(unpaidBillsUntil(d, today, last), (x) => x.bill.amount);
  let invoices = 0;
  for (const c of d.cards.filter((x) => x.kind === 'credit')) {
    for (const mm of [addMonths(m, -1), m]) { const i = invoiceInfo(d, c, mm); if (i.open > 0 && i.due <= last) invoices += i.open; }
  }
  invoices = round2(invoices);
  const balance = bankBalance(d), remainingVariable = round2(v.daily * daysLeft);
  return {
    daysLeft, balance, remainingIncome: inc.remaining, pendingFixed, invoicesDue: invoices, remainingVariable,
    projected: round2(balance + inc.remaining - pendingFixed - invoices - remainingVariable), lowConfidence: v.lowConfidence, hasIncomeHistory: inc.has
  };
}

/** Estimativa do mês seguinte: receitas recorrentes − contas fixas − gasto variável médio. */
export function nextMonth(d, today, txs = d.transactions) {
  const next = addMonths(ym(today), 1), v = variableStats(d, txs, today), inc = expectedIncome(d, today, txs);
  const fixed = sum(d.fixedBills.filter((b) => billApplies(b, next)), (b) => b.amount);
  const variable = round2(v.daily * daysInMonth(next));
  return { month: next, income: inc.expected, fixed, variable, leftover: round2(inc.expected - fixed - variable), lowConfidence: v.lowConfidence, hasIncomeHistory: inc.has };
}

/** Despesas que se repetem em ao menos 3 dos últimos 6 meses (assinaturas, mensalidades...). */
export function recurringExpenses(d, today, txs = d.transactions) {
  const cur = ym(today), months = Array.from({ length: 6 }, (_, i) => addMonths(cur, -i));
  const groups = new Map();
  for (const t of txs) {
    if (t.type !== 'expense' || isFood(d, t) || !months.includes(ym(t.date))) continue;
    const k = norm(t.merchant || t.description); if (!k) continue;
    const g = groups.get(k) || { key: k, label: t.merchant || t.description, categoryId: t.categoryId, byMonth: {}, count: 0, fixed: false };
    g.byMonth[ym(t.date)] = (g.byMonth[ym(t.date)] || 0) + t.amount; g.count++; g.fixed ||= !!t.fixedBillId; groups.set(k, g);
  }
  return [...groups.values()].filter((g) => Object.keys(g.byMonth).length >= 3).map((g) => {
    const vals = Object.values(g.byMonth);
    return { ...g, months: vals.length, avg: round2(vals.reduce((a, b) => a + b, 0) / vals.length), tag: tagOf(d, { categoryId: g.categoryId }) };
  }).sort((a, b) => b.avg - a.avg);
}

/** Categorias cujo gasto do mês, proporcional aos dias, passou da média dos 3 meses anteriores. */
export function categoryGrowth(d, today, txs = d.transactions, factor = 1.3, minDiff = 100) {
  const cur = ym(today), day = Number(today.slice(8, 10)), frac = day / daysInMonth(cur);
  const now = monthTotals(d, cur, txs).byCat, prev = [-3, -2, -1].map((i) => monthTotals(d, addMonths(cur, i), txs).byCat);
  const out = [];
  for (const id of Object.keys(now)) {
    const hist = prev.map((p) => p[id] || 0), withData = hist.filter((x) => x > 0);
    if (withData.length < 2) continue;
    const avg = withData.reduce((a, b) => a + b, 0) / 3, expected = avg * frac;
    if (now[id] > expected * factor && now[id] - expected > minDiff) out.push({ categoryId: id, now: now[id], expected: round2(expected), avgMonth: round2(avg) });
  }
  return out.sort((a, b) => (b.now - b.expected) - (a.now - a.expected));
}

// ------------------------------------------------------------------ planejamento 30/50/20
export function budget(d, today, month = ym(today), txs = d.transactions) {
  const split = { reserve: 30, bills: 50, others: 20, ...(d.settings.budgetSplit || {}) };
  const tot = monthTotals(d, month, txs), inc = expectedIncome(d, month === ym(today) ? today : `${month}-28`, txs);
  const base = d.settings.incomeBase === 'received' ? tot.income : Math.max(tot.income, inc.expected);
  let bills = 0, others = 0;
  for (const t of txs) {
    if (t.type !== 'expense' || ym(t.date) !== month || isFood(d, t)) continue;
    if (bucketOf(d, t) === 'bills') bills += t.amount; else others += t.amount;
  }
  const row = (key, label, pct, actual) => {
    const planned = round2(base * pct / 100), ratio = planned > 0 ? actual / planned : 0;
    const status = key === 'reserve' ? (actual >= planned && planned > 0 ? 'ok' : 'behind') : ratio > 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok';
    return { key, label, pct, planned, actual: round2(actual), ratio, status, diff: round2(planned - actual) };
  };
  return { base: round2(base), received: tot.income, expectedIncome: inc.expected, split,
    rows: [row('reserve', 'Reserva', split.reserve, tot.saved), row('bills', 'Contas', split.bills, bills), row('others', 'Outros', split.others, others)] };
}

/** Resultado projetado do mês (competência): receitas do mês − gastos do mês, incluindo o que ainda vem. */
export function monthResult(d, today, txs = d.transactions) {
  const m = ym(today), tot = monthTotals(d, m, txs), inc = expectedIncome(d, today, txs), me = monthEnd(d, today, txs);
  return {
    income: round2(tot.income + inc.remaining), spent: tot.expense, remainingVariable: me.remainingVariable, pendingFixed: me.pendingFixed,
    result: round2(tot.income + inc.remaining - tot.expense - me.remainingVariable - me.pendingFixed), lowConfidence: me.lowConfidence, hasIncomeHistory: inc.has
  };
}
