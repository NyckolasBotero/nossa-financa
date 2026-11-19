/**
 * goals.js — metas financeiras. O valor guardado de cada meta é a soma dos aportes
 * (lançamentos do tipo "guardado"), que saem do saldo da conta de origem.
 */
import * as store from './store.js';
import * as P from './projections.js';
import { $, esc, pill, emptyState, formModal, confirmDialog, toast, brl, fmtDate, uuid } from './ui.js';
import { cup } from './charts.js';

export function openGoalModal(goal = null) {
  const editing = !!goal;
  return formModal({
    title: editing ? 'Editar meta' : 'Nova meta', submitLabel: editing ? 'Salvar' : 'Criar meta',
    values: goal || { ownerId: store.prefs.who !== 'family' ? store.prefs.who : store.state.me.id, scope: 'shared' },
    fields: [
      { name: 'name', label: 'Nome da meta', required: true, full: true, placeholder: 'Ex.: Reserva de emergência, Viagem' },
      { name: 'target', label: 'Valor da meta', type: 'money', required: true },
      { name: 'deadline', label: 'Prazo', type: 'date' },
      { name: 'ownerId', label: 'Responsável', type: 'select', options: store.ownerOptions(), required: true },
      { name: 'scope', label: 'Tipo', type: 'segmented', options: [{ value: 'individual', label: 'Individual' }, { value: 'shared', label: 'Compartilhada' }] }
    ],
    onSubmit: async (v, c) => {
      const payload = { name: v.name, target: v.target, deadline: v.deadline || '', ownerId: v.ownerId, scope: v.scope };
      if (editing) await store.update('goals', { id: goal.id, ...payload }); else await store.create('goals', payload);
      toast('Meta salva.', { kind: 'ok' }); c.close();
    }
  });
}

function openContribute(goal) {
  const accounts = store.activeOf('accounts');
  if (!accounts.length) return toast('Cadastre uma conta para guardar dinheiro.', { kind: 'warn' });
  const clientId = uuid();   // repetir o envio não duplica o aporte
  return formModal({
    title: `Guardar para · ${goal.name}`, submitLabel: 'Guardar',
    values: { date: store.today(), accountId: accounts[0].id },
    fields: [
      { name: 'amount', label: 'Valor', type: 'money', required: true },
      { name: 'date', label: 'Data', type: 'date', required: true },
      { name: 'accountId', label: 'Sai da conta', type: 'select', required: true, full: true, options: accounts.map((a) => ({ value: a.id, label: a.name })) }
    ],
    onSubmit: async (v, c) => {
      await store.create('transactions', { type: 'saving', goalId: goal.id, accountId: v.accountId, amount: v.amount, date: v.date, description: `Guardado: ${goal.name}`, ownerId: store.state.me.id, origin: 'manual', clientId, force: true });
      toast('Valor guardado.', { kind: 'ok' }); c.close();
    }
  });
}

export function render(view) {
  const d = store.data(), today = store.today();
  $('#gl-total', view).textContent = brl(P.savedTotal(d));
  const goals = d.goals.filter((g) => g.kind !== 'vault');   // o cofre tem tela própria
  $('#gl-list', view).innerHTML = goals.length ? goals.map((g) => {
    const saved = P.goalSaved(d, g), left = Math.max(0, g.target - saved), ratio = g.target > 0 ? saved / g.target : 0;
    let plan = '';
    if (g.deadline && left > 0) {
      const months = Math.max(1, Math.ceil(P.diffDays(today, g.deadline) / 30));
      plan = g.deadline < today ? pill('Prazo vencido', 'bad') : `<p class="muted">Para chegar em ${esc(fmtDate(g.deadline))}, guarde cerca de <b>${esc(brl(left / months))}</b> por mês.</p>`;
    }
    return `<article class="ent goal ${ratio >= 1 ? 'done' : ''}"><header class="ent-h"><div class="goal-cup">${cup(ratio, { label: g.name })}<b class="goal-pct">${Math.round(ratio * 100)}%</b></div><div><h3>${esc(g.name)}</h3><p class="muted">${esc(brl(saved))} de ${esc(brl(g.target))}</p></div>${g.scope === 'shared' ? pill('Compartilhada', 'info') : pill(store.userName(g.ownerId))}</header>
      ${ratio >= 1 ? pill('Meta atingida', 'ok') : `<p>Faltam <b>${esc(brl(left))}</b></p>`}${plan}
      <div class="ent-actions"><button class="btn btn-primary sm" data-save="${esc(g.id)}">Guardar</button><button class="btn btn-soft sm" data-edit="${esc(g.id)}">Editar</button><button class="btn btn-ghost sm" data-arch="${esc(g.id)}">Arquivar</button></div></article>`;
  }).join('') : `<div class="card">${emptyState('flag', 'Nenhuma meta ainda', 'Crie metas como reserva de emergência ou viagem e acompanhe o progresso.', '<button class="btn btn-primary" data-new>Criar meta</button>')}</div>`;

  view.onclick = async (e) => {
    const g = (a) => e.target.closest(`[data-${a}]`)?.dataset[a];
    if (e.target.closest('[data-new]')) return openGoalModal();
    if (g('save')) return openContribute(store.byId('goals', g('save')));
    if (g('edit')) return openGoalModal(store.byId('goals', g('edit')));
    if (g('arch')) {
      const goal = store.byId('goals', g('arch'));
      if (!(await confirmDialog({ title: 'Arquivar meta', text: `"${goal.name}" sai da lista. O dinheiro já guardado continua na economia acumulada.`, okLabel: 'Arquivar' }))) return;
      try { await store.remove('goals', goal.id); toast('Meta arquivada.', { kind: 'ok' }); } catch (err) { toast(err.message, { kind: 'err' }); }
    }
  };
  $('#gl-new', view).addEventListener('click', () => openGoalModal());
}
