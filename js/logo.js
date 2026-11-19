/**
 * logo.js — logo da família em SVG minimalista: pai e mãe maiores, um menino e uma menina.
 * As cores vêm das variáveis --logo-1..4 (mudam com o tema).
 */
export const familySvg = ({ cls = 'logo', title = 'Nossa Finança' } = {}) => `<svg class="${cls}" viewBox="0 0 150 104" role="img" aria-label="${title}" xmlns="http://www.w3.org/2000/svg">
  <g class="lg-man"><circle cx="38" cy="22" r="10" fill="var(--logo-1)"/><rect x="26" y="35" width="24" height="52" rx="12" fill="var(--logo-1)"/></g>
  <g class="lg-woman"><circle cx="112" cy="22" r="10" fill="var(--logo-2)"/><path d="M112 35c-10 0-14 7-16 17l-5 34c-.4 3 1.4 5 4 5h34c2.600 0 4.400-2 4-5l-5-34c-2-10-6-17-16-17z" fill="var(--logo-2)"/></g>
  <g class="lg-boy"><circle cx="68" cy="58" r="7" fill="var(--logo-3)"/><rect x="60" y="67" width="16" height="30" rx="8" fill="var(--logo-3)"/></g>
  <g class="lg-girl"><circle cx="85" cy="58" r="7" fill="var(--logo-4)"/><path d="M85 67c-6.500 0-9 5-10 11l-2.500 18c-.2 1.500.8 2.500 2.200 2.500h20.600c1.400 0 2.400-1 2.200-2.500L95 78c-1-6-3.500-11-10-11z" fill="var(--logo-4)"/></g>
</svg>`;

/** Marca usada no menu: só a família, com tamanho do botão. */
export const brandMark = () => familySvg({ cls: 'logo logo-sm' });

// ---------------------------------------------------------------- famílias com humor (velocímetro da saúde financeira)
const face = (cx, cy, r, mood) => {
  const e = r * 0.32, y = cy - r * 0.12, w = r * 0.36, m = cy + r * 0.34;
  const mouth = mood === 'sad' ? `M${cx - w} ${m + r * 0.28}q${w} ${-r * 0.5} ${w * 2} 0` : mood === 'hug' ? `M${cx - w * 1.2} ${m - r * 0.1}q${w * 1.2} ${r * 0.9} ${w * 2.4} 0z` : `M${cx - w} ${m}q${w} ${r * 0.55} ${w * 2} 0`;
  const eyes = mood === 'hug' ? `<path d="M${cx - e * 1.9} ${y}q${e * 0.9} ${-e * 1.2} ${e * 1.8} 0M${cx + e * 0.1} ${y}q${e * 0.9} ${-e * 1.2} ${e * 1.8} 0" fill="none" stroke="#fff" stroke-width="${r * 0.14}" stroke-linecap="round"/>`
    : `<circle cx="${cx - e * 1.1}" cy="${y}" r="${r * 0.12}" fill="#fff"/><circle cx="${cx + e * 1.1}" cy="${y}" r="${r * 0.12}" fill="#fff"/>`;
  return `${eyes}<path d="${mouth}" fill="${mood === 'hug' ? '#fff' : 'none'}" stroke="#fff" stroke-width="${r * 0.14}" stroke-linecap="round" stroke-linejoin="round"/>`;
};
const man = (mood) => `<circle cx="38" cy="22" r="10" fill="var(--logo-1)"/><rect x="26" y="35" width="24" height="52" rx="12" fill="var(--logo-1)"/>${face(38, 22, 10, mood)}`;
const woman = (mood) => `<circle cx="112" cy="22" r="10" fill="var(--logo-2)"/><path d="M112 35c-10 0-14 7-16 17l-5 34c-.4 3 1.4 5 4 5h34c2.600 0 4.400-2 4-5l-5-34c-2-10-6-17-16-17z" fill="var(--logo-2)"/>${face(112, 22, 10, mood)}`;
const boy = (mood) => `<circle cx="68" cy="58" r="7" fill="var(--logo-3)"/><rect x="60" y="67" width="16" height="30" rx="8" fill="var(--logo-3)"/>${face(68, 58, 7, mood)}`;
const girl = (mood) => `<circle cx="85" cy="58" r="7" fill="var(--logo-4)"/><path d="M85 67c-6.500 0-9 5-10 11l-2.500 18c-.2 1.500.8 2.500 2.200 2.500h20.600c1.400 0 2.400-1 2.200-2.500L95 78c-1-6-3.500-11-10-11z" fill="var(--logo-4)"/>${face(85, 58, 7, mood)}`;

/** Conteúdo SVG (viewBox 0 0 150 104) da família em um dos humores: 'sad' | 'ok' | 'hug'. */
export function familyMood(mood) {
  if (mood === 'sad') {
    return `<g class="fm-sad" opacity=".9"><g transform="rotate(-7 38 87) translate(-2 5)">${man('sad')}</g><g transform="rotate(7 112 87) translate(2 5)">${woman('sad')}</g>
      <g transform="translate(-8 5)">${boy('sad')}</g><g transform="translate(8 5)">${girl('sad')}</g>
      <g class="fm-cloud"><path d="M52 14a8 8 0 0 1 14-5 9 9 0 0 1 17 2 7 7 0 0 1-1 14H56a7 7 0 0 1-4-11z" fill="#8fa9bd"/><path d="M58 28l-2 6M68 28l-2 6M78 28l-2 6" stroke="#5d8df6" stroke-width="2.200" stroke-linecap="round"/></g></g>`;
  }
  if (mood === 'hug') {
    return `<g class="fm-hug"><g transform="translate(9 0)">${man('hug')}</g><g transform="translate(-9 0)">${woman('hug')}</g>
      <g transform="translate(0 -3)">${boy('hug')}${girl('hug')}</g>
      <path d="M52 48q22 4 30 24" fill="none" stroke="var(--logo-1)" stroke-width="9" stroke-linecap="round"/><path d="M98 48q-22 4-30 24" fill="none" stroke="var(--logo-2)" stroke-width="9" stroke-linecap="round"/>
      <path class="fm-heart" d="M75 16c-5-8-15-3-10 4 3 4 10 9 10 9s7-5 10-9c5-7-5-12-10-4z" fill="var(--expense)"/></g>`;
  }
  return `<g class="fm-ok">${man('ok')}${woman('ok')}${boy('ok')}${girl('ok')}</g>`;
}
