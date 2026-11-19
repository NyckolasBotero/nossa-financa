/**
 * pantry.js — despensa: itens com fardos, validade e consumo por pessoa. Calcula quantos dias a comida dura
 * (estoque ÷ consumo diário da família) e avisa o que está perto de vencer.
 */
import * as store from './store.js';
import * as P from './projections.js';
import { $, esc, pill, emptyState, formModal, confirmDialog, toast, fmtDate } from './ui.js';

const GROUPS = ['Grãos e massas', 'Enlatados e conservas', 'Bebidas', 'Carnes e congelados', 'Laticínios e frios', 'Padaria e doces', 'Higiene e limpeza', 'Outros'];
const num = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
export const people = () => store.state.settings?.pantry?.people || 1;

export function pantrySummary() {
  return P.pantryInfo(store.state.pantry, people(), store.today());
}

export function openItemModal(it = null) {
  const editing = !!it;
  return formModal({
    title: editing ? 'Editar item' : 'Novo item da despensa', submitLabel: editing ? 'Salvar' : 'Adicionar', wide: true,
    values: it || { group: GROUPS[0], unit: 'un', packs: 0, perPack: 12, units: 0 },
    fields: [
      { name: 'name', label: 'Alimento', required: true, full: true, placeholder: 'Ex.: Arroz 5 kg, Leite, Milho em lata', maxlength: 60 },
      { name: 'group', label: 'Grupo', type: 'select', options: GROUPS.map((g) => ({ value: g, label: g })) },
      { name: 'unit', label: 'Unidade', type: 'select', options: ['un', 'kg', 'L', 'lata', 'pacote', 'garrafa', 'caixa'].map((u) => ({ value: u, label: u })) },
      { name: 'packs', label: 'Quantidade de fardos', type: 'number', min: 0, step: 'any' },
      { name: 'perPack', label: 'Unidades por fardo', type: 'number', min: 0, step: 'any', hint: 'Ex.: fardo de leite = 12.' },
      { name: 'units', label: 'Unidades avulsas', type: 'number', min: 0, step: 'any' },
      { name: 'expiry', label: 'Validade', type: 'date', hint: 'Se tiver lotes diferentes, use a validade mais próxima.' },
      { name: 'perPersonDay', label: 'Consumo por pessoa por dia', type: 'number', min: 0, step: 'any', hint: 'Em unidades (ex.: 0,1 kg de arroz; 0,5 lata). Vazio = não entra no cálculo de dias.' },
      { name: 'notes', label: 'Observações', type: 'textarea', full: true, max: 200 }
    ],
    onSubmit: async (v, c) => {
      const n = (x) => (x === null || x === undefined || x === '' ? 0 : Number(x));
      const payload = { name: v.name, group: v.group, unit: v.unit, packs: n(v.packs), perPack: n(v.perPack), units: n(v.units), expiry: v.expiry || '', perPersonDay: n(v.perPersonDay), notes: v.notes || '' };
      if (editing) await store.update('pantry', { id: it.id, ...payload }); else await store.create('pantry', payload);
      toast('Item salvo.', { kind: 'ok' }); c.close();
    }
  });
}

export function openPeopleModal() {
  return formModal({
    title: 'Pessoas na casa', submitLabel: 'Salvar', values: { people: people() },
    belowTitle: '<p class="muted">O consumo de cada item é por pessoa por dia. Multiplicamos pelo número de pessoas para saber quantos dias dura. Crianças pequenas podem contar como 0,5.</p>',
    fields: [{ name: 'people', label: 'Número de pessoas (consumo equivalente)', type: 'number', min: 0.5, max: 30, step: 'any', required: true, full: true }],
    onSubmit: async (v, c) => { await store.saveSettings({ pantry: { people: Number(v.people) } }); toast('Pessoas atualizadas.', { kind: 'ok' }); c.close(); }
  });
}

/** Ajuste rápido de quantidade (-1 / +1 unidade) sem abrir a edição. */
async function adjust(it, delta) {
  const total = Math.max(0, P.pantryUnits(it) + delta);
  const packs = it.perPack > 0 ? Math.floor(total / it.perPack) : 0;
  const units = P.round2(total - packs * (it.perPack || 0));
  try { await store.update('pantry', { id: it.id, packs, units }, { feedback: { start: 'Atualizando estoque…', done: () => ['Estoque atualizado', `${it.name}: ${num(total)} ${it.unit || 'un'}`] } }); } catch (e) { toast(e.message, { kind: 'err' }); }
}

const expiryPill = (r) => r.status === 'expired' ? pill(`Vencido há ${-r.expiresIn} d`, 'bad') : r.status === 'soon' ? pill(`Vence em ${r.expiresIn} d`, 'warn') : r.expiresIn != null ? pill(`Validade ${fmtDate(r.it.expiry)}`, 'neutral') : '';

export function render(view) {
  const info = pantrySummary(), pe = people();
  $('#pt-people', view).textContent = `${num(pe)} ${pe === 1 ? 'pessoa' : 'pessoas'} na casa`;
  const k = (l, v, s = '', cls = '') => `<div class="kpi mini"><span class="kpi-l">${l}</span><span class="kpi-v ${cls}">${esc(v)}</span>${s ? `<span class="kpi-s">${esc(s)}</span>` : ''}</div>`;
  $('#pt-kpis', view).innerHTML = k('Dias de comida', info.avgDays != null ? `${info.avgDays} dias` : '—', info.avgDays != null ? 'média dos itens com consumo' : 'informe o consumo dos itens', info.avgDays != null && info.avgDays < 7 ? 'neg' : 'pos')
    + k('Acaba primeiro', info.first ? info.first.it.name : '—', info.first ? `em ${info.first.days} dias` : '')
    + k('Vencendo em 30 dias', String(info.soon), 'itens', info.soon ? 'neg' : '') + k('Vencidos', String(info.expired), 'itens', info.expired ? 'neg' : '') + k('Itens cadastrados', String(info.count));
  if (!info.count) { $('#pt-list', view).innerHTML = `<div class="card">${emptyState('wallet', 'Despensa vazia', 'Cadastre arroz, feijão, enlatados, bebidas... com fardos, validade e consumo por pessoa.', '<button class="btn btn-primary" data-new>Cadastrar primeiro item</button>')}</div>`; }
  else {
    const groups = [...new Set(info.rows.map((r) => r.it.group || 'Outros'))].sort();
    $('#pt-list', view).innerHTML = groups.map((gn) => `<article class="card"><header class="card-h"><h3>${esc(gn)}</h3></header><div class="pantry-grid">${
      info.rows.filter((r) => (r.it.group || 'Outros') === gn).sort((a, b) => (a.expiresIn ?? 9e9) - (b.expiresIn ?? 9e9)).map((r) => `<div class="pantry-i st-${r.status}"><div class="pantry-main"><b>${esc(r.it.name)}</b>
        <span class="muted">${r.it.packs ? `${num(r.it.packs)} ${r.it.packs === 1 ? 'fardo' : 'fardos'}${r.it.perPack ? ` de ${num(r.it.perPack)}` : ''}${r.it.units ? ' + ' : ''}` : ''}${r.it.units || !r.it.packs ? `${num(r.it.units || 0)} avulsas` : ''} · total ${num(r.units)} ${esc(r.it.unit || 'un')}</span>
        <span class="pantry-tags">${expiryPill(r)}${r.days != null ? pill(`${r.days} dias de estoque`, r.days < 7 ? 'bad' : r.days < 15 ? 'warn' : 'ok') : ''}</span></div>
        <div class="pantry-a"><button class="btn-icon sm" data-use="${esc(r.it.id)}" aria-label="Usar 1 de ${esc(r.it.name)}" title="Usar 1">−</button><button class="btn-icon sm" data-more="${esc(r.it.id)}" aria-label="Repor 1 de ${esc(r.it.name)}" title="Repor 1">+</button>
        <button class="btn btn-soft sm" data-edit="${esc(r.it.id)}">Editar</button><button class="btn btn-danger-soft sm" data-del="${esc(r.it.id)}">Excluir</button></div></div>`).join('')}</div></article>`).join('');
  }
  view.onclick = async (e) => {
    const g = (a) => e.target.closest(`[data-${a}]`)?.dataset[a];
    if (e.target.closest('[data-new]')) return openItemModal();
    if (g('use')) return adjust(store.byId('pantry', g('use')), -1);
    if (g('more')) return adjust(store.byId('pantry', g('more')), 1);
    if (g('edit')) return openItemModal(store.byId('pantry', g('edit')));
    if (g('del')) {
      const it = store.byId('pantry', g('del'));
      if (!(await confirmDialog({ title: 'Excluir item', text: `"${it.name}" sai da despensa.`, okLabel: 'Excluir', danger: true }))) return;
      try { await store.remove('pantry', it.id); toast('Item excluído.', { kind: 'ok' }); } catch (err) { toast(err.message, { kind: 'err' }); }
    }
  };
  $('#pt-new', view).onclick = () => openItemModal();
  $('#pt-people', view).onclick = openPeopleModal;
}
