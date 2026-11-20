/**
 * daychart.js — dia a dia do mês: receitas e saídas acumuladas (2 linhas), com filtro por categoria e por "só Contas F.V".
 * Mostra quando as saídas alcançam a receita e quantos dias a receita dura no ritmo atual de gasto.
 */
import * as store from './store.js';
import * as P from './projections.js';
import { esc, brl, monthLabel } from './ui.js';
import { lineChart } from './charts.js';

const st = { cat: '', bills: false };

export function renderDayChart(box) {
  const d = store.data(), month = store.prefs.month, today = store.today();
  const cats = store.activeOf('categories');
  const opt = (c) => `<option value="${esc(c.id)}" ${c.id === st.cat ? 'selected' : ''}>${esc(`${c.icon || ''} ${c.name}`.trim())}</option>`;
  if (st.cat && !cats.some((c) => c.id === st.cat)) st.cat = '';
  const r = P.dailyCumulative(d, month, today, { categoryId: st.cat, onlyBills: st.bills });
  const cur = month === today.slice(0, 7);
  const lines = [{ name: 'Receitas', color: '#1fb58a', values: r.days.map((x) => x.income) }, { name: 'Saídas', color: '#f2677a', values: r.days.map((x) => x.expense) }];
  let note = '';
  if (!r.lastDay) note = `${esc(monthLabel(month))} ainda não começou.`;
  else if (r.incomeTotal <= 0 && r.expenseTotal <= 0) note = 'Sem lançamentos neste filtro.';
  else {
    const parts = [`Receitas <b class="pos">${esc(brl(r.incomeTotal))}</b>`, `Saídas <b class="neg">${esc(brl(r.expenseTotal))}</b>`];
    if (r.incomeTotal > 0) parts.push(`as saídas usaram <b>${Math.round((r.expenseTotal / r.incomeTotal) * 100)}%</b> da receita`);
    note = parts.join(' · ');
    if (r.crossingDay) note += `. <b>No dia ${r.crossingDay}</b> as saídas alcançaram a receita.`;
    else if (cur && r.lasts != null) note += `. No ritmo atual (${esc(brl(r.perDay))} por dia), a receita dura <b>${String(r.lasts).replace('.', ',')} dias</b>${r.lasts >= r.daysTotal ? ', ou seja, cobre o mês todo' : ''}.`;
  }
  box.innerHTML = `<div class="vc-bar"><label class="muted small" for="dc-cat">Categoria</label>
      <select id="dc-cat" class="vc-select"><option value="">Todas as categorias</option>
        <optgroup label="Saídas">${cats.filter((c) => c.type === 'expense').map(opt).join('')}</optgroup>
        <optgroup label="Entradas">${cats.filter((c) => c.type === 'income').map(opt).join('')}</optgroup></select>
      <label class="check dc-bills"><input type="checkbox" id="dc-bills" ${st.bills ? 'checked' : ''}><span>Só Contas F.V</span></label></div>
    <div class="vc-chart">${lineChart({ labels: r.days.map((x) => String(x.day)), series: lines, label: 'Receitas e saídas acumuladas dia a dia', avg: false, tickEvery: 5, legend: false })}</div>
    <div class="legend"><span class="lg"><i style="background:#1fb58a"></i>Receitas acumuladas</span><span class="lg"><i style="background:#f2677a"></i>Saídas acumuladas</span></div>
    <p class="muted small dc-note">${note}</p>`;
  box.querySelector('#dc-cat').onchange = (e) => { st.cat = e.target.value; renderDayChart(box); };
  box.querySelector('#dc-bills').onchange = (e) => { st.bills = e.target.checked; renderDayChart(box); };
}
