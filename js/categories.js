/**
 * categories.js — categorias personalizadas (ícone, cor, tipo de indicador, palavras-chave).
 * Usado na tela de Configurações; o resto do app só lê as categorias pelo store.
 */
import * as store from './store.js';
import { $, esc, drop, pill, formModal, confirmDialog, toast, emptyState } from './ui.js';

export const EMOJIS = ['💼', '💰', '🏠', '💡', '🚿', '📶', '🛒', '🍔', '🍕', '🍽️', '☕', '🥖', '⛽', '🚗', '🚌', '🏍️', '🔧', '🩺', '💊', '🦷', '📚', '🎓', '📺', '🎮', '🎉', '🎬', '✈️', '🏖️', '🛍️', '👕', '👶', '🐶', '🎁', '💇', '🏋️', '📱', '💻', '🧾', '🏦', '📈', '🐷', '🔌', '🧹', '🪴', '🍺', '🎵', '⚽', '💒'];
export const COLORS = ['#2d9cdb', '#1fb58a', '#f2677a', '#f4a62a', '#8b7cf6', '#e84393', '#ff8a5b', '#16a39a', '#3d6ea8', '#a55eea', '#8395a7', '#c0a16b'];
export const TAGS = [
  ['housing', 'Moradia (aluguel, condomínio, contas da casa)'], ['vehicle', 'Veículo (seguro, IPVA, manutenção)'], ['fuel', 'Combustível'],
  ['food', 'Alimentação (mercado, restaurante)'], ['fastfood', 'Fast food e delivery'], ['subscription', 'Assinaturas'], ['health', 'Saúde'],
  ['education', 'Educação'], ['leisure', 'Lazer'], ['shopping', 'Compras'], ['salary', 'Salário'], ['other', 'Outros']
];

export function openCategoryModal(cat = null) {
  const editing = !!cat;
  const ctl = formModal({
    title: editing ? 'Editar categoria' : 'Nova categoria', submitLabel: editing ? 'Salvar' : 'Criar categoria',
    values: cat || { type: 'expense', icon: EMOJIS[0], color: COLORS[0], tag: 'other', bucket: 'others', keywords: '' },
    fields: [
      { name: 'name', label: 'Nome', required: true, full: true, maxlength: 40 },
      { name: 'type', label: 'Tipo', type: 'segmented', options: [{ value: 'expense', label: 'Despesa' }, { value: 'income', label: 'Receita' }], full: true },
      { name: 'icon', label: 'Ícone', type: 'emoji', options: EMOJIS, full: true },
      { name: 'color', label: 'Cor', type: 'color', options: COLORS, full: true },
      { name: 'tag', label: 'Entra em qual indicador do painel?', type: 'select', full: true, options: TAGS.map(([value, label]) => ({ value, label })), hint: 'Define onde o gasto aparece (Moradia, Veículo, Combustível, Alimentação...).' },
      { name: 'bucket', label: 'No planejamento conta como', type: 'select', options: [{ value: 'bills', label: 'Contas (essencial)' }, { value: 'others', label: 'Outros gastos' }], showIf: (v) => v.type === 'expense', full: true },
      { name: 'keywords', label: 'Palavras-chave', type: 'textarea', full: true, max: 400, placeholder: 'ifood, mcdonald, pizza', hint: 'Separadas por vírgula. Usadas para sugerir a categoria nas notificações.' }
    ],
    onSubmit: async (v, c) => {
      const payload = { name: v.name, type: v.type, icon: v.icon, color: v.color, tag: v.tag, bucket: v.type === 'expense' ? v.bucket : '', keywords: v.keywords };
      if (editing) await store.update('categories', { id: cat.id, ...payload }); else await store.create('categories', payload);
      toast('Categoria salva.', { kind: 'ok' }); c.close();
    }
  });
  return ctl;
}

/** Criação rápida de categoria (dentro de outro formulário). Devolve o id criado ou null. */
export function askCategory(type = 'expense') {
  return new Promise((resolve) => {
    let done = false;
    formModal({
      title: type === 'income' ? 'Nova categoria de receita' : 'Nova categoria de despesa', submitLabel: 'Criar categoria', onClose: () => { if (!done) resolve(null); },
      values: { icon: type === 'income' ? '💰' : EMOJIS[0], color: COLORS[0] },
      fields: [
        { name: 'name', label: 'Nome', required: true, full: true, maxlength: 40, placeholder: type === 'income' ? 'Ex.: Aluguel recebido, Freelance' : 'Ex.: Pet, Presentes' },
        { name: 'icon', label: 'Ícone', type: 'emoji', options: EMOJIS, full: true },
        { name: 'color', label: 'Cor', type: 'color', options: COLORS, full: true }
      ],
      onSubmit: async (v, c) => {
        const rec = await store.create('categories', { name: v.name, type, icon: v.icon, color: v.color, tag: 'other', bucket: type === 'expense' ? 'others' : '', keywords: '' });
        done = true; c.close(); resolve(rec.id);
      }
    });
  });
}

/** Lista de categorias com edição e arquivamento. */
export function renderManager(box) {
  const cats = store.activeOf('categories');
  const group = (type, title) => {
    const list = cats.filter((c) => c.type === type);
    return `<h4 class="sub-h">${title}</h4><div class="cat-grid">${list.map((c) => `<div class="cat-i">${drop(c.icon, c.color)}<span class="cat-n">${esc(c.name)}</span>${c.bucket === 'bills' ? pill('Conta', 'info') : ''}<button class="btn btn-ghost sm" data-edit="${esc(c.id)}">Editar</button><button class="btn btn-ghost sm" data-arch="${esc(c.id)}">Arquivar</button></div>`).join('') || '<p class="muted">Nenhuma.</p>'}</div>`;
  };
  box.innerHTML = cats.length ? group('expense', 'Despesas') + group('income', 'Receitas') : emptyState('bulb', 'Sem categorias', 'Crie a primeira.');
  box.onclick = async (e) => {
    const ed = e.target.closest('[data-edit]'), ar = e.target.closest('[data-arch]');
    if (ed) openCategoryModal(store.byId('categories', ed.dataset.edit));
    if (ar) {
      const c = store.byId('categories', ar.dataset.arch);
      if (!(await confirmDialog({ title: 'Arquivar categoria', text: `"${c.name}" some das listas, mas os lançamentos antigos continuam com ela.`, okLabel: 'Arquivar' }))) return;
      try { await store.remove('categories', c.id); toast('Categoria arquivada.', { kind: 'ok' }); } catch (err) { toast(err.message, { kind: 'err' }); }
    }
  };
}
