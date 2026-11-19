/**
 * NOSSA FINANÇA — Setup.gs
 * Rode setup() UMA vez no editor do Apps Script. É idempotente: pode rodar de novo
 * sem apagar dados (só cria o que falta).
 *
 * Os tokens de acesso aparecem UMA vez em "Execução > Registros" (Logger).
 * Só o hash fica na planilha. Guarde cada token em um gerenciador de senhas.
 */

/** Nomes iniciais. Dá para trocar depois dentro do app (Configurações). */
const FAMILY_MEMBERS = [
  { name: 'Eu', email: '' },
  { name: 'Esposa', email: '' }
];

/** Categorias padrão (são configuração, não dados financeiros). [nome, tipo, ícone, cor, tag, bucket, palavras-chave] */
const DEFAULT_CATEGORIES = [
  ['Salário', 'income', '💼', '#12a572', 'salary', '', 'salario,folha,pagamento empresa'],
  ['Outras receitas', 'income', '💰', '#34c38f', 'other', '', 'pix recebido,deposito,reembolso,estorno,cashback'],
  ['Moradia', 'expense', '🏠', '#4a90e2', 'housing', 'bills', 'aluguel,condominio,iptu,financiamento imobiliario'],
  ['Contas da casa', 'expense', '💡', '#f5a524', 'housing', 'bills', 'energia,luz,enel,cemig,cpfl,agua,sabesp,gas,internet,vivo,claro,tim,oi'],
  ['Mercado', 'expense', '🛒', '#16a39a', 'food', 'bills', 'mercado,supermercado,carrefour,assai,atacadao,extra,pao de acucar,dia,hortifruti'],
  ['Fast food e delivery', 'expense', '🍔', '#f0566a', 'fastfood', 'others', 'ifood,rappi,mcdonald,burger king,bk brasil,subway,kfc,habib,pizza,lanche,delivery'],
  ['Restaurantes', 'expense', '🍽️', '#ff8a5b', 'food', 'others', 'restaurante,padaria,cafe,bar,lanchonete'],
  ['Combustível', 'expense', '⛽', '#6c5ce7', 'fuel', 'bills', 'posto,shell,ipiranga,petrobras,br mania,combustivel,gasolina,etanol'],
  ['Veículo', 'expense', '🚗', '#3d6ea8', 'vehicle', 'bills', 'ipva,seguro auto,mecanica,oficina,estacionamento,pedagio,sem parar,uber,99'],
  ['Saúde', 'expense', '🩺', '#e84393', 'health', 'bills', 'farmacia,drogaria,raia,drogasil,pague menos,consulta,plano de saude,unimed'],
  ['Educação', 'expense', '📚', '#00a8b5', 'education', 'bills', 'escola,faculdade,curso,mensalidade'],
  ['Assinaturas', 'expense', '📺', '#a55eea', 'subscription', 'others', 'netflix,spotify,amazon prime,disney,hbo,max,youtube,icloud,google one,deezer'],
  ['Lazer', 'expense', '🎉', '#fd9644', 'leisure', 'others', 'cinema,show,ingresso,viagem,hotel,steam,playstation'],
  ['Compras', 'expense', '🛍️', '#e17055', 'shopping', 'others', 'amazon,mercado livre,shopee,magalu,americanas,shein,loja'],
  ['Outros', 'expense', '🧾', '#8395a7', 'other', 'others', '']
];

function setup() {
  const ss = db_();
  Object.keys(SCHEMA).forEach(function (name) {
    const cols = SCHEMA[name];
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    const header = sh.getRange(1, 1, 1, cols.length);
    header.setValues([cols]);
    header.setFontWeight('bold');
    sh.setFrozenRows(1);
    // Colunas de texto ficam como texto puro: evita datas/números convertidos e fórmulas injetadas.
    const rows = Math.max(sh.getMaxRows() - 1, 1);
    cols.forEach(function (c, i) {
      if (NUM_COLS.indexOf(c) < 0 && BOOL_COLS.indexOf(c) < 0) {
        sh.getRange(2, i + 1, rows, 1).setNumberFormat('@');
      }
    });
  });
  removeDefaultSheet_(ss);
  seedCategories_();
  const created = setupFamily();
  Logger.log('Setup concluído. Abas: ' + Object.keys(SCHEMA).join(', '));
  return created;
}

/** Cria usuários que ainda não existem e registra o token de cada um (aparece só agora). */
function setupFamily() {
  const users = readAll_('Users');
  const created = [];
  FAMILY_MEMBERS.forEach(function (m) {
    if (users.some(function (u) { return u.name === m.name; })) return;
    const token = newToken_();
    const u = { id: uid_(), name: m.name, email: m.email || '', tokenHash: hash_(token), role: 'member', createdAt: iso_() };
    insert_('Users', u);
    created.push({ name: m.name, token: token });
    Logger.log('TOKEN de "' + m.name + '": ' + token + '   (guarde agora, não será exibido de novo)');
  });
  shareFolderWithFamily_();
  return created;
}

/** Gera token novo para todos os membros (use se perder ou vazar um token). */
function rotateTokens() {
  const users = readAll_('Users');
  users.forEach(function (u) {
    const token = newToken_();
    const row = findRow_('Users', u.id);
    u.tokenHash = hash_(token);
    writeRow_('Users', row, u);
    Logger.log('NOVO TOKEN de "' + u.name + '": ' + token);
  });
}

function seedCategories_() {
  if (readAll_('Categories').length) return;
  DEFAULT_CATEGORIES.forEach(function (c) {
    const now = iso_();
    insert_('Categories', {
      id: uid_(), name: c[0], type: c[1], icon: c[2], color: c[3], tag: c[4], bucket: c[5], keywords: c[6],
      createdAt: now, updatedAt: now, archived: false
    });
  });
}

function removeDefaultSheet_(ss) {
  ['Sheet1', 'Página1', 'Hoja 1'].forEach(function (n) {
    const sh = ss.getSheetByName(n);
    if (sh && ss.getSheets().length > 1 && sh.getLastRow() <= 1) ss.deleteSheet(sh);
  });
}

function shareFolderWithFamily_() {
  const emails = FAMILY_MEMBERS.map(function (m) { return m.email; }).filter(Boolean);
  if (!emails.length) return;
  const folder = folder_();
  emails.forEach(function (e) { try { folder.addEditor(e); } catch (err) { Logger.log('Não foi possível compartilhar a pasta com ' + e); } });
}
