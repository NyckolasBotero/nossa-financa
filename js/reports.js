/**
 * reports.js — relatórios: comparativo mensal (vindo do backend), detalhe por categoria e exportação CSV.
 */
import * as api from './api.js';
import * as store from './store.js';
import * as P from './projections.js';
import { $, esc, emptyState, toast, brl, monthLabel, monthShort } from './ui.js';
import { barChart, donutChart } from './charts.js';

let span = 6, detail = '';
const TYPE = { income: 'Receita', expense: 'Despesa', card_payment: 'Fatura paga', saving: 'Guardado' };

/** CSV para Excel em português: separador ";", decimal com vírgula, BOM UTF-8 e proteção contra fórmulas. */
function downloadCsv(name, rows) {
  const cell = (v) => {
    let s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '');
    if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`;
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const pickOwner = (r) => { const w = store.prefs.who; return w === 'family' ? { income: r.income, expense: r.expense } : (r.byOwner[w] || { income: 0, expense: 0 }); };

let cache = null;   // último relatório baixado: reabrir a tela é instantâneo
export async function render(view) {
  const spanSel = $('#rp-span', view);
  spanSel.value = String(span);
  spanSel.onchange = () => { span = Number(spanSel.value); render(view); };
  const box = $('#rp-body', view);
  box.innerHTML = '<div class="skeleton"></div>';
  const key = `${span}|${P.ym(store.today())}`;
  const fresh = () => api.call('report.monthly', { months: span, end: P.ym(store.today()) }, { retries: 1 });
  const paint = (rows) => {

  const who = store.prefs.who, scopeName = who === 'family' ? 'Família' : store.userName(who);
  const vals = rows.map((r) => ({ r, ...pickOwner(r) }));
  if (!detail || !rows.some((r) => r.month === detail)) detail = rows[rows.length - 1].month;
  const sel = rows.find((r) => r.month === detail);
  const cats = Object.entries(sel.byCategory).map(([id, v]) => ({ label: store.categoryOf(id)?.name || 'Sem categoria', value: v, color: store.categoryOf(id)?.color || '#8395a7' })).sort((a, b) => b.value - a.value);

  box.innerHTML = `
    <article class="card"><header class="card-h"><h3>Receitas x despesas · ${esc(scopeName)}</h3></header>${vals.some((x) => x.income || x.expense) ? barChart({ labels: rows.map((r) => monthShort(r.month)), series: [{ name: 'Receitas', color: 'var(--income)', values: vals.map((x) => x.income) }, { name: 'Despesas', color: 'var(--expense)', values: vals.map((x) => x.expense) }] }) : emptyState('chart', 'Sem lançamentos no período')}</article>
    <article class="card"><header class="card-h"><h3>Resumo mensal · ${esc(scopeName)}</h3></header><div class="table-wrap"><table class="tbl"><thead><tr><th>Mês</th><th class="num">Receitas</th><th class="num">Despesas</th><th class="num">Resultado</th><th class="num">Guardado</th><th class="num">Cartão alim.</th></tr></thead><tbody>
      ${vals.slice().reverse().map(({ r, income, expense }) => `<tr><td>${esc(monthLabel(r.month))}</td><td class="num pos">${esc(brl(income))}</td><td class="num neg">${esc(brl(expense))}</td><td class="num ${income - expense >= 0 ? 'pos' : 'neg'}">${esc(brl(income - expense))}</td><td class="num">${esc(brl(r.saved))}</td><td class="num">${esc(brl(r.foodCardSpent))}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted small">Guardado e cartão alimentação são da família toda. O cartão alimentação não entra em receitas e despesas.</p></article>
    <article class="card"><header class="card-h"><h3>Gastos por categoria</h3><select id="rp-month" aria-label="Mês do detalhe">${rows.slice().reverse().map((r) => `<option value="${r.month}" ${r.month === detail ? 'selected' : ''}>${esc(monthLabel(r.month))}</option>`).join('')}</select></header>
      ${cats.length ? donutChart({ items: cats.slice(0, 8), centerTop: brl(cats.reduce((s, c) => s + c.value, 0)).replace(/ /g, ' '), centerBottom: 'no mês', label: 'Gastos por categoria' }) : emptyState('chart', 'Sem gastos neste mês')}
      <p class="muted small">Todas as pessoas, incluindo o cartão alimentação.</p></article>`;

  $('#rp-month', view).addEventListener('change', (e) => { detail = e.target.value; render(view); });

  $('#rp-csv-sum', view).onclick = () => downloadCsv(`resumo-mensal-${P.ym(store.today())}.csv`, [['Mês', 'Receitas', 'Despesas', 'Resultado', 'Guardado', 'Gasto cartão alimentação'], ...vals.map(({ r, income, expense }) => [r.month, income, expense, Math.round((income - expense) * 100) / 100, r.saved, r.foodCardSpent])]);
  $('#rp-csv-tx', view).onclick = () => {
    const from = `${rows[0].month}-01`, d = store.data();
    const list = d.transactions.filter((t) => t.date >= from).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!list.length) return toast('Nenhum lançamento no período.', { kind: 'info' });
    downloadCsv(`lancamentos-${P.ym(store.today())}.csv`, [['Data', 'Tipo', 'Valor', 'Descrição', 'Categoria', 'Conta ou cartão', 'Responsável', 'Gasto', 'Origem', 'Observações'],
      ...list.map((t) => [t.date, TYPE[t.type], t.amount, t.description, store.categoryOf(t.categoryId)?.name || '', store.sourceLabel(t), store.userName(t.ownerId), t.scope === 'shared' ? 'Compartilhado' : 'Individual', t.origin, t.notes || ''])]);
  };
  };
  // mostra na hora o último relatório já baixado (se houver) e atualiza em segundo plano
  if (cache && cache.key === key) {
    paint(cache.rows);
    fresh().then((rows) => { if (JSON.stringify(rows) !== JSON.stringify(cache.rows)) { cache = { key, rows }; if (view.dataset.page === 'reports') paint(rows); } }).catch(() => { /* mantém o que já está na tela */ });
    return;
  }
  let rows;
  try { rows = await fresh(); }
  catch (e) { box.innerHTML = emptyState('chart', 'Não consegui gerar o relatório', e.message, '<button class="btn btn-primary" data-retry>Tentar de novo</button>'); $('[data-retry]', box)?.addEventListener('click', () => render(view)); return; }
  cache = { key, rows };
  paint(rows);
}
