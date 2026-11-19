/**
 * verses.js — versículos sobre sabedoria com dinheiro (tradução Almeida Revista e Corrigida, domínio público).
 * Um por dia; "Outro versículo" passa para o próximo.
 */
export const VERSES = [
  ['Provérbios 21:5', 'Os pensamentos do diligente tendem só à abundância; mas todo apressado, só à penúria.'],
  ['Provérbios 22:7', 'O rico domina sobre os pobres, e o que toma emprestado é servo do que empresta.'],
  ['Lucas 14:28', 'Porque qual de vós, querendo edificar uma torre, não se assenta primeiro a fazer as contas dos gastos, para ver se tem com que a acabar?'],
  ['Provérbios 21:20', 'Há tesouro precioso e azeite na casa do sábio, mas o homem insensato os desperdiça.'],
  ['Provérbios 6:6-8', 'Vai ter com a formiga, ó preguiçoso; olha para os seus caminhos, e sê sábio. A qual, não tendo chefe, nem superintendente, nem governador, prepara no verão o seu mantimento, e ajunta no tempo da sega o seu alimento.'],
  ['Provérbios 13:11', 'A fazenda que procede da vaidade diminuirá, mas quem a ajunta com o trabalho terá aumento.'],
  ['Provérbios 27:23', 'Conhece o estado das tuas ovelhas, e põe o teu coração sobre os teus rebanhos.'],
  ['Provérbios 10:4', 'O que trabalha com mão remissa empobrece, mas a mão dos diligentes enriquece.'],
  ['Mateus 6:21', 'Porque onde estiver o vosso tesouro, aí estará também o vosso coração.'],
  ['Hebreus 13:5', 'Sejam vossos costumes sem avareza, contentando-vos com o que tendes; porque ele disse: Não te deixarei, nem te desampararei.'],
  ['Filipenses 4:19', 'O meu Deus, segundo as suas riquezas, suprirá todas as vossas necessidades em glória, por Cristo Jesus.'],
  ['Provérbios 14:23', 'Em todo trabalho há proveito, mas o falar de lábios só encaminha à pobreza.']
];
export const verseOfDay = (iso, shift = 0) => {
  const n = Math.floor(Date.parse(`${iso}T12:00:00Z`) / 864e5);
  return VERSES[(((n + shift) % VERSES.length) + VERSES.length) % VERSES.length];
};
