/**
 * vault.js — cofre de segurança: quanto é preciso para manter a família por N meses (padrão 6) e quanto já foi guardado.
 * O cofre é uma meta (kind "vault") criada na primeira vez; guardar nele é um lançamento "guardado" ligado a ela.
 */
import * as store from './store.js';
import * as P from './projections.js';
import { $, esc, pill, emptyState, formModal, toast, brl, fmtDate, uuid } from './ui.js';
import { safe, bar } from './charts.js';

const basisText = { manual: 'valor que você informou', history: 'média dos gastos dos últimos meses', fixed: 'soma das contas fixas do mês', none: 'ainda sem dados' };

export function vaultSummary() {
  const d = store.data(), today = store.today();
  return P.vaultInfo(d, today, store.state.settings);
}

async function ensureGoal(info) {
  if (info.goal) return info.goal;
  return store.create('goals', { name: 'Cofre de segurança', target: Math.max(0.01, info.target || 1), deadline: '', ownerId: store.state.me.id, scope: 'shared', kind: 'vault' });
}

export function openVaultDeposit(amount = null) {
  const accounts = store.activeOf('accounts');
  if (!accounts.length) return toast('Cadastre uma conta para guardar dinheiro no cofre.', { kind: 'warn' });
  const clientId = uuid();
  return formModal({
    title: 'Guardar no cofre de segurança', submitLabel: 'Guardar', values: { date: store.today(), accountId: accounts[0].id, amount: typeof amount === 'number' ? amount : null },
    fields: [
      { name: 'amount', label: 'Valor', type: 'money', required: true },
      { name: 'date', label: 'Data', type: 'date', required: true },
      { name: 'accountId', label: 'Sai da conta', type: 'select', required: true, full: true, options: accounts.map((a) => ({ value: a.id, label: a.name })) }
    ],
    onSubmit: async (v, c) => {
      const goal = await ensureGoal(vaultSummary());
      await store.create('transactions', { type: 'saving', goalId: goal.id, accountId: v.accountId, amount: v.amount, date: v.date, description: 'Guardado: cofre de segurança', ownerId: store.state.me.id, origin: 'manual', clientId, force: true });
      toast('Valor guardado no cofre.', { kind: 'ok' }); c.close();
    }
  });
}

export function openVaultSettings() {
  const v = store.state.settings?.vault || {};
  const info = vaultSummary();
  return formModal({
    title: 'Como calcular o cofre', submitLabel: 'Salvar',
    belowTitle: `<p class="muted">Custo de vida usado agora: <b>${esc(brl(info.cost.value))}</b> por mês (${esc(basisText[info.cost.basis])}).</p>`,
    values: { monthlyCost: v.monthlyCost ?? null, months: v.months || 6 },
    fields: [
      { name: 'monthlyCost', label: 'Custo de vida mensal da família', type: 'money', hint: 'Deixe vazio para usar a média dos gastos dos últimos 3 meses.' },
      { name: 'months', label: 'Meses de segurança', type: 'number', min: 1, max: 24, required: true, hint: 'Recomendação comum: 6 meses.' }
    ],
    onSubmit: async (val, c) => {
      await store.saveSettings({ vault: { monthlyCost: val.monthlyCost || null, months: Number(val.months) || 6 } });
      toast('Cálculo do cofre atualizado.', { kind: 'ok' }); c.close();
    }
  });
}

export function render(view) {
  const info = vaultSummary(), d = store.data();
  $('#vt-sub', view).textContent = `Quanto é preciso para manter a família por ${info.months} meses sem renda.`;
  if (info.cost.value <= 0) {
    $('#vt-body', view).innerHTML = `<div class="card">${emptyState('wallet', 'Ainda não dá para calcular', 'Informe o custo de vida mensal da família ou lance alguns gastos para eu estimar.', '<button class="btn btn-primary" data-set>Informar custo de vida</button>')}</div>`;
  } else {
    const deposits = d.transactions.filter((t) => t.type === 'saving' && info.goal && t.goalId === info.goal.id).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
    const tone = info.monthsSafe >= info.months ? 'ok' : info.monthsSafe >= info.months / 2 ? 'warn' : 'over';
    $('#vt-body', view).innerHTML = `<div class="grid-2 vault-row">
      <article class="card vault-card"><div class="vault-fig">${safe(info.level, { label: 'Cofre de segurança' })}</div>
        <div class="vault-info"><span class="cup-pct">${Math.round(info.level * 100)}%</span><b>${esc(brl(info.saved))} guardados</b><span class="muted">da meta de ${esc(brl(info.target))}</span>
        ${bar(info.level, tone)}${info.missing > 0 ? `<p>Faltam <b>${esc(brl(info.missing))}</b></p>` : pill('Cofre completo', 'ok')}</div></article>
      <article class="card"><header class="card-h"><h3>Sua segurança hoje</h3></header>
        <div class="kpi-row vault-kpis"><div class="kpi mini"><span class="kpi-l">Meses de segurança</span><span class="kpi-v">${info.monthsSafe.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</span><span class="kpi-s">de ${info.months} desejados</span></div>
        <div class="kpi mini"><span class="kpi-l">Dias de segurança</span><span class="kpi-v">${info.daysSafe}</span><span class="kpi-s">sem nenhuma renda</span></div>
        <div class="kpi mini"><span class="kpi-l">Custo de vida mensal</span><span class="kpi-v">${esc(brl(info.cost.value))}</span><span class="kpi-s">${esc(basisText[info.cost.basis])}</span></div></div>
        <p class="muted small">Meta = custo de vida × ${info.months} meses. Guarde um pouco todo mês: cada depósito sobe o nível do cofre.</p></article></div>
      <article class="card"><header class="card-h"><h3>Últimos depósitos</h3></header>${deposits.length ? deposits.map((t) => `<div class="mini-row"><span><b>${esc(fmtDate(t.date))}</b><small>${esc(store.sourceLabel(t))}</small></span><b class="pos">${esc(brl(t.amount))}</b></div>`).join('') : '<p class="muted">Nenhum depósito ainda. Comece com qualquer valor.</p>'}</article>`;
  }
  view.onclick = (e) => { if (e.target.closest('[data-set]')) openVaultSettings(); };
  $('#vt-add', view).onclick = openVaultDeposit;
  $('#vt-set', view).onclick = openVaultSettings;
}
