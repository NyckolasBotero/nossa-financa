/**
 * insights.js — alertas e sugestões geradas SOMENTE a partir dos dados reais.
 * Cada regra só dispara quando há histórico suficiente; sem dados não inventa nada.
 */
import * as P from './projections.js';
import { brl, monthName } from './format.js';

// Limiares das regras (ajuste aqui, em um só lugar).
export const LIMITS = { fastfoodCount30d: 4, creditUsageWarn: 0.8, invoiceDueSoonDays: 5, lateBillMinRatio: 0.5, lateBillMinMonths: 3 };
const ORDER = { bad: 0, warn: 1, info: 2, good: 3 };

export function computeInsights(d, today, { inboxPending = 0 } = {}) {
  const out = [], push = (level, id, title, text, href) => out.push({ level, id, title, text, href });
  const cur = P.ym(today), cat = (id) => d.categories.find((c) => c.id === id);
  const tot = P.monthTotals(d, cur);

  if (!d.transactions.length) {
    return [{ level: 'info', id: 'start', title: 'Comece lançando suas movimentações', text: 'Assim que houver lançamentos, os alertas e as projeções aparecem aqui, baseados nos seus números.', href: '#/extract' }];
  }

  // 1. contas fixas atrasadas agora
  const late = P.billsForMonth(d, cur, today).filter((x) => x.status === 'late');
  if (late.length) {
    push('bad', 'late-now', `${late.length} conta${late.length > 1 ? 's' : ''} fixa${late.length > 1 ? 's' : ''} atrasada${late.length > 1 ? 's' : ''}`,
      `${late.map((x) => x.bill.name).join(', ')} somam ${brl(late.reduce((s, x) => s + x.bill.amount, 0))} em aberto.`, '#/fixed');
  }
  // 1b. receitas fixas que deveriam ter caído e ainda não caíram
  const lateInc = P.billsForMonth(d, cur, today, 'income').filter((x) => x.status === 'late');
  if (lateInc.length) push('warn', 'late-income', `${lateInc.length} receita${lateInc.length > 1 ? 's' : ''} fixa${lateInc.length > 1 ? 's' : ''} ainda não recebida${lateInc.length > 1 ? 's' : ''}`,
    `${lateInc.map((x) => x.bill.name).join(', ')} somam ${brl(lateInc.reduce((s, x) => s + x.bill.amount, 0))} previstos e não lançados. Confirme se já caiu e lance.`, '#/fixed');
  // 2. contas que atrasam com frequência
  for (const b of d.fixedBills.filter((x) => P.billKind(x) === 'expense')) {
    const h = P.lateHistory(d, b, today);
    if (h.counted >= LIMITS.lateBillMinMonths && h.late / h.counted >= LIMITS.lateBillMinRatio) {
      push('warn', `late-hist-${b.id}`, `${b.name} costuma atrasar`, `Foi paga depois do vencimento em ${h.late} de ${h.counted} meses. Considere antecipar o pagamento ou mudar o dia de vencimento.`, '#/fixed');
    }
  }
  // 3. fast food / delivery
  const from30 = P.addDays(today, -30);
  const ff = d.transactions.filter((t) => t.type === 'expense' && t.date > from30 && t.date <= today && P.tagOf(d, t) === 'fastfood');
  if (ff.length >= LIMITS.fastfoodCount30d) {
    const total = ff.reduce((s, t) => s + t.amount, 0), ticket = total / ff.length;
    push('warn', 'fastfood', `${ff.length} pedidos de fast food nos últimos 30 dias`,
      `Foram ${brl(total)} (ticket médio ${brl(ticket)}). Cortar 2 pedidos por semana economizaria cerca de ${brl(ticket * 8)} por mês.`, '#/extract');
  }
  // 4. categorias crescendo
  for (const g of P.categoryGrowth(d, today).slice(0, 3)) {
    const c = cat(g.categoryId);
    push('warn', `growth-${g.categoryId}`, `${c ? c.name : 'Sem categoria'} acima do seu padrão`,
      `Já são ${brl(g.now)} em ${monthName(cur)}; no mesmo ponto dos meses anteriores você estava perto de ${brl(g.expected)} (média mensal ${brl(g.avgMonth)}).`, '#/reports');
  }
  // 5. assinaturas e despesas recorrentes
  const rec = P.recurringExpenses(d, today);
  const subs = rec.filter((r) => r.tag === 'subscription');
  if (subs.length) push('info', 'subs', `${subs.length} assinatura${subs.length > 1 ? 's' : ''} recorrente${subs.length > 1 ? 's' : ''}`,
    `${subs.map((s) => s.label).slice(0, 4).join(', ')} somam cerca de ${brl(subs.reduce((s, x) => s + x.avg, 0))} por mês. Vale revisar o que você realmente usa.`, '#/extract');
  const others = rec.filter((r) => r.tag !== 'subscription' && !r.fixed).slice(0, 3);
  if (others.length) push('info', 'recurring', 'Gastos que se repetem todo mês',
    others.map((r) => `${r.label} (~${brl(r.avg)})`).join(', ') + '. Se forem fixos, cadastre em Contas fixas para ganhar previsão.', '#/fixed');
  // 6. planejamento 30/50/20
  const b = P.budget(d, today);
  if (b.base > 0) {
    for (const r of b.rows.filter((x) => x.key !== 'reserve')) {
      if (r.status === 'over') push('bad', `budget-${r.key}`, `${r.label} passou do limite planejado`, `Gasto de ${brl(r.actual)} contra ${brl(r.planned)} (${r.pct}% da renda).`, '#/planning');
      else if (r.status === 'warn') push('warn', `budget-${r.key}`, `${r.label} perto do limite`, `${Math.round(r.ratio * 100)}% do planejado já foi usado (${brl(r.actual)} de ${brl(r.planned)}).`, '#/planning');
    }
    const rs = b.rows[0];
    if (rs.status === 'ok') push('good', 'reserve-ok', 'Meta de reserva do mês atingida', `Você guardou ${brl(rs.actual)}, acima dos ${brl(rs.planned)} planejados (${rs.pct}%).`, '#/planning');
  }
  // 7. projeção do fim do mês
  const me = P.monthEnd(d, today);
  if (d.accounts.length && me.projected < 0) {
    push('bad', 'proj-negative', 'Saldo previsto negativo no fim do mês', `A estimativa é terminar o mês com ${brl(me.projected)} na conta. Revise gastos variáveis ou adie compras.`, '#/planning');
  }
  // 8. cartões
  for (const c of d.cards) {
    if (c.kind === 'food') {
      const spent30 = d.transactions.filter((t) => t.cardId === c.id && t.type === 'expense' && t.date > from30).reduce((s, t) => s + t.amount, 0);
      const bal = P.foodBalance(d, c), daily = spent30 / 30;
      if (daily > 0 && bal / daily < me.daysLeft) push('warn', `food-${c.id}`, `${c.name}: saldo pode não durar o mês`,
        `Saldo de ${brl(bal)} dura cerca de ${Math.floor(bal / daily)} dias no ritmo atual; faltam ${me.daysLeft} dias para o fim do mês.`, '#/cards');
    } else {
      const used = P.creditUsed(d, c);
      if (c.limit > 0 && used / c.limit >= LIMITS.creditUsageWarn) push('warn', `limit-${c.id}`, `${c.name}: ${Math.round(used / c.limit * 100)}% do limite usado`, `${brl(used)} de ${brl(c.limit)}.`, '#/cards');
      for (const m of [P.addMonths(cur, -1), cur, P.addMonths(cur, 1)]) {
        const inv = P.invoiceInfo(d, c, m), dd = P.diffDays(today, inv.due);
        if (inv.open > 0 && dd >= 0 && dd <= LIMITS.invoiceDueSoonDays) {
          push('warn', `invoice-${c.id}-${m}`, `Fatura ${c.name} vence ${dd === 0 ? 'hoje' : 'em ' + dd + ' dia' + (dd > 1 ? 's' : '')}`, `${brl(inv.open)} em aberto.`, '#/cards');
        }
      }
    }
  }
  // 9. notificações paradas
  if (inboxPending > 0) push('info', 'inbox', `${inboxPending} notificação${inboxPending > 1 ? 'ões' : ''} esperando confirmação`, 'Confirme para entrar no extrato ou recuse para guardar na lista de revisão.', '#/inbox');

  return out.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}
