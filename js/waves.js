/**
 * waves.js — fundo decorativo do menu e do login: barrinhas com uma bolinha em cima (a família do logo)
 * subindo como um gráfico, nas quatro cores da marca, respirando em ondas. O nome waveSet foi mantido.
 * barSet(n): n barras; a tendência sobe da esquerda para a direita, com variações.
 */
const WOBBLE = [0, 7, -4, 9, -2, 5, -6, 8, 1, -5, 6, -3];             // variação pequena para não ficar uniforme
export const barSet = (n = 4) => {
  let h = '';
  for (let i = 0; i < n; i++) {
    const trend = 26 + 52 * (n > 1 ? i / (n - 1) : 1);                  // sobe da esquerda para a direita, como um gráfico
    const v = Math.round(Math.max(18, Math.min(74, trend + WOBBLE[i % WOBBLE.length])));
    h += `<i class="fam-bar c${(i % 4) + 1}" style="--h:${v};--dl:${(-i * 0.9).toFixed(1)}s;--dur:${(5.2 + (i % 3) * 1.1).toFixed(1)}s"></i>`;
  }
  return `<div class="fam-bars">${h}</div>`;
};
/** Menu (poucas barras) ou tela de login (muitas, ocupando a largura). */
export const waveSet = (wide = false) => barSet(wide ? 22 : 4);
