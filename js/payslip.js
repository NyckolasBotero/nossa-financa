/**
 * payslip.js — envio do contracheque (PDF ou foto), leitura no backend (OCR do Drive) e conferência.
 * A leitura é uma estimativa: você confere e corrige antes de gravar. O que entra no extrato
 * é o valor líquido como receita; bruto, descontos e rubricas ficam nas observações.
 */
import * as api from './api.js';
import * as store from './store.js';
import { esc, pill, formModal, confirmDialog, toast, prepareUpload, brl, monthLabel, uuid } from './ui.js';

const KIND = { earning: ['Provento', 'ok'], discount: ['Desconto', 'bad'], info: ['Informativo', 'neutral'] };

export function openPayslipModal() {
  return formModal({
    title: 'Ler contracheque', submitLabel: 'Ler contracheque', values: { ownerId: store.prefs.who !== 'family' ? store.prefs.who : store.state.me.id },
    belowTitle: '<p class="muted">Envie o PDF ou uma foto nítida. A leitura leva alguns segundos e você confere tudo antes de lançar.</p>',
    fields: [
      { name: 'files', label: 'Arquivo', type: 'files', full: true, accept: 'application/pdf,image/*', buttonLabel: 'Escolher PDF ou foto', required: true },
      { name: 'ownerId', label: 'De quem é', type: 'select', options: store.ownerOptions(), required: true }
    ],
    onSubmit: async (v, c) => {
      const f = v.files[0];
      if (!f) throw new Error('Escolha o arquivo do contracheque.');
      const up = await prepareUpload(f);
      const r = await api.call('payslip.parse', up, { timeout: 90000, feedback: { start: 'Lendo o contracheque…', text: 'Pode levar alguns segundos', done: 'Contracheque lido: confira os valores' } });
      c.close();
      openReview(r, v.ownerId);
    }
  });
}

function openReview({ attachment, result: p }, ownerId) {
  const incomeCats = store.categoryOptions('income');
  const salary = store.activeOf('categories').find((x) => x.type === 'income' && x.tag === 'salary');
  const accounts = store.activeOf('accounts').map((a) => ({ value: a.id, label: a.name }));
  if (!accounts.length) return toast('Cadastre uma conta para receber o salário e tente de novo.', { kind: 'warn' });
  const warn = p.warnings.length ? `<div class="note">${p.warnings.map((w) => `<span>${esc(w)}</span>`).join('')}</div>` : '';
  const items = p.items.length ? `<table class="tbl"><tbody>${p.items.map((i) => `<tr><td>${esc(i.label)}</td><td>${pill(KIND[i.kind][0], KIND[i.kind][1])}</td><td class="num">${esc(brl(i.value))}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Não identifiquei as rubricas individuais.</p>';
  const clientId = uuid();   // repetir o envio não duplica o salário
  return formModal({
    title: 'Conferir contracheque', submitLabel: 'Lançar salário', wide: true,
    belowTitle: `${warn}<details class="items" ${p.items.length ? 'open' : ''}><summary>Rubricas encontradas (${p.items.length})</summary>${items}</details>`,
    values: { competence: p.competence || '', net: p.net, gross: p.gross, discounts: p.discounts, date: store.today(), accountId: accounts[0].value, categoryId: salary?.id || '', ownerId, description: p.competence ? `Salário ${monthLabel(p.competence)}` : 'Salário' },
    fields: [
      { name: 'net', label: 'Valor líquido (cai na conta)', type: 'money', required: true },
      { name: 'date', label: 'Data do recebimento', type: 'date', required: true },
      { name: 'competence', label: 'Competência', type: 'month' },
      { name: 'gross', label: 'Total bruto', type: 'money', positive: false },
      { name: 'discounts', label: 'Total de descontos', type: 'money', positive: false },
      { name: 'description', label: 'Descrição', required: true, full: true },
      { name: 'accountId', label: 'Conta que recebe', type: 'select', required: true, options: accounts },
      { name: 'categoryId', label: 'Categoria', type: 'select', options: incomeCats, placeholder: 'Sem categoria' }
    ],
    onSubmit: async (v, c) => {
      const label = v.competence ? `Competência ${v.competence}` : '';
      const dup = label && store.state.transactions.some((t) => t.origin === 'payslip' && t.ownerId === ownerId && (t.notes || '').startsWith(label));
      if (dup && !(await confirmDialog({ title: 'Contracheque já lançado', text: `Já existe um salário lançado para ${monthLabel(v.competence)}. Lançar de novo?`, okLabel: 'Lançar mesmo assim' }))) return;
      const pick = (re) => p.items.find((i) => re.test(i.label.toLowerCase()) && i.kind === 'discount');
      const parts = [label, v.gross != null ? `Bruto ${brl(v.gross)}` : '', v.discounts != null ? `Descontos ${brl(v.discounts)}` : '', pick(/inss/) ? `INSS ${brl(pick(/inss/).value)}` : '', pick(/irrf|\bir\b/) ? `IRRF ${brl(pick(/irrf|\bir\b/).value)}` : ''].filter(Boolean);
      await store.create('transactions', { type: 'income', amount: v.net, date: v.date, description: v.description, categoryId: v.categoryId || '', accountId: v.accountId, ownerId, scope: 'individual', origin: 'payslip', notes: parts.join(' · ').slice(0, 480), attachmentIds: [attachment.id], clientId, force: true });
      toast('Salário lançado com o contracheque anexado.', { kind: 'ok' }); c.close();
    }
  });
}
