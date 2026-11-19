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

/** 'expense' (conta fixa) ou 'income' (receita fixa). Registros antigos, sem tipo, são contas. */
export const billKind = (b) => (b.kind === 'income' ? 'income' : 'expense');

export function billStatus(d, b, month, today) {
  const paidTx = all(d).find((t) => t.fixedBillId === b.id && t.type === billKind(b) && ym(t.date) === month);
  const due = dueDate(month, b.dueDay);
  if (paidTx) return { status: 'paid', due, tx: paidTx, lateDays: Math.max(0, diffDays(due, paidTx.date)) };
  const late = today > due;
  return { status: late ? 'late' : 'pending', due, tx: null, lateDays: late ? diffDays(due, today) : 0 };
}
/** Conta variável: o valor muda todo mês (água, luz). O previsto é a média dos meses pagos. */
export const isVariable = (b) => billKind(b) === 'expense' && b.billType === 'variable';
export function billPaid(d, b, m) {
  const v = all(d).filter((t) => t.fixedBillId === b.id && t.type === billKind(b) && ym(t.date) === m);
  return v.length ? round2(sum(v, (t) => t.amount)) : null;
}
export function billAverage(d, b, month, n = 6) {
  const vals = [];
  for (let i = 1; i <= n; i++) { const v = billPaid(d, b, addMonths(month, -i)); if (v != null) vals.push(v); }
  return { avg: vals.length ? round2(sum(vals, (x) => x) / vals.length) : null, count: vals.length };
}
export function billsForMonth(d, month, today, kind = 'expense') {
  return d.fixedBills.filter((b) => billKind(b) === kind && billApplies(b, month))
    .map((b) => {
      const st = billStatus(d, b, month, today);
      if (!isVariable(b)) return { bill: b, ...st };
      const { avg, count } = billAverage(d, b, month);
      return { bill: { ...b, amount: st.tx ? st.tx.amount : avg ?? b.amount }, base: b, avg, avgCount: count, ...st };
    }).sort((a, b) => a.due.localeCompare(b.due));
}
/** Série mês a mês das contas variáveis (uma linha por conta). */
export function variableSeries(d, endMonth, n = 12, categoryId = '') {
  const months = Array.from({ length: n }, (_, i) => addMonths(endMonth, i - n + 1));
  const lines = d.fixedBills.filter((b) => isVariable(b) && !b.archived && (!categoryId || b.categoryId === categoryId))
    .map((b) => ({ bill: b, values: months.map((m) => billPaid(d, b, m)) })).filter((l) => l.values.some((v) => v != null));
  return { months, lines };
}
export function lateHistory(d, b, today, back = 6) {   // vale também para receitas fixas (recebidas fora do dia)
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

/**
 * Receitas esperadas no mês: receitas FIXAS cadastradas (valor e dia certos) + receitas recorrentes
 * detectadas no histórico (aparecem em ao menos 2 dos 3 meses anteriores, fora as ligadas a receita fixa).
 */
export function expectedIncome(d, today, txs = d.transactions) {
  const cur = ym(today), prev = [-3, -2, -1].map((i) => addMonths(cur, i));
  const key = (t) => `${norm(t.description || t.merchant)}|${t.categoryId || ''}`;
  const groups = new Map();
  const bank = txs.filter((t) => t.type === 'income' && !isFood(d, t));
  for (const t of bank) {
    const m = ym(t.date);
    if (!prev.includes(m) || t.fixedBillId) continue;
    const g = groups.get(key(t)) || { key: key(t), label: t.description || t.merchant || 'Receita', byMonth: {} };
    g.byMonth[m] = (g.byMonth[m] || 0) + t.amount; groups.set(key(t), g);
  }
  const rec = [...groups.values()].filter((g) => Object.keys(g.byMonth).length >= 2).map((g) => {
    const vals = Object.values(g.byMonth);
    const received = sum(bank.filter((t) => ym(t.date) === cur && !t.fixedBillId && key(t) === g.key), (t) => t.amount);
    const expected = round2(vals.reduce((a, b) => a + b, 0) / vals.length);
    return { key: g.key, label: g.label, expected, received, remaining: Math.max(0, round2(expected - received)), fixed: false };
  });
  const fx = billsForMonth(d, cur, today, 'income').map((x) => ({
    key: `fixed:${x.bill.id}`, label: x.bill.name, expected: x.bill.amount, received: x.tx ? x.tx.amount : 0,
    remaining: x.status === 'paid' ? 0 : x.bill.amount, fixed: true, due: x.due, status: x.status
  }));
  const recurringExpected = sum(rec, (g) => g.expected), fixedExpected = sum(fx, (g) => g.expected);
  return {
    has: rec.length > 0 || fx.length > 0, groups: [...fx, ...rec], expected: round2(recurringExpected + fixedExpected),
    recurringExpected, fixedExpected, remaining: sum([...fx, ...rec], (g) => g.remaining),
    received: sum(bank.filter((t) => ym(t.date) === cur), (t) => t.amount)
  };
}
/** Receitas fixas ainda não recebidas com data até `to` (inclui as atrasadas). */
export function pendingIncomeUntil(d, today, to) {
  const out = [];
  for (let m = addMonths(ym(today), -1); m <= ym(to); m = addMonths(m, 1)) {
    for (const x of billsForMonth(d, m, today, 'income')) if (x.status !== 'paid' && x.due <= to && (m >= ym(today) || x.status === 'late')) out.push(x);
  }
  return out;
}
/** Entradas e saídas previstas nos próximos `days` dias (receitas fixas a receber × gastos previstos). */
export function projectFlow(d, today, days, txs = d.transactions) {
  const sp = projectSpend(d, today, days, txs), items = pendingIncomeUntil(d, today, addDays(today, days));
  const income = sum(items, (x) => x.bill.amount);
  return { days, income, incomeItems: items, spend: sp.total, net: round2(income - sp.total), lowConfidence: sp.lowConfidence };
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

/** Estimativa do mês seguinte: receitas (fixas + recorrentes) − contas fixas − gasto variável médio. */
export function nextMonth(d, today, txs = d.transactions) { return monthForecast(d, today, 1, txs); }

/** Previsão de um mês futuro (n >= 1) com a mesma regra. */
export function monthForecast(d, today, n, txs = d.transactions) {
  const month = addMonths(ym(today), n), v = variableStats(d, txs, today), inc = expectedIncome(d, today, txs);
  const fixedInc = sum(d.fixedBills.filter((b) => billKind(b) === 'income' && billApplies(b, month)), (b) => b.amount);
  const income = round2(inc.recurringExpected + fixedInc);
  const fixed = sum(d.fixedBills.filter((b) => billKind(b) === 'expense' && billApplies(b, month)), (b) => b.amount);
  const variable = round2(v.daily * daysInMonth(month));
  return { month, income, fixed, variable, expense: round2(fixed + variable), leftover: round2(income - fixed - variable),
    lowConfidence: v.lowConfidence, hasIncomeHistory: inc.has || fixedInc > 0 };
}

/** Visão dos próximos meses: o mês atual (já com o que falta acontecer) e os seguintes. */
export function outlook(d, today, months = 6, txs = d.transactions) {
  const cur = monthResult(d, today, txs), curFixed = sum(d.fixedBills.filter((b) => billKind(b) === 'expense' && billApplies(b, ym(today))), (b) => b.amount);
  const rows = [{ month: ym(today), income: cur.income, fixed: curFixed, expense: round2(cur.spent + cur.remainingVariable + cur.pendingFixed), leftover: cur.result, lowConfidence: cur.lowConfidence, current: true }];
  for (let i = 1; i <= months; i++) rows.push({ ...monthForecast(d, today, i, txs), current: false });
  let acc = 0; for (const r of rows) { acc = round2(acc + r.leftover); r.cumulative = acc; }
  return rows;
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

// ------------------------------------------------------------------ saúde financeira e reserva
const clamp01 = (x) => Math.max(0, Math.min(1, x));
/**
 * Nota de 0 a 100 da saúde financeira do mês, em 4 partes transparentes:
 *  guardado (30) · resultado do mês (30) · contas em dia (20) · peso das contas fixas na renda (20).
 * Partes sem dados suficientes ficam de fora (o peso é redistribuído). Sem dados: hasData=false.
 */
export function healthScore(d, today, txs = d.transactions) {
  const m = ym(today), tot = monthTotals(d, m, txs), res = monthResult(d, today, txs), b = budget(d, today, m, txs);
  const income = Math.max(res.income, 0), parts = [];
  if (b.base > 0) {
    const target = b.rows[0].planned;
    parts.push({ key: 'save', label: 'Guardado no mês', weight: 30, score: target > 0 ? clamp01(tot.saved / target) : 1, detail: `${Math.round(tot.saved)} de ${Math.round(target)} previstos (${b.split.reserve}% da renda)` });
  }
  if (income > 0) parts.push({ key: 'result', label: 'Resultado do mês', weight: 30, score: res.result >= 0 ? 1 : clamp01(1 + res.result / income), detail: res.result >= 0 ? 'Entradas cobrem os gastos' : 'Gastos passam das entradas' });
  const bills = billsForMonth(d, m, today), late = bills.filter((x) => x.status === 'late').length;
  if (bills.length) parts.push({ key: 'bills', label: 'Contas em dia', weight: 20, score: clamp01(1 - late * 0.34), detail: late ? `${late} conta(s) atrasada(s)` : 'Nenhuma atrasada' });
  const fixedTotal = sum(bills, (x) => x.bill.amount);
  if (income > 0 && bills.length) { const r = fixedTotal / income; parts.push({ key: 'fixed', label: 'Peso das contas fixas', weight: 20, score: r <= 0.5 ? 1 : clamp01(1 - (r - 0.5) / 0.5), detail: `${Math.round(r * 100)}% da renda (ideal até 50%)` }); }
  const w = parts.reduce((a, p) => a + p.weight, 0);
  const hasData = parts.length > 0 && (tot.income > 0 || tot.expense > 0 || income > 0);
  const score = w ? Math.round(parts.reduce((a, p) => a + p.score * p.weight, 0) / w * 100) : 0;
  const label = !hasData ? 'Sem dados' : score >= 85 ? 'Ótima' : score >= 70 ? 'Boa' : score >= 40 ? 'Regular' : 'Atenção';
  return { score, label, hasData, parts: parts.map((p) => ({ ...p, score: Math.round(p.score * 100) })) };
}

/** Copo de reserva: quanto já foi guardado da meta (soma das metas ativas ou, sem metas, 3 meses de gastos). */
export function reserveGlass(d, today) {
  const vaultIds = new Set(d.goals.filter((g) => g.kind === 'vault').map((g) => g.id));
  const saved = round2(savedTotal(d) - sum(all(d).filter((t) => t.type === 'saving' && vaultIds.has(t.goalId)), (t) => t.amount));
  const goalsTarget = sum(d.goals.filter((g) => !g.archived && g.kind !== 'vault'), (g) => g.target);
  if (goalsTarget > 0) return { saved, target: goalsTarget, level: clamp01(saved / goalsTarget), basis: 'goals' };
  const cur = ym(today), exp = [1, 2, 3].map((i) => monthTotals(d, addMonths(cur, -i), d.allTx || d.transactions).expense).filter((x) => x > 0);
  if (exp.length) { const target = round2(3 * exp.reduce((a, b) => a + b, 0) / exp.length); return { saved, target, level: clamp01(saved / target), basis: 'reserve3m' }; }
  return { saved, target: 0, level: 0, basis: 'none' };
}

// ------------------------------------------------------------------ cofre de segurança (meses de custo de vida guardados)
/** Custo de vida mensal: o que a pessoa informou, ou a média dos gastos dos últimos 3 meses (ou das contas fixas). */
export function livingCost(d, today, settings = {}) {
  if (settings.vault?.monthlyCost > 0) return { value: settings.vault.monthlyCost, basis: 'manual' };
  const cur = ym(today), exp = [1, 2, 3].map((i) => monthTotals(d, addMonths(cur, -i), d.allTx || d.transactions).expense).filter((x) => x > 0);
  if (exp.length) return { value: round2(sum(exp, (x) => x) / exp.length), basis: 'history' };
  const fixed = sum(billsForMonth(d, cur, today), (x) => x.bill.amount);
  return fixed > 0 ? { value: round2(fixed), basis: 'fixed' } : { value: 0, basis: 'none' };
}
export function vaultInfo(d, today, settings = {}) {
  const goal = d.goals.find((g) => g.kind === 'vault' && !g.archived) || null;
  const months = settings.vault?.months || 6, cost = livingCost(d, today, settings);
  const target = round2(cost.value * months), saved = goal ? goalSaved(d, goal) : 0;
  const monthsSafe = cost.value > 0 ? round2(saved / cost.value) : 0;
  return { goal, months, cost, target, saved, level: target > 0 ? clamp01(saved / target) : 0, monthsSafe, daysSafe: Math.floor(monthsSafe * 30), missing: Math.max(0, round2(target - saved)) };
}

// ------------------------------------------------------------------ despensa
export const pantryUnits = (it) => round2((it.packs || 0) * (it.perPack || 0) + (it.units || 0));
export function pantryInfo(items, people, today) {
  const rows = items.filter((i) => !i.archived).map((it) => {
    const units = pantryUnits(it), perDay = (it.perPersonDay || 0) * people;
    const days = perDay > 0 ? Math.floor(units / perDay) : null;
    const left = it.expiry ? diffDays(today, it.expiry) : null;
    return { it, units, days, expiresIn: left, status: left == null ? 'ok' : left < 0 ? 'expired' : left <= 30 ? 'soon' : 'ok', outsDays: days };
  });
  const withDays = rows.filter((r) => r.days != null);
  const avg = withDays.length ? Math.floor(sum(withDays, (r) => r.days) / withDays.length) : null;
  const first = withDays.length ? withDays.reduce((a, b) => (b.days < a.days ? b : a)) : null;
  return { rows, avgDays: avg, first, expired: rows.filter((r) => r.status === 'expired').length, soon: rows.filter((r) => r.status === 'soon').length, count: rows.length };
}

// ------------------------------------------------------------------ contracheque
/** Pagamento do salário cai no mês seguinte ao de referência (ex.: 05/10 refere-se a setembro). */
export const refMonthOf = (payDate) => addMonths(ym(payDate), -1);
