/**
 * planning.js — distribuição da renda (30/50/20 editável), comparação com o gasto real e projeções.
 * Os números vêm de projections.js; aqui só há apresentação e a gravação dos percentuais.
 */
import * as store from './store.js';
import * as P from './projections.js';
import { $, esc, pill, emptyState, toast, brl, fmtDate, monthLabel, icon } from './ui.js';
import { bar, areaChart } from './charts.js';

const tile = (label, value, sub = '', tone = '') => `<div class="kpi mini ${tone ? 'tone-' + tone : ''}"><span class="kpi-l">${esc(label)}</span><span class="kpi-v">${esc(value)}</span>${sub ? `<span class="kpi-s">${esc(sub)}</span>` : ''}</div>`;
const STATUS = { ok: ['Dentro do planejado', 'ok'], warn: ['Perto do limite', 'warn'], over: ['Limite ultrapassado', 'bad'], behind: ['Abaixo da meta', 'warn'] };

function budgetHtml(d, today, month) {
  const b = P.budget(d, today, month);
  if (b.base <= 0) return emptyState('target', 'Sem renda para planejar neste mês', 'Lance suas receitas (ou tenha receitas recorrentes nos últimos meses) para o app calcular os limites.');
  return `<p class="muted">Base de cálculo: <b>${esc(brl(b.base))}</b> ${d.settings.incomeBase === 'received' ? '(receitas já recebidas)' : '(maior entre o recebido e o previsto)'}</p>` + b.rows.map((r) => {
    const [label, tone] = r.key === 'reserve' && r.status === 'ok' ? ['Meta de reserva atingida', 'ok'] : STATUS[r.status];
    const msg = r.key === 'reserve' ? (r.status === 'ok' ? 'Você já guardou o planejado.' : `Faltam ${brl(r.diff)} para a reserva do mês.`) : (r.diff >= 0 ? `Ainda cabem ${brl(r.diff)}.` : `Passou ${brl(-r.diff)} do limite.`);
    return `<div class="plan-row"><div class="plan-h"><b>${esc(r.label)} <small class="muted">${r.pct}%</small></b>${pill(label, tone)}</div>
      ${bar(r.key === 'reserve' ? Math.min(1, r.ratio) : r.ratio, r.key === 'reserve' ? (r.status === 'ok' ? 'ok' : 'warn') : r.status)}
      <p class="muted">${esc(brl(r.actual))} de ${esc(brl(r.planned))} · ${esc(msg)}</p></div>`;
  }).join('');
}

function outlookHtml(d, today) {
  const rows = P.outlook(d, today, 6);
  if (!rows.some((r) => r.income > 0 || r.fixed > 0)) return emptyState('calendar', 'Cadastre receitas e contas fixas', 'Com elas o app projeta quanto entra, quanto sai e quanto sobra nos próximos meses.', '<a class="btn btn-primary" href="#/fixed">Ir para fixas</a>');
  const low = rows.some((r) => r.lowConfidence);
  return `<div class="table-wrap"><table class="tbl"><thead><tr><th>Mês</th><th class="num">Entradas</th><th class="num">Contas fixas</th><th class="num">Saídas totais</th><th class="num">Sobra</th><th class="num">Acumulado</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(monthLabel(r.month))}${r.current ? ' <small class="muted">(mês atual)</small>' : ''}</td><td class="num pos">${esc(brl(r.income))}</td><td class="num">${esc(brl(r.fixed))}</td><td class="num">${esc(brl(r.expense))}</td><td class="num ${r.leftover >= 0 ? 'pos' : 'neg'}"><b>${esc(brl(r.leftover))}</b></td><td class="num ${r.cumulative >= 0 ? 'pos' : 'neg'}">${esc(brl(r.cumulative))}</td></tr>`).join('')}</tbody></table></div>
  <p class="muted small">Entradas = receitas fixas + recorrentes dos últimos meses. Saídas = contas fixas + gasto variável médio. ${low ? 'Ainda há pouco histórico de gastos: trate como estimativa.' : ''}</p>`;
}

function projectionHtml(d, today) {
  const me = P.monthEnd(d, today), res = P.monthResult(d, today), nm = P.nextMonth(d, today), inc = P.expectedIncome(d, today);
  const spans = [7, 15, 30].map((n) => P.projectSpend(d, today, n));
  const low = spans[0].lowConfidence;
  const curve = P.spendCurve(d, today, 30);
  const bud = P.budget(d, today);
  const reserveLeft = Math.max(0, bud.rows[0].planned - bud.rows[0].actual);
  const commitments = [...spans[2].items.map((x) => ({ date: x.due, label: x.bill.name, value: x.bill.amount, late: x.status === 'late' }))];
  for (const c of d.cards.filter((x) => x.kind === 'credit')) {
    for (const m of [P.addMonths(P.ym(today), -1), P.ym(today), P.addMonths(P.ym(today), 1)]) {
      const i = P.invoiceInfo(d, c, m);
      if (i.open > 0 && i.due <= P.addDays(today, 30)) commitments.push({ date: i.due, label: `Fatura ${c.name}`, value: i.open, late: i.due < today });
    }
  }
  commitments.sort((a, b) => a.date.localeCompare(b.date));
  return `${low ? `<div class="note">${icon('bulb')}<span>Ainda há pouco histórico de gastos (menos de 2 semanas ou poucos lançamentos). As estimativas melhoram conforme você lança.</span></div>` : ''}
    <h4 class="sub-h">Gasto estimado</h4>
    <div class="kpi-row">${spans.map((s) => tile(`Próximos ${s.days} dias`, brl(s.total), `${brl(s.variable)} variável + ${brl(s.fixed)} em contas fixas`)).join('')}</div>
    <div class="chart-wrap">${areaChart({ points: curve.map((p) => ({ label: fmtDate(p.date).slice(0, 5), value: p.value })), color: 'var(--expense)', label: 'Gasto acumulado previsto nos próximos 30 dias' })}</div>
    <h4 class="sub-h">Entradas x saídas previstas</h4>
    <div class="kpi-row">${[7, 15, 30].map((n) => { const f = P.projectFlow(d, today, n); return tile(`Próximos ${n} dias`, `${f.net >= 0 ? '+' : '−'} ${brl(Math.abs(f.net))}`, `Entra ${brl(f.income)} (receitas fixas) · sai ${brl(f.spend)}`, f.net < 0 ? 'bad' : 'ok'); }).join('')}</div>
    <h4 class="sub-h">Próximos meses</h4>${outlookHtml(d, today)}
    <h4 class="sub-h">Fim do mês</h4>
    <div class="kpi-row">
      ${tile('Saldo estimado no fim do mês', brl(me.projected), `Faltam ${me.daysLeft} dias · hoje ${brl(me.balance)}`, me.projected < 0 ? 'bad' : '')}
      ${tile('Resultado projetado do mês', brl(res.result), `Receitas ${brl(res.income)} − gastos`, res.result < 0 ? 'bad' : 'ok')}
      ${tile('Reserva ainda a guardar', brl(reserveLeft), `Meta do mês: ${brl(bud.rows[0].planned)}`)}
      ${tile(`Estimativa de ${monthLabel(nm.month)}`, nm.hasIncomeHistory ? brl(nm.leftover) : '—', nm.hasIncomeHistory ? `Receita ${brl(nm.income)} − fixas ${brl(nm.fixed)} − variável ${brl(nm.variable)}` : 'Precisa de receitas recorrentes em 2 dos últimos 3 meses')}
    </div>
    <p class="muted small">Cálculo conservador: considera o gasto variável futuro como saída da conta e soma contas fixas e faturas ainda em aberto.</p>
    <div class="grid-2">
      <div><h4 class="sub-h">Compromissos nos próximos 30 dias</h4>${commitments.length ? `<ul class="mini-list">${commitments.map((c) => `<li><span>${esc(fmtDate(c.date).slice(0, 5))} · ${esc(c.label)}</span><span>${c.late ? pill('Atrasado', 'bad') + ' ' : ''}<b>${esc(brl(c.value))}</b></span></li>`).join('')}</ul>` : '<p class="muted">Nenhum compromisso em aberto.</p>'}</div>
      <div><h4 class="sub-h">Receitas previstas</h4>${inc.has ? `<ul class="mini-list">${inc.groups.map((g) => `<li><span>${esc(g.label)}</span><span>${g.remaining > 0 ? `<b>${esc(brl(g.remaining))}</b> <small class="muted">a receber</small>` : pill('Recebida', 'ok')}</span></li>`).join('')}</ul>` : '<p class="muted">Sem receitas recorrentes identificadas ainda (precisam aparecer em 2 dos últimos 3 meses).</p>'}</div>
    </div>`;
}

export function render(view) {
  const d = store.data(), today = store.today(), month = store.prefs.month, isCurrent = month === P.ym(today);
  const split = { reserve: 30, bills: 50, others: 20, ...(d.settings.budgetSplit || {}) };
  $('#pl-form', view).innerHTML = `<div class="split-grid">${[['reserve', 'Reserva'], ['bills', 'Contas'], ['others', 'Outros']].map(([k, l]) => `<label>${l} (%)<input type="number" min="0" max="100" step="1" name="${k}" value="${split[k]}" inputmode="numeric"></label>`).join('')}
    <label>Base da renda<select name="incomeBase"><option value="expected" ${d.settings.incomeBase !== 'received' ? 'selected' : ''}>Receita prevista</option><option value="received" ${d.settings.incomeBase === 'received' ? 'selected' : ''}>Só o que já recebi</option></select></label></div>
    <div class="split-foot"><span id="pl-sum" class="pill"></span><button class="btn btn-primary" type="submit">Salvar distribuição</button></div><div class="form-error" id="pl-err" hidden></div>`;
  const form = $('#pl-form', view), sumEl = $('#pl-sum', view);
  const total = () => ['reserve', 'bills', 'others'].reduce((s, k) => s + (Number(form.elements[k].value) || 0), 0);
  const upd = () => { const t = total(); sumEl.textContent = `Total: ${t}%`; sumEl.className = `pill pill-${t === 100 ? 'ok' : 'bad'}`; };
  upd(); form.addEventListener('input', upd);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#pl-err', view); err.hidden = true;
    if (total() !== 100) { err.textContent = 'Os percentuais precisam somar 100%.'; err.hidden = false; return; }
    const btn = $('button[type=submit]', form); btn.disabled = true;
    try {
      await store.saveSettings({ budgetSplit: { reserve: Number(form.elements.reserve.value), bills: Number(form.elements.bills.value), others: Number(form.elements.others.value) }, incomeBase: form.elements.incomeBase.value });
      toast('Planejamento salvo.', { kind: 'ok' });
    } catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; }
  });

  $('#pl-month', view).textContent = monthLabel(month);
  $('#pl-budget', view).innerHTML = budgetHtml(d, today, month);
  $('#pl-proj', view).innerHTML = isCurrent ? projectionHtml(d, today) : `<p class="muted">As projeções valem para o mês atual. Volte para ${esc(monthLabel(P.ym(today)))} para vê-las.</p>`;
}
