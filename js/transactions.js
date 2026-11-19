/**
 * transactions.js — Extrato (com filtros dinâmicos) e o modal de lançamento usado em todo o app.
 */
import * as api from './api.js';
import * as store from './store.js';
import * as P from './projections.js';
import { $, $$, h, esc, icon, drop, pill, emptyState, expander, formModal, confirmDialog, toast, prepareUpload, brl, dayLabel, monthLabel, uuid, debounce, amountClass } from './ui.js';

const TYPE_LABEL = { income: 'Receita', expense: 'Despesa', card_payment: 'Fatura paga', saving: 'Valor guardado' };
const ORIGIN_LABEL = { manual: 'Manual', notification: 'Notificação', payslip: 'Contracheque', fixed: 'Conta fixa', import: 'Importado' };

// ------------------------------------------------------------------ linha do extrato (reutilizável)
export function txRow(t, { showOwner = false } = {}) {
  const cat = store.categoryOf(t.categoryId);
  const special = t.type === 'card_payment' ? ['💳', '#6c5ce7'] : t.type === 'saving' ? ['🐷', '#12a572'] : null;
  const food = P.isFood(store.data(), t);
  const title = t.description || t.merchant || cat?.name || TYPE_LABEL[t.type];
  const sub = [special ? TYPE_LABEL[t.type] : cat?.name || 'Sem categoria', store.sourceLabel(t), showOwner ? store.userName(t.ownerId) : ''].filter(Boolean).map(esc).join(' · ');
  const tags = [t.method ? pill(t.method, 'neutral') : '', t.scope === 'shared' ? pill('Compartilhada', 'info') : '', food ? pill('Alimentação', 'ok') : '', t.origin === 'notification' ? pill('Notificação', 'neutral') : '', t.origin === 'payslip' ? pill('Contracheque', 'neutral') : ''].join('');
  const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '';
  return `<button type="button" class="tx" data-id="${esc(t.id)}">${drop(special ? special[0] : cat?.icon, special ? special[1] : cat?.color)}
    <span class="tx-main"><span class="tx-t">${esc(title)}</span><span class="tx-s">${sub}</span>${tags ? `<span class="tx-tags">${tags}</span>` : ''}</span>
    <span class="tx-amt ${amountClass(t)}">${sign} ${esc(brl(t.amount))}</span></button>`;
}

// ------------------------------------------------------------------ filtros (persistem enquanto o app está aberto)
const F = { range: 'month', from: '', to: '', type: '', categoryId: '', source: '', scope: '', origin: '', method: '', q: '', min: '', max: '' };
let shown = 150;

function applyFilters(list) {
  const month = store.prefs.month, q = P.norm(F.q), min = F.min !== '' ? Number(F.min.replace(',', '.')) : null, max = F.max !== '' ? Number(F.max.replace(',', '.')) : null;
  return list.filter((t) => {
    if (F.range === 'month' && P.ym(t.date) !== month) return false;
    if (F.range === 'custom' && ((F.from && t.date < F.from) || (F.to && t.date > F.to))) return false;
    if (F.type && t.type !== F.type) return false;
    if (F.categoryId && t.categoryId !== F.categoryId) return false;
    if (F.source && (F.source[0] === 'a' ? t.accountId : t.cardId) !== F.source.slice(2)) return false;
    if (F.scope && t.scope !== F.scope) return false;
    if (F.origin && t.origin !== F.origin) return false;
    if (F.method && t.method !== F.method) return false;
    if (min !== null && t.amount < min) return false;
    if (max !== null && t.amount > max) return false;
    if (q && !P.norm([t.description, t.merchant, t.notes, store.categoryOf(t.categoryId)?.name].join(' ')).includes(q)) return false;
    return true;
  }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1));
}
const activeFilterCount = () => ['type', 'categoryId', 'source', 'method', 'scope', 'origin', 'min', 'max'].filter((k) => F[k] !== '').length + (F.range === 'month' ? 0 : 1);

function filtersHtml() {
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;
  const cats = store.activeOf('categories').map((c) => opt(c.id, `${c.icon || ''} ${c.name}`, F.categoryId)).join('');
  const srcs = [...store.activeOf('accounts').map((a) => opt(`a:${a.id}`, `Conta · ${a.name}`, F.source)), ...store.activeOf('cards').map((c) => opt(`c:${c.id}`, `Cartão · ${c.name}`, F.source))].join('');
  const body = `<div class="filter-grid">
    <label>Período<select data-f="range">${opt('month', `Mês: ${monthLabel(store.prefs.month)}`, F.range)}${opt('all', 'Todo o histórico', F.range)}${opt('custom', 'Personalizado', F.range)}</select></label>
    <label ${F.range === 'custom' ? '' : 'hidden'}>De<input type="date" data-f="from" value="${esc(F.from)}"></label>
    <label ${F.range === 'custom' ? '' : 'hidden'}>Até<input type="date" data-f="to" value="${esc(F.to)}"></label>
    <label>Tipo<select data-f="type">${opt('', 'Todos', F.type)}${Object.entries(TYPE_LABEL).map(([k, v]) => opt(k, v, F.type)).join('')}</select></label>
    <label>Categoria<select data-f="categoryId">${opt('', 'Todas', F.categoryId)}${cats}</select></label>
    <label>Conta ou cartão<select data-f="source">${opt('', 'Todos', F.source)}${srcs}</select></label>
    <label>Forma de pagamento<select data-f="method">${opt('', 'Todas', F.method)}${store.paymentMethods().map((m) => opt(m, m, F.method)).join('')}</select></label>
    <label>Gasto<select data-f="scope">${opt('', 'Individual e compartilhado', F.scope)}${opt('individual', 'Individual', F.scope)}${opt('shared', 'Compartilhado', F.scope)}</select></label>
    <label>Origem<select data-f="origin">${opt('', 'Todas', F.origin)}${Object.entries(ORIGIN_LABEL).map(([k, v]) => opt(k, v, F.origin)).join('')}</select></label>
    <label>Valor mínimo<input data-f="min" inputmode="decimal" placeholder="0,00" value="${esc(F.min)}"></label>
    <label>Valor máximo<input data-f="max" inputmode="decimal" placeholder="sem limite" value="${esc(F.max)}"></label>
  </div><button type="button" class="btn btn-ghost sm" data-clear>Limpar filtros</button>`;
  const n = activeFilterCount();
  return `<div class="filters"><div class="search">${icon('filter')}<input id="ex-q" type="search" placeholder="Buscar por descrição, estabelecimento ou categoria" value="${esc(F.q)}" aria-label="Buscar lançamentos"></div>${expander('ex-filters', `${icon('filter')} Filtros${n ? ` <span class="count">${n}</span>` : ''}`, body, n > 0)}</div>`;
}

function listHtml(rows) {
  if (!rows.length) return emptyState('extract', 'Nenhum lançamento por aqui', activeFilterCount() || F.q ? 'Tente limpar os filtros.' : 'Use o botão + para lançar sua primeira movimentação.');
  const d = store.data(), showOwner = store.prefs.who === 'family';
  let html = '', day = '', n = 0;
  for (const t of rows.slice(0, shown)) {
    if (t.date !== day) {
      day = t.date;
      const net = rows.filter((x) => x.date === day && !P.isFood(d, x)).reduce((s, x) => s + (x.type === 'income' ? x.amount : x.type === 'expense' ? -x.amount : 0), 0);
      html += `${n ? '</div>' : ''}<div class="day"><div class="day-h"><span>${esc(dayLabel(day))}</span><span class="${net >= 0 ? 'pos' : 'neg'}">${esc(brl(net))}</span></div>`;
    }
    html += txRow(t, { showOwner }); n++;
  }
  html += '</div>';
  if (rows.length > shown) html += `<button class="btn btn-soft btn-block" data-more>Mostrar mais (${rows.length - shown})</button>`;
  return html;
}

function summaryHtml(rows) {
  const d = store.data();
  let inc = 0, exp = 0, food = 0;
  for (const t of rows) {
    if (P.isFood(d, t)) { food += t.type === 'income' ? t.amount : -t.amount; continue; }
    if (t.type === 'income') inc += t.amount; else if (t.type === 'expense') exp += t.amount;
  }
  const k = (l, v, cls = '') => `<div class="kpi mini"><span class="kpi-l">${l}</span><span class="kpi-v ${cls}">${esc(v)}</span></div>`;
  return k('Receitas', brl(inc), 'pos') + k('Despesas', brl(exp), 'neg') + k('Resultado', brl(inc - exp), inc - exp >= 0 ? 'pos' : 'neg') + k('Lançamentos', String(rows.length)) + (food ? k('Cartão alimentação', brl(food), food >= 0 ? 'pos' : 'neg') : '');
}

export function render(view) {
  const draw = () => {
    const rows = applyFilters(store.data().transactions);
    $('#ex-summary', view).innerHTML = summaryHtml(rows);
    $('#ex-list', view).innerHTML = listHtml(rows);
  };
  $('#ex-filters', view).innerHTML = filtersHtml();
  draw();

  $('#ex-new', view).addEventListener('click', () => openTxModal());
  $('#ex-payslip', view).addEventListener('click', async () => (await import('./payslip.js')).openPayslipModal());
  $('#ex-list', view).addEventListener('click', (e) => {
    if (e.target.closest('[data-more]')) { shown += 150; draw(); return; }
    const row = e.target.closest('.tx'); if (!row) return;
    const t = store.state.transactions.find((x) => x.id === row.dataset.id);
    if (t) openTxModal(t);
  });
  const filters = $('#ex-filters', view);
  const onFilter = (e) => {
    const k = e.target.dataset.f; if (!k) return;
    F[k] = e.target.value; shown = 150;
    if (k === 'range') { $$('[data-f="from"], [data-f="to"]', filters).forEach((i) => { i.parentElement.hidden = F.range !== 'custom'; }); }
    const n = activeFilterCount(), c = $('.expander-h .count', filters);
    if (c) { c.textContent = n; c.hidden = !n; }
    draw();
  };
  filters.addEventListener('input', debounce((e) => { if (e.target.matches('input[data-f]')) onFilter(e); }, 200));
  filters.addEventListener('change', (e) => { if (e.target.matches('select[data-f], input[type=date][data-f]')) onFilter(e); });
  $('#ex-q', view).addEventListener('input', debounce((e) => { F.q = e.target.value; shown = 150; draw(); }, 200));
  filters.addEventListener('click', (e) => {
    if (!e.target.closest('[data-clear]')) return;
    Object.assign(F, { range: 'month', from: '', to: '', type: '', categoryId: '', source: '', method: '', scope: '', origin: '', min: '', max: '' });
    $('#ex-filters', view).innerHTML = filtersHtml(); draw();
  });
}

// ------------------------------------------------------------------ modal de lançamento
const SPECIAL = ['card_payment', 'saving'];

/**
 * @param initial  lançamento existente (com id) ou valores iniciais de um novo
 * @param opts     { onSaved(rec), title }
 */
export function openTxModal(initial = {}, opts = {}) {
  const editing = !!initial.id, special = SPECIAL.includes(initial.type);
  const clientId = initial.clientId || uuid();   // reaproveitado se o envio for repetido: não duplica
  const me = store.state.me?.id;
  const t0 = initial.type || 'expense';
  const sources = (type) => store.sourceOptions({ type });
  const defSource = initial.accountId ? `a:${initial.accountId}` : initial.cardId ? `c:${initial.cardId}` : initial.source || sources(t0)[0]?.value || '';
  const billsOf = (type) => store.activeOf('fixedBills').filter((b) => P.billKind(b) === type);
  const billOpts = (type) => billsOf(type).map((b) => ({ value: b.id, label: `${b.name} · ${type === 'income' ? 'recebe' : 'vence'} dia ${b.dueDay}` }));
  const hasBills = () => billsOf('expense').length + billsOf('income').length > 0;
  const values = {
    type: t0, amount: initial.amount ?? null, date: initial.date || store.today(), description: initial.description || '', source: defSource,
    categoryId: initial.categoryId || '', ownerId: initial.ownerId || (store.prefs.who !== 'family' ? store.prefs.who : me), scope: initial.scope || 'individual',
    fixedBillId: initial.fixedBillId || '', method: initial.method || '', notes: initial.notes || ''
  };
  const fields = special ? [
    { name: 'amount', label: 'Valor', type: 'money', required: true },
    { name: 'date', label: 'Data', type: 'date', required: true },
    { name: 'description', label: 'Descrição', full: true },
    { name: 'ownerId', label: 'Responsável', type: 'select', options: store.ownerOptions(), required: true },
    { name: 'notes', label: 'Observações', type: 'textarea', full: true },
    { name: 'files', label: 'Comprovantes', type: 'files', full: true }
  ] : [
    { name: 'type', label: 'Tipo', type: 'segmented', options: [{ value: 'expense', label: 'Despesa' }, { value: 'income', label: 'Receita' }], full: true },
    { name: 'amount', label: 'Valor', type: 'money', required: true },
    { name: 'date', label: 'Data', type: 'date', required: true },
    { name: 'description', label: 'Descrição', placeholder: 'Ex.: Padaria, Salário...', full: true, required: true },
    { name: 'source', label: 'Conta ou cartão', type: 'select', options: sources(t0), required: true },
    { name: 'method', label: 'Paga com', type: 'select', options: store.methodOptions(), placeholder: 'Não informar' },
    { name: 'categoryId', label: 'Categoria', type: 'select', options: store.categoryOptions(t0), placeholder: 'Sem categoria' },
    { name: 'ownerId', label: 'Responsável', type: 'select', options: store.ownerOptions(), required: true },
    { name: 'scope', label: 'Tipo de gasto', type: 'segmented', options: [{ value: 'individual', label: 'Individual' }, { value: 'shared', label: 'Compartilhado' }] },
    ...(hasBills() ? [{ name: 'fixedBillId', label: 'Vincular a conta/receita fixa', type: 'select', full: true, placeholder: 'Não é fixa', options: billOpts(t0), showIf: (v) => billsOf(v.type).length > 0 }] : []),
    { name: 'notes', label: 'Observações', type: 'textarea', full: true },
    { name: 'files', label: 'Comprovantes', type: 'files', full: true }
  ];

  async function save(payload, force = false) {
    try {
      return editing ? await store.update('transactions', { id: initial.id, ...payload, force }) : await store.create('transactions', { ...payload, clientId, force });
    } catch (e) {
      if (e.code === 'DUPLICATE' && !force) {
        const yes = await confirmDialog({ title: 'Lançamento parecido', text: 'Já existe um lançamento igual neste dia. Lançar mesmo assim?', okLabel: 'Lançar mesmo assim' });
        if (yes) return save(payload, true);
        throw new Error('Não lançado: já existe um lançamento igual.');
      }
      throw e;
    }
  }

  const ctl = formModal({
    title: editing ? 'Editar lançamento' : opts.title || 'Novo lançamento', fields, values, submitLabel: editing ? 'Salvar alterações' : 'Lançar',
    extra: editing ? [{ id: 'del', label: 'Excluir', kind: 'btn-danger', onClick: async (c) => {
      if (!(await confirmDialog({ title: 'Excluir lançamento', text: 'Ele sai do extrato e dos totais. Deseja continuar?', okLabel: 'Excluir', danger: true }))) return;
      try { await store.remove('transactions', initial.id); toast('Lançamento excluído.', { kind: 'ok' }); c.close(); } catch (e) { c.error(e.message); }
    } }] : [],
    onChange: async (name, c) => {
      if (special) return;
      if (name === 'type') {
        const t = c.values().type;
        c.setOptions('categoryId', store.categoryOptions(t), 'Sem categoria');
        c.setOptions('source', sources(t));
        if (hasBills()) c.setOptions('fixedBillId', billOpts(t), 'Não é fixa');
        c.setOptions('method', store.methodOptions(), 'Não informar');
      }
      if (name === 'source') {   // compra no cartão de crédito: sugere "Crédito" se ainda não escolheram outra
        const [k, id] = (c.values().source || ':').split(':');
        if (k === 'c' && store.byId('cards', id)?.kind === 'credit' && !c.values().method) c.set('method', store.paymentMethods().find((m) => /cr[eé]dito/i.test(m)) || '');
      }
      if (name === 'method' && c.values().method === store.NEW_METHOD) {
        c.set('method', '');
        const made = await askMethod();
        if (made) { c.setOptions('method', store.methodOptions(), 'Não informar'); c.set('method', made); }
      }
    },
    onSubmit: async (v, c) => {
      let payload;
      if (special) payload = { amount: v.amount, date: v.date, description: v.description, ownerId: v.ownerId, notes: v.notes };
      else {
        const [kind, id] = (v.source || ':').split(':');
        payload = { type: v.type, amount: v.amount, date: v.date, description: v.description, merchant: initial.merchant || '', categoryId: v.categoryId || '',
          accountId: kind === 'a' ? id : '', cardId: kind === 'c' ? id : '', ownerId: v.ownerId, scope: v.scope, fixedBillId: v.fixedBillId || '', method: v.method && v.method !== store.NEW_METHOD ? v.method : '', notes: v.notes };
        if (!editing) payload.origin = initial.origin || (v.fixedBillId ? 'fixed' : 'manual');
      }
      const rec = await save(payload);
      const files = c.files('files');
      let failed = 0;
      for (const f of files) {
        try { await api.call('attachment.upload', { ...(await prepareUpload(f)), transactionId: rec.id }, { feedback: { start: 'Enviando comprovante…', text: f.name, done: 'Comprovante anexado' } }); } catch (e) { failed++; toast(e.message, { kind: 'err' }); }
      }
      toast(failed ? 'Lançamento salvo, mas algum anexo falhou.' : editing ? 'Lançamento atualizado.' : 'Lançamento salvo.', { kind: failed ? 'warn' : 'ok' });
      c.close(); opts.onSaved?.(rec);
    },
    onOpen: (c) => { if (editing) loadAttachments(c, initial.id); }
  });
  return ctl;
}

/** Pergunta o nome de uma nova forma de pagamento e salva na lista (vale para o app todo). */
export function askMethod() {
  return new Promise((resolve) => {
    let done = false;
    formModal({
      title: 'Nova forma de pagamento', submitLabel: 'Adicionar', onClose: () => { if (!done) resolve(null); },
      fields: [{ name: 'name', label: 'Nome', required: true, full: true, placeholder: 'Ex.: Boleto, Vale, Transferência' }],
      onSubmit: async (v, c) => { const n = await store.addMethod(v.name); done = true; toast('Forma de pagamento adicionada.', { kind: 'ok' }); c.close(); resolve(n); }
    });
  });
}

async function loadAttachments(c, txId) {
  const wrap = $('[data-field="files"]', c.form); if (!wrap) return;
  const box = h('<ul class="att-existing"></ul>'); wrap.append(box);
  const draw = (list) => { box.innerHTML = list.map((a) => `<li><a href="${esc(a.url)}" target="_blank" rel="noopener">${icon(a.mime === 'application/pdf' ? 'doc' : 'camera')} ${esc(a.name)}</a><button type="button" class="btn-icon sm" data-delatt="${esc(a.id)}" aria-label="Remover anexo">${icon('trash')}</button></li>`).join(''); };
  try {
    let list = await api.call('attachment.list', { transactionId: txId }, { silent: true });
    draw(list);
    box.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-delatt]'); if (!b) return;
      if (!(await confirmDialog({ title: 'Remover anexo', text: 'O arquivo vai para a lixeira do Drive.', okLabel: 'Remover', danger: true }))) return;
      try { await api.call('attachment.remove', { id: b.dataset.delatt }, { feedback: { start: 'Removendo anexo…', done: 'Anexo removido' } }); list = list.filter((a) => a.id !== b.dataset.delatt); draw(list); } catch (err) { toast(err.message, { kind: 'err' }); }
    });
  } catch { box.innerHTML = '<li class="muted">Não consegui carregar os anexos.</li>'; }
}
