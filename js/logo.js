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
