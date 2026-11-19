/**
 * dashboard.js — painel: indicadores, gráficos comparativos, previsão e insights.
 * Os cálculos ficam em projections.js; este módulo só monta a tela.
 */
import * as store from './store.js';
import * as P from './projections.js';
import { $, esc, icon, drop, pill, emptyState, brl, brlShort, fmtDate, monthShort, monthLabel } from './ui.js';
import { barChart, donutChart, areaChart, gauge, cup, bar } from './charts.js';
import { insightsFor, insightCard } from './insights-view.js';
import { txRow } from './transactions.js';

const kpi = ({ l, v, s = '', tone = 'brand', href = '', big = false, ic = '' }) =>
  `<${href ? `a href="${href}"` : 'div'} class="kpi tone-${tone} ${big ? 'big' : ''}"><span class="kpi-l">${esc(l)}</span><span class="kpi-v">${esc(v)}</span>${s ? `<span class="kpi-s">${esc(s)}</span>` : ''}</${href ? 'a' : 'div'}>`;

function onboarding(d) {
  const steps = [
    [d.accounts.length > 0, 'Cadastre uma conta bancária', '#/accounts'],
    [d.cards.some((c) => c.kind === 'food'), 'Cadastre o cartão alimentação (se tiver)', '#/cards'],
    [d.fixedBills.length > 0, 'Cadastre as contas fixas do mês', '#/fixed'],
    [d.transactions.length > 0, 'Faça o primeiro lançamento', '#/extract']
  ];
  return `<article class="card onboard"><h3>Vamos começar</h3><p class="muted">Quatro passos e o painel começa a mostrar seus números.</p><ol class="steps">${steps.map(([done, label, href]) => `<li class="${done ? 'done' : ''}"><a href="${href}"><span class="step-dot">${done ? icon('check') : ''}</span>${esc(label)}</a></li>`).join('')}</ol></article>`;
}

export function render(view) {
  const d = store.data(), today = store.today(), month = store.prefs.month, isCur = month === P.ym(today);
  const me = store.state.me;
  $('#db-hello', view).textContent = `Olá, ${me?.name || ''}`;
  $('#db-sub', view).textContent = `${monthLabel(month)} · ${store.prefs.who === 'family' ? 'visão da família' : store.userName(store.prefs.who)}`;

  const empty = !d.accounts.length || !d.transactions.length;
  $('#db-onboard', view).innerHTML = empty ? onboarding(d) : '';

  // velocímetro de saúde financeira + copo da reserva
  const hs = P.healthScore(d, today), glass = P.reserveGlass(d, today);
  const tone = !hs.hasData ? 'var(--muted)' : hs.score >= 85 ? 'var(--income)' : hs.score >= 70 ? '#5fae4a' : hs.score >= 40 ? 'var(--warn)' : 'var(--expense)';
  const basisText = glass.basis === 'goals' ? `da meta de ${brl(glass.target)} (suas metas)` : glass.basis === 'reserve3m' ? `de ${brl(glass.target)}: 3 meses de gastos` : '';
  $('#db-hero', view).innerHTML = `<article class="card"><header class="card-h"><h3>Saúde financeira</h3><a class="muted small" href="#/planning">Planejamento</a></header>
      <div class="health">${gauge({ score: hs.score, label: hs.label, hasData: hs.hasData, tone })}
      <div class="health-parts">${hs.hasData ? hs.parts.map((p) => `<div class="hp"><div class="hp-h"><span>${esc(p.label)}</span><span>${p.score}</span></div>${bar(p.score / 100, p.score >= 70 ? 'ok' : p.score >= 40 ? 'warn' : 'over')}<small>${esc(p.detail)}</small></div>`).join('') : '<p class="muted">Lance receitas, despesas e cadastre as contas fixas: a nota aparece aqui, calculada só com os seus números.</p>'}</div></div></article>
    <article class="card"><header class="card-h"><h3>Copo da reserva</h3><a class="muted small" href="#/goals">Metas</a></header>
      <div class="cup-wrap">${cup(glass.level, { label: 'Reserva' })}
      <div class="cup-info"><span class="cup-pct">${Math.round(glass.level * 100)}%</span><b>${esc(brl(glass.saved))} guardados</b>${basisText ? `<span class="muted">${esc(basisText)}</span>` : '<span class="muted">Crie uma meta (ou guarde dinheiro) e o copo começa a encher.</span>'}${glass.level >= 1 ? pill('Copo cheio! Meta atingida', 'ok') : ''}<a class="btn btn-soft sm" href="#/goals">Guardar dinheiro</a></div></div></article>`;

  const tot = P.monthTotals(d, month), bills = P.billsForMonth(d, month, today);
  const pend = bills.filter((x) => x.status === 'pending'), late = bills.filter((x) => x.status === 'late');
  const sumB = (l) => l.reduce((s, x) => s + x.bill.amount, 0);
  const foods = d.cards.filter((c) => c.kind === 'food'), foodBal = foods.reduce((s, c) => s + P.foodBalance(d, c), 0);
  const me2 = isCur && d.accounts.length ? P.monthEnd(d, today) : null;
  const k = [
    { l: 'Saldo bancário disponível', v: d.accounts.length ? brl(P.bankBalance(d)) : '—', s: d.accounts.length ? `${d.accounts.length} conta${d.accounts.length > 1 ? 's' : ''}` : 'Cadastre uma conta', tone: 'brand', big: true, href: '#/accounts' },
    { l: 'Receitas do mês', v: brl(tot.income), tone: 'income', big: true, href: '#/extract' },
    { l: 'Despesas do mês', v: brl(tot.expense), tone: 'expense', big: true, href: '#/extract' },
    { l: 'Saldo após despesas', v: brl(tot.result), tone: tot.result >= 0 ? 'income' : 'expense', big: true },
    { l: 'Contas pendentes', v: brl(sumB(pend)), s: `${pend.length} conta${pend.length === 1 ? '' : 's'} a vencer`, tone: 'info', href: '#/fixed' },
    { l: 'Contas atrasadas', v: brl(sumB(late)), s: `${late.length} em atraso`, tone: late.length ? 'expense' : 'ok', href: '#/fixed' },
    { l: 'Receitas fixas do mês', v: brl(P.billsForMonth(d, month, today, 'income').reduce((s, x) => s + x.bill.amount, 0)), s: 'Entradas previstas', tone: 'income', href: '#/fixed' },
    { l: 'Gasto fixo do mês', v: brl(sumB(bills)), s: `${bills.length} conta${bills.length === 1 ? '' : 's'} fixa${bills.length === 1 ? '' : 's'}`, tone: 'info', href: '#/fixed' },
    { l: 'Gastos individuais', v: brl(tot.individual), tone: 'violet' },
    { l: 'Gastos familiares', v: brl(tot.shared), s: 'Compartilhados', tone: 'violet' },
    { l: 'Moradia', v: brl(tot.byTag.housing || 0), tone: 'sky' },
    { l: 'Veículo', v: brl(tot.byTag.vehicle || 0), tone: 'sky' },
    { l: 'Combustível', v: brl(tot.byTag.fuel || 0), tone: 'amber' },
    { l: 'Alimentação', v: brl(P.foodSpending(tot)), s: 'Inclui o cartão alimentação', tone: 'amber' },
    { l: 'Saldo do cartão alimentação', v: foods.length ? brl(foodBal) : '—', s: foods.length ? 'Separado do saldo das contas' : 'Não cadastrado', tone: 'ok', href: '#/cards' },
    { l: 'Economia acumulada', v: brl(P.savedTotal(d)), tone: 'income', href: '#/goals' },
    { l: 'Projeção no fim do mês', v: me2 ? brl(me2.projected) : '—', s: me2 ? `Saldo estimado em ${monthLabel(month)}` : isCur ? 'Cadastre uma conta' : 'Só para o mês atual', tone: me2 && me2.projected < 0 ? 'expense' : 'brand', href: '#/planning' }
  ];
  $('#db-kpis', view).innerHTML = k.map(kpi).join('');

  // comparativo mensal: 6 meses terminando no mês selecionado
  const months = Array.from({ length: 6 }, (_, i) => P.addMonths(month, i - 5)), mt = months.map((m) => P.monthTotals(d, m));
  $('#db-bars', view).innerHTML = mt.some((x) => x.income || x.expense)
    ? barChart({ labels: months.map(monthShort), series: [{ name: 'Receitas', color: 'var(--income)', values: mt.map((x) => x.income) }, { name: 'Despesas', color: 'var(--expense)', values: mt.map((x) => x.expense) }], label: 'Receitas e despesas dos últimos 6 meses' })
    : emptyState('chart', 'Sem dados para comparar', 'Os meses aparecem aqui conforme você lança.');

  // para onde foi o dinheiro
  const cats = Object.entries(tot.byCat).map(([id, v]) => ({ id, v, c: store.categoryOf(id) })).sort((a, b) => b.v - a.v);
  const top = cats.slice(0, 5).map((x) => ({ label: x.c?.name || 'Sem categoria', value: x.v, color: x.c?.color || '#8395a7' }));
  const rest = cats.slice(5).reduce((s, x) => s + x.v, 0);
  if (rest > 0) top.push({ label: 'Outras', value: rest, color: '#b9c6d1' });
  const spent = cats.reduce((s, x) => s + x.v, 0);
  $('#db-donut', view).innerHTML = spent > 0 ? donutChart({ items: top, centerTop: brlShort(spent), centerBottom: 'em gastos', label: 'Gastos por categoria' }) : emptyState('chart', 'Nenhum gasto neste mês');

  // previsão
  const projBox = $('#db-proj', view);
  if (isCur && d.transactions.length) {
    const spans = [7, 15, 30].map((n) => P.projectSpend(d, today, n)), curve = P.spendCurve(d, today, 30);
    projBox.innerHTML = `<div class="chips">${spans.map((s) => `<span class="chip"><small>${s.days} dias</small><b>${esc(brl(s.total))}</b></span>`).join('')}</div>` +
      areaChart({ points: curve.map((p) => ({ label: fmtDate(p.date).slice(0, 5), value: p.value })), color: 'var(--expense)', label: 'Gasto acumulado previsto' }) +
      (spans[0].lowConfidence ? '<p class="muted small">Estimativa inicial: ainda há pouco histórico de gastos.</p>' : '');
  } else projBox.innerHTML = emptyState('target', isCur ? 'Sem lançamentos para projetar' : 'A previsão vale para o mês atual');

  // próximas contas
  const next = bills.filter((x) => x.status !== 'paid').slice(0, 5);
  $('#db-bills', view).innerHTML = next.length ? next.map(({ bill, status, due }) => `<a class="mini-row" href="#/fixed">${drop(store.categoryOf(bill.categoryId)?.icon || '📅', store.categoryOf(bill.categoryId)?.color)}<span><b>${esc(bill.name)}</b><small class="muted">${esc(fmtDate(due).slice(0, 5))}</small></span><span>${pill(status === 'late' ? 'Atrasada' : 'A vencer', status === 'late' ? 'bad' : 'info')} <b>${esc(brl(bill.amount))}</b></span></a>`).join('') : '<p class="muted">Nenhuma conta pendente neste mês.</p>';

  // últimos lançamentos
  const last = [...d.transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1)).slice(0, 6);
  $('#db-last', view).innerHTML = last.length ? last.map((t) => txRow(t, { showOwner: store.prefs.who === 'family' })).join('') : '<p class="muted">Nenhum lançamento ainda.</p>';
  $('#db-last', view).onclick = async (e) => {
    const row = e.target.closest('.tx'); if (!row) return;
    const t = store.state.transactions.find((x) => x.id === row.dataset.id);
    if (t) (await import('./transactions.js')).openTxModal(t);
  };

  // insights (3 mais importantes)
  const ins = insightsFor();
  $('#db-insights', view).innerHTML = ins.length ? `<div class="insight-list">${ins.slice(0, 3).map(insightCard).join('')}</div>${ins.length > 3 ? `<a class="more-link" href="#/insights">Ver todos os ${ins.length} insights</a>` : ''}` : '';
}
