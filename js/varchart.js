/**
 * varchart.js — contas variáveis mês a mês: uma linha por conta (água, luz...), com filtro por categoria e média tracejada.
 */
import * as store from './store.js';
import * as P from './projections.js';
import { esc, emptyState, monthShort } from './ui.js';
import { lineChart } from './charts.js';

const COLORS = ['#2d9cdb', '#f2677a', '#1fb58a', '#f4a62a', '#8b7cf6', '#e84393', '#16a39a', '#ff8a5b'];
let filter = '';

/** Desenha o gráfico dentro de `box` (precisa de elementos .vc-select e .vc-chart criados aqui). */
export function renderVariableChart(box, { months = 9 } = {}) {
  const d = store.data(), month = store.prefs.month;
  const vars = d.fixedBills.filter((b) => P.isVariable(b) && !b.archived);
  if (!vars.length) { box.innerHTML = emptyState('chart', 'Nenhuma conta variável', 'Ao cadastrar uma conta, escolha "Variável" (água, luz...) para ver a linha mês a mês.'); return false; }
  const cats = [...new Set(vars.map((b) => b.categoryId).filter(Boolean))];
  if (filter && !cats.includes(filter)) filter = '';
  const { months: ms, lines } = P.variableSeries(d, month, months, filter);
  const opts = `<option value="">Todas as categorias</option>${cats.map((c) => `<option value="${esc(c)}" ${c === filter ? 'selected' : ''}>${esc(`${store.categoryOf(c)?.icon || ''} ${store.categoryOf(c)?.name || 'Categoria'}`.trim())}</option>`).join('')}`;
  box.innerHTML = `<div class="vc-bar"><label class="muted small" for="vc-cat">Filtrar</label><select id="vc-cat" class="vc-select">${opts}</select></div>
    <div class="vc-chart">${lines.length ? lineChart({ labels: ms.map(monthShort), series: lines.map((l, i) => ({ name: l.bill.name, color: COLORS[i % COLORS.length], values: l.values })), label: 'Contas variáveis mês a mês' }) : emptyState('chart', 'Sem pagamentos ainda', 'Pague as contas variáveis pela tela Contas F.V para a linha aparecer.')}</div>`;
  box.querySelector('#vc-cat').onchange = (e) => { filter = e.target.value; renderVariableChart(box, { months }); };
  return true;
}
