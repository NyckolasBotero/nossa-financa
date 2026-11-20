/**
 * payslips.js — contracheque mensal: itens (proventos e descontos), líquido e mês de referência.
 * O pagamento cai no mês seguinte ao de referência (05/10 refere-se a setembro). Ao salvar, o líquido pode virar
 * receita no extrato na data do pagamento. Dá para preencher lendo um PDF/foto (OCR do Drive) e corrigir tudo.
 */
import * as api from './api.js';
import * as store from './store.js';
import * as P from './projections.js';
import { $, $$, h, esc, pill, emptyState, openModal, confirmDialog, toast, prepareUpload, brl, brlShort, fmtDate, monthLabel, monthShort, parseMoney, moneyInput, uuid } from './ui.js';
import { barChart } from './charts.js';

const parseItems = (ps) => { try { const a = JSON.parse(ps?.items || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
const STARTER = [{ label: 'SALÁRIO', kind: 'earning', value: null, ref: '' }, { label: 'INSS', kind: 'discount', value: null, ref: '' }];
const sumKind = (items, kind) => P.round2(items.filter((i) => i.kind === kind).reduce((s, i) => s + (Number(i.value) || 0), 0));

/** Editor de contracheque. `ps` = registro existente; `prefill` = dados lidos do arquivo. */
export function openPayslipEditor(ps = null, prefill = null) {
  const editing = !!ps, me = store.state.me?.id;
  const owner0 = ps?.ownerId || (store.prefs.who !== 'family' ? store.prefs.who : me);
  const last = !editing && store.activeOf('payslips').filter((x) => x.ownerId === owner0).sort((a, b) => (a.refMonth < b.refMonth ? 1 : -1))[0];
  let items = (ps ? parseItems(ps) : prefill?.items?.length ? prefill.items : last ? parseItems(last).map((i) => ({ ...i })) : STARTER.map((i) => ({ ...i })));
  const payDate0 = ps?.payDate || prefill?.payDate || store.today();
  let refTouched = editing || !!prefill?.refMonth, netTouched = editing, attachmentIds = prefill?.attachmentIds || [];
  const accounts = store.activeOf('accounts');
  const linkedTx = ps?.transactionId ? store.state.transactions.find((t) => t.id === ps.transactionId) : null;
  const clientId = uuid();
  // Receita fixa que este salário quita (para constar como recebida na projeção)
  const incomes = store.activeOf('fixedBills').filter((b) => P.billKind(b) === 'income' && (b.ownerId === owner0 || b.scope === 'shared'));
  const guess = linkedTx?.fixedBillId || (incomes.find((b) => store.categoryOf(b.categoryId)?.tag === 'salary') || incomes.find((b) => /sal[aá]rio|contracheque|folha|pagamento/i.test(b.name)) || (incomes.length === 1 ? incomes[0] : null))?.id || '';

  const form = h(`<form class="form ps-form" novalidate><div class="form-error" role="alert" hidden></div>
    <div class="form-grid">
      <div class="field"><label for="ps-owner">De quem é</label><select id="ps-owner">${store.ownerOptions().map((o) => `<option value="${esc(o.value)}" ${o.value === owner0 ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></div>
      <div class="field"><label for="ps-pay">Data em que caiu</label><input id="ps-pay" type="date" value="${esc(payDate0)}" required></div>
      <div class="field"><label for="ps-ref">Mês de referência</label><input id="ps-ref" type="month" value="${esc(ps?.refMonth || prefill?.refMonth || P.refMonthOf(payDate0))}" required><small class="hint" id="ps-ref-hint"></small></div>
      <div class="field"><label for="ps-net">Valor líquido (o que caiu)</label><input id="ps-net" inputmode="decimal" autocomplete="off" value="${esc(moneyInput(ps?.net ?? prefill?.net))}" placeholder="0,00" required><small class="hint" id="ps-net-hint"></small></div>
      <div class="field full"><div class="ps-items-h"><b>Itens do contracheque</b><span class="grow"></span><button type="button" class="btn btn-soft sm" id="ps-read">Preencher lendo PDF/foto</button><input id="ps-file" type="file" accept="application/pdf,image/*" hidden></div>
        <div id="ps-items" class="ps-items"></div><button type="button" class="btn btn-ghost sm" id="ps-add">+ Adicionar item</button>
        <div class="ps-tot" id="ps-tot"></div></div>
      ${accounts.length ? `<div class="field"><label for="ps-acc">Conta que recebeu</label><select id="ps-acc">${accounts.map((a) => `<option value="${esc(a.id)}" ${a.id === (ps?.accountId || linkedTx?.accountId) ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>
      ${incomes.length ? `<div class="field"><label for="ps-fb">Conta como receita fixa</label><select id="ps-fb"><option value="">Nenhuma</option>${incomes.map((b) => `<option value="${esc(b.id)}" ${b.id === guess ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select><small class="hint">Assim o salário aparece como recebido em Receitas fixas no mês em que caiu.</small></div>` : ''}
      <div class="field"><label class="check"><input type="checkbox" id="ps-launch" ${editing ? (linkedTx ? 'checked' : '') : 'checked'}><span>${linkedTx ? 'Manter o líquido lançado no extrato' : 'Lançar o líquido como receita no extrato'}</span></label></div>` : '<p class="muted full">Cadastre uma conta para poder lançar o líquido como receita.</p>'}
      <div class="field full"><label for="ps-notes">Observações <i>(opcional)</i></label><textarea id="ps-notes" rows="2" maxlength="300">${esc(ps?.notes || '')}</textarea></div>
    </div><div class="modal-f"><span class="grow"></span><button type="button" class="btn btn-ghost" data-cancel>Cancelar</button><button type="submit" class="btn btn-primary">${editing ? 'Salvar alterações' : 'Salvar contracheque'}</button></div></form>`);
  const modal = openModal({ title: editing ? 'Editar contracheque' : 'Novo contracheque', body: form, wide: true });
  const g = (id) => $(`#${id}`, form), err = $('.form-error', form);

  const rowHtml = (it, i) => `<div class="ps-row" data-i="${i}"><input class="ps-l" data-k="label" value="${esc(it.label)}" placeholder="Descrição (ex.: SALÁRIO)" maxlength="60" aria-label="Descrição">
    <select data-k="kind" aria-label="Tipo"><option value="earning" ${it.kind === 'earning' ? 'selected' : ''}>Provento</option><option value="discount" ${it.kind === 'discount' ? 'selected' : ''}>Desconto</option></select>
    <input class="ps-r" data-k="ref" value="${esc(it.ref || '')}" placeholder="Ref." maxlength="12" aria-label="Referência">
    <input class="ps-v" data-k="value" inputmode="decimal" value="${esc(moneyInput(it.value))}" placeholder="0,00" aria-label="Valor">
    <button type="button" class="btn-icon sm" data-del="${i}" aria-label="Remover item">×</button></div>`;
  const drawItems = () => { g('ps-items').innerHTML = items.map(rowHtml).join(''); totals(); };
  function totals() {
    const e = sumKind(items, 'earning'), d = sumKind(items, 'discount'), calc = P.round2(e - d);
    g('ps-tot').innerHTML = `<span>Proventos <b class="pos">${esc(brl(e))}</b></span><span>Descontos <b class="neg">${esc(brl(d))}</b></span><span>Líquido calculado <b>${esc(brl(calc))}</b></span>`;
    if (!netTouched && items.some((i) => Number(i.value))) g('ps-net').value = moneyInput(calc);
    const net = parseMoney(g('ps-net').value);
    g('ps-net-hint').textContent = net != null && Math.abs(net - calc) > 0.009 && items.some((i) => Number(i.value)) ? `Diferente do calculado (${brl(calc)}). Vale o que você informou.` : '';
  }
  const refHint = () => { const r = g('ps-ref').value; g('ps-ref-hint').textContent = r ? `Salário de ${monthLabel(r)}, pago em ${fmtDate(g('ps-pay').value)}.` : ''; };
  drawItems(); refHint();

  form.addEventListener('input', (e) => {
    const row = e.target.closest('.ps-row');
    if (row) { const it = items[Number(row.dataset.i)], k = e.target.dataset.k; it[k] = k === 'value' ? parseMoney(e.target.value) : e.target.value; totals(); return; }
    if (e.target.id === 'ps-net') { netTouched = true; totals(); }
    if (e.target.id === 'ps-ref') { refTouched = true; refHint(); }
    if (e.target.id === 'ps-pay') { if (!refTouched && e.target.value) g('ps-ref').value = P.refMonthOf(e.target.value); refHint(); }
  });
  form.addEventListener('change', (e) => { const row = e.target.closest('.ps-row'); if (row && e.target.dataset.k === 'kind') { items[Number(row.dataset.i)].kind = e.target.value; totals(); } });
  form.addEventListener('click', async (e) => {
    if (e.target.closest('[data-cancel]')) return modal.close();
    const del = e.target.closest('[data-del]');
    if (del) { items.splice(Number(del.dataset.del), 1); netTouched = netTouched; return drawItems(); }
    if (e.target.closest('#ps-add')) { items.push({ label: '', kind: 'discount', value: null, ref: '' }); drawItems(); return g('ps-items').querySelector('.ps-row:last-child .ps-l').focus(); }
    if (e.target.closest('#ps-read')) return g('ps-file').click();
  });
  g('ps-file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const up = await prepareUpload(f);
      const r = await api.call('payslip.parse', up, { timeout: 90000, feedback: { start: 'Lendo o contracheque…', text: 'Pode levar alguns segundos', done: 'Contracheque lido: confira os valores' } });
      const p = r.result;
      if (p.items?.length) { items = p.items.filter((i) => i.kind !== 'info').map((i) => ({ label: i.label, kind: i.kind, value: i.value, ref: i.ref || '' })); netTouched = false; }
      if (p.net != null) { g('ps-net').value = moneyInput(p.net); netTouched = true; }
      if (p.payDate) g('ps-pay').value = p.payDate;
      if (p.competence) { g('ps-ref').value = p.competence; refTouched = true; }
      attachmentIds = [r.attachment.id]; drawItems(); refHint();
      if (p.warnings?.length) toast(p.warnings[0], { kind: 'warn' });
    } catch (ex) { toast(ex.message, { kind: 'err' }); }
  });

  const submit = async (ev) => {
    ev.preventDefault(); err.hidden = true;
    const btn = $('button[type=submit]', form);
    try {
      const net = parseMoney(g('ps-net').value);
      if (net == null || net < 0) throw new Error('Informe o valor líquido.');
      if (!g('ps-pay').value || !g('ps-ref').value) throw new Error('Informe a data do pagamento e o mês de referência.');
      const clean = items.filter((i) => (i.label || '').trim() || Number(i.value)).map((i) => ({ label: String(i.label || '').trim().slice(0, 60), kind: i.kind, value: Number(i.value) || 0, ref: String(i.ref || '').trim() }));
      const ownerId = g('ps-owner').value, refMonth = g('ps-ref').value, payDate = g('ps-pay').value;
      const dup = store.activeOf('payslips').find((x) => x.ownerId === ownerId && x.refMonth === refMonth && x.id !== ps?.id);
      if (dup) throw new Error(`${store.userName(ownerId)} já tem o contracheque de ${monthLabel(refMonth)}. Edite o que existe. Para 13º, férias ou outra empresa, lance pelo extrato numa categoria própria (ex.: "Salário MEI").`);
      btn.disabled = true;
      const earn = sumKind(clean, 'earning'), disc = sumKind(clean, 'discount');
      const accountId = g('ps-acc')?.value || '', launch = !!g('ps-launch')?.checked && !!accountId;
      const payload = { ownerId, payDate, refMonth, net, gross: earn, discounts: disc, items: JSON.stringify(clean).slice(0, 5900), notes: g('ps-notes').value.trim(), accountId: launch ? accountId : '' };
      // lançamento do líquido no extrato (na data em que caiu)
      const fixedBillId = g('ps-fb')?.value || '';
      const txBase = { fixedBillId, amount: net, date: payDate, description: `Salário ${monthLabel(refMonth)}`, accountId, notes: `Competência ${refMonth} · Proventos ${brl(earn)} · Descontos ${brl(disc)}`.slice(0, 480), force: true };
      const salary = store.activeOf('categories').find((x) => x.type === 'income' && x.tag === 'salary');
      let txId = ps?.transactionId || '', manual = null, replaced = null;
      if (launch && linkedTx) await store.update('transactions', { id: linkedTx.id, ...txBase });
      else if (launch && (manual = P.manualSalaryFor(allD(), store.state.payslips, ownerId, payDate, store.state.transactions))) {
        // havia um salário lançado à mão neste mês: o contracheque passa a valer no lugar dele
        await store.update('transactions', { id: manual.id, ...txBase, categoryId: manual.categoryId || salary?.id || '', accountId: accountId || manual.accountId || '', fixedBillId: fixedBillId || manual.fixedBillId || '', origin: 'payslip', attachmentIds }, { silent: true, feedback: null });
        txId = manual.id; replaced = manual;
      }
      else if (launch) { const tx = await store.create('transactions', { type: 'income', ownerId, scope: 'individual', origin: 'payslip', categoryId: salary?.id || '', clientId, attachmentIds, ...txBase }); txId = tx.id; }
      else if (linkedTx) { await store.remove('transactions', linkedTx.id); txId = ''; }
      payload.transactionId = txId;
      if (editing) await store.update('payslips', { id: ps.id, ...payload }); else await store.create('payslips', payload);
      toast(replaced ? `Contracheque de ${monthLabel(refMonth)} salvo. O salário lançado à mão (${brl(replaced.amount)}) foi trocado pelo líquido do contracheque (${brl(net)}).` : `Contracheque de ${monthLabel(refMonth)} salvo.`, { kind: 'ok' });
      modal.close();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; err.scrollIntoView({ block: 'nearest' }); }
    finally { btn.disabled = false; }
  };
  form.addEventListener('submit', submit);
  return modal;
}
/**
 * Faz o líquido do contracheque constar como recebido em Receitas fixas: liga o lançamento a uma receita de salário
 * (ou cria a receita "Salário" se não houver). Devolve { ok, created, error }.
 */
export async function linkPayslip(ps) {
  const tx = ps.transactionId ? store.state.transactions.find((t) => t.id === ps.transactionId && !t.archived) : null;
  if (!tx) return { ok: false, error: 'Este contracheque não foi lançado no extrato. Edite-o e marque "Lançar o líquido como receita".' };
  if (tx.fixedBillId) return { ok: true, already: true };
  const incomes = store.activeOf('fixedBills').filter((b) => P.billKind(b) === 'income');
  const mine = incomes.filter((b) => b.ownerId === ps.ownerId || b.scope === 'shared');
  let fb = mine.find((b) => store.categoryOf(b.categoryId)?.tag === 'salary') || mine.find((b) => /sal[aá]rio|contracheque|folha|pagamento/i.test(b.name)) || (mine.length === 1 ? mine[0] : null), created = false;
  try {
    if (!fb) {
      const first = store.activeOf('payslips').filter((x) => x.ownerId === ps.ownerId).map((x) => x.payDate.slice(0, 7)).sort()[0] || tx.date.slice(0, 7);
      const cat = store.activeOf('categories').find((x) => x.type === 'income' && x.tag === 'salary');
      fb = await store.create('fixedBills', { name: 'Salário', amount: tx.amount, dueDay: Number(tx.date.slice(8, 10)) || 5, categoryId: cat?.id || '', billType: 'fixed', accountId: tx.accountId || '', cardId: '', ownerId: ps.ownerId, scope: 'individual', startMonth: first, endMonth: '', method: '', kind: 'income' }, { silent: true, feedback: null });
      created = true;
    }
    if (P.billStatus(store.data(), fb, tx.date.slice(0, 7), store.today()).tx) return { ok: false, error: `Em ${monthLabel(tx.date.slice(0, 7))} a receita "${fb.name}" já foi recebida por outro lançamento.` };
    await store.update('transactions', { id: tx.id, fixedBillId: fb.id }, { silent: true, feedback: null });
    return { ok: true, created, bill: fb };
  } catch (e) { return { ok: false, error: e.message || 'Erro ao ligar.' }; }
}
/** Ligação automática (uma vez por sessão) dos contracheques ainda não ligados; falhas aparecem em aviso. */
const tried = new Set();
const allD = () => ({ categories: store.state.categories, cards: store.state.cards, fixedBills: store.state.fixedBills, transactions: store.state.transactions });
export async function autoLinkPayslips() {
  let n = 0, created = 0; const errs = [];
  for (const ps of store.activeOf('payslips')) {
    const tx = ps.transactionId ? store.state.transactions.find((t) => t.id === ps.transactionId && !t.archived) : null;
    if (!tx || tx.fixedBillId || tried.has(ps.id)) continue;
    tried.add(ps.id);
    const r = await linkPayslip(ps);
    if (r.ok && !r.already) { n++; if (r.created) created++; } else if (!r.ok) errs.push(r.error);
  }
  if (created) toast('Criei a receita fixa "Salário" para o contracheque aparecer em Receitas fixas.', { kind: 'ok' });
  if (n) toast(`${n} ${n === 1 ? 'contracheque ligado' : 'contracheques ligados'} à receita fixa.`, { kind: 'ok' });
  if (errs.length) toast(`Não consegui ligar o salário a Receitas fixas: ${errs[0]} Use o botão "Ligar a Receitas fixas" no contracheque.`, { kind: 'warn', ms: 9000 });
}
export const openPayslipModal = () => openPayslipEditor();

export async function removePayslip(ps) {
  const tx = ps.transactionId ? store.state.transactions.find((t) => t.id === ps.transactionId) : null;
  if (!(await confirmDialog({ title: 'Excluir contracheque', text: `Contracheque de ${monthLabel(ps.refMonth)}.${tx ? ` O salário lançado no extrato (${brl(tx.amount)}) também será excluído.` : ''}`, okLabel: 'Excluir', danger: true }))) return;
  try {
    if (tx) await store.remove('transactions', tx.id);
    await store.remove('payslips', ps.id);
    toast('Contracheque excluído.', { kind: 'ok' });
  } catch (e) { toast(e.message, { kind: 'err' }); }
}

export function render(view) {
  autoLinkPayslips();
  const who = store.prefs.who, list = store.activeOf('payslips').filter((x) => who === 'family' || x.ownerId === who).sort((a, b) => (a.refMonth < b.refMonth ? 1 : a.refMonth > b.refMonth ? -1 : a.payDate < b.payDate ? 1 : -1));
  const k = (l, v, cls = '', s = '') => `<div class="kpi mini"><span class="kpi-l">${l}</span><span class="kpi-v ${cls}">${esc(v)}</span>${s ? `<span class="kpi-s">${esc(s)}</span>` : ''}</div>`;
  const last12 = list.filter((x) => x.refMonth >= P.addMonths(store.today().slice(0, 7), -12));
  const avg = last12.length ? P.round2(last12.reduce((s, x) => s + x.net, 0) / last12.length) : 0;
  $('#ps-kpis', view).innerHTML = list.length ? k('Último líquido', brl(list[0].net), 'pos', `Ref. ${monthLabel(list[0].refMonth)}`) + k('Média dos últimos meses', brl(avg), '', `${last12.length} ${last12.length === 1 ? 'contracheque' : 'contracheques'}`) + k('Descontos do último', brl(list[0].discounts || 0), 'neg', `Proventos ${brl(list[0].gross || 0)}`) : '';
  const months = Array.from({ length: 12 }, (_, i) => P.addMonths(store.today().slice(0, 7), i - 11));
  $('#ps-chart', view).innerHTML = list.length ? barChart({ labels: months.map(monthShort), series: [{ name: 'Líquido', color: 'var(--income)', values: months.map((m) => list.filter((x) => x.refMonth === m).reduce((s, x) => s + x.net, 0)) }], label: 'Líquido por mês de referência' }) : emptyState('chart', 'Sem contracheques ainda', 'Os meses aparecem aqui conforme você lança.');
  $('#ps-list', view).innerHTML = list.length ? list.map((x) => {
    const items = parseItems(x), tx = x.transactionId ? store.state.transactions.find((t) => t.id === x.transactionId) : null;
    const rows = items.length ? `<table class="tbl ps-tbl"><thead><tr><th>Descrição</th><th class="num">Ref.</th><th class="num">Proventos</th><th class="num">Descontos</th></tr></thead><tbody>${items.map((i) => `<tr><td>${esc(i.label)}</td><td class="num">${esc(i.ref || '')}</td><td class="num pos">${i.kind === 'earning' ? esc(brl(i.value)) : ''}</td><td class="num neg">${i.kind === 'discount' ? esc(brl(i.value)) : ''}</td></tr>`).join('')}<tr class="tot"><td colspan="2">Total</td><td class="num">${esc(brl(x.gross || 0))}</td><td class="num">${esc(brl(x.discounts || 0))}</td></tr></tbody></table>` : '<p class="muted">Sem itens detalhados.</p>';
    return `<article class="bill ps-card"><div class="ps-month"><b>${esc(monthLabel(x.refMonth))}</b><small>referência</small></div>
      <div class="bill-main"><h3>Líquido ${esc(brl(x.net))}</h3><p class="muted">Caiu em ${esc(fmtDate(x.payDate))} · ${esc(store.userName(x.ownerId))}${tx ? ' · lançado no extrato' : ''}</p>${tx ? (() => { const fb = tx.fixedBillId ? store.byId('fixedBills', tx.fixedBillId) : null; return fb ? `<p class="small pos">✓ Conta como recebido em Receitas fixas (${esc(fb.name)})</p>` : `<p class="small neg">Ainda não conta em Receitas fixas <button class="btn btn-soft sm" data-linkfb="${esc(x.id)}">Ligar a Receitas fixas</button></p>`; })() : ''}</div>
      <div class="bill-r"><b class="pos">${esc(brl(x.net))}</b>${pill(`Descontos ${brlShort(x.discounts || 0)}`, 'neutral')}</div>
      ${(() => { const m = x.payDate.slice(0, 7), bills = P.round2(P.billsForMonth(store.data(), m, store.today()).reduce((s, r) => s + r.bill.amount, 0)), left = P.round2(x.net - bills); return bills > 0 ? `<p class="ps-left muted">Após as contas fixas de ${esc(monthLabel(m))} (${esc(brl(bills))}) sobram <b class="${left >= 0 ? 'pos' : 'neg'}">${esc(brl(left))}</b>${left > 0 ? ` <button class="btn btn-soft sm" data-save="${left}">Guardar no cofre</button>` : ''}</p>` : ''; })()}
      <details class="bill-det"><summary>Ver itens</summary>${rows}${x.notes ? `<p class="muted small">${esc(x.notes)}</p>` : ''}</details>
      <div class="bill-a"><button class="btn btn-soft sm" data-edit="${esc(x.id)}">Editar</button><button class="btn btn-danger-soft sm" data-del="${esc(x.id)}">Excluir</button></div></article>`;
  }).join('') : `<div class="card">${emptyState('doc', 'Nenhum contracheque lançado', 'Informe os itens do contracheque (ou leia o PDF/foto). O líquido vira receita na data em que caiu.', '<button class="btn btn-primary" data-new>Lançar contracheque</button>')}</div>`;
  view.onclick = async (e) => {
    if (e.target.closest('[data-new]')) return openPayslipEditor();
    const ed = e.target.closest('[data-edit]'), de = e.target.closest('[data-del]');
    const sv = e.target.closest('[data-save]'), lk = e.target.closest('[data-linkfb]');
    if (lk) { const r = await linkPayslip(store.byId('payslips', lk.dataset.linkfb)); return toast(r.ok ? (r.created ? 'Criei a receita fixa "Salário" e liguei o contracheque.' : 'Contracheque ligado a Receitas fixas.') : r.error, { kind: r.ok ? 'ok' : 'err', ms: r.ok ? 3000 : 9000 }); }
    if (sv) return (await import('./vault.js')).openVaultDeposit(Number(sv.dataset.save));
    if (ed) return openPayslipEditor(store.byId('payslips', ed.dataset.edit));
    if (de) return removePayslip(store.byId('payslips', de.dataset.del));
  };
  $('#ps-new', view).onclick = () => openPayslipEditor();
}
