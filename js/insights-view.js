/** insights-view.js — tela de Insights (a regra de cada alerta está em insights.js). */
import * as store from './store.js';
import { computeInsights } from './insights.js';
import { $, esc, icon, emptyState } from './ui.js';

const LV = { bad: ['Atenção', 'bell'], warn: ['Revisar', 'bulb'], info: ['Para saber', 'bulb'], good: ['Boa notícia', 'check'] };

export const insightCard = (i) => `<a class="insight lv-${i.level}" href="${esc(i.href || '#/insights')}"><span class="insight-ic">${icon(LV[i.level][1])}</span><div><span class="insight-k">${LV[i.level][0]}</span><b>${esc(i.title)}</b><p>${esc(i.text)}</p></div></a>`;

export const insightsFor = () => computeInsights(store.data(), store.today(), { inboxPending: store.state.inboxCounts.pending });

export function render(view) {
  const list = insightsFor();
  $('#in-list', view).innerHTML = list.length ? list.map(insightCard).join('') : emptyState('check', 'Tudo em ordem', 'Nenhum alerta com os dados atuais.');
}
