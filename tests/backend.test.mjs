// Teste do backend (Code.gs único) rodando em Node com um mock em memória
// de SpreadsheetApp/DriveApp/Utilities. Os dados abaixo são sintéticos e só existem neste teste.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const dir = path.resolve(import.meta.dirname, '../backend');
const logs = [];

function colRange(sh, r, c, nr, nc) {
  return {
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (sh.rows[r - 1 + i] || [])[c - 1 + j] ?? '')),
    setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { (sh.rows[r - 1 + i] = sh.rows[r - 1 + i] || [])[c - 1 + j] = x; })); return this; },
    setFontWeight() { return this; }, setNumberFormat() { return this; }
  };
}
const mkSheet = (name) => ({
  name, rows: [],
  getLastRow() { return this.rows.length; }, getMaxRows() { return 1000; },
  getRange(r, c, nr = 1, nc = 1) { return colRange(this, r, c, nr, nc); },
  appendRow(a) { this.rows.push(a); }, setFrozenRows() {},
  deleteRow(i) { this.rows.splice(i - 1, 1); }
});
const sheets = {};
const ss = {
  getSheetByName: (n) => sheets[n] || null,
  insertSheet: (n) => (sheets[n] = mkSheet(n)),
  getSheets: () => Object.values(sheets), deleteSheet() {}
};
const files = {};
const folder = { createFile(blob) { const id = 'f' + Object.keys(files).length; files[id] = blob; return { getId: () => id, getUrl: () => 'https://drive/' + id, setTrashed() {} }; }, addEditor() {} };

const ctx = vm.createContext({
  console, Logger: { log: (s) => logs.push(s) },
  Session: { getScriptTimeZone: () => 'America/Sao_Paulo' },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ s, setMimeType() { return this; } }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ss },
  DriveApp: { getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => folder, getFileById: () => ({ setTrashed() {} }) },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (a, s) => Array.from(crypto.createHash('sha256').update(String(s)).digest()).map((b) => (b > 127 ? b - 256 : b)),
    base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
    newBlob: (bytes, mime, name) => ({ bytes, mime, name, getContentType: () => mime }),
    formatDate: (d, tz, f) => { const iso = new Date(d.getTime() - 3 * 3600e3).toISOString(); return f === 'yyyy-MM' ? iso.slice(0, 7) : iso.slice(0, 10); }
  }
});
for (const f of ['Code.gs']) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });

const call = (action, payload = {}, token) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action, token, payload }) } }).s);
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ok -', name); };

// ---- setup
const created = ctx.setup();
const [meTok, wifeTok] = created.map((c) => c.token);
ok('setup cria 11 abas, categorias padrão e 2 tokens', () => {
  assert.equal(Object.keys(sheets).length, 11);
  assert.equal(created.length, 2);
  assert.equal(sheets.Categories.rows.length, 1 + 15);
  assert.ok(!JSON.stringify(sheets.Users.rows).includes(meTok), 'token em texto puro não pode ficar na planilha');
});
ok('setup é idempotente', () => { assert.equal(ctx.setup().length, 0); assert.equal(sheets.Categories.rows.length, 16); });
ok('token inválido é recusado', () => { const r = call('bootstrap', {}, 'x'); assert.equal(r.error.code, 'UNAUTHORIZED'); });

const boot = call('bootstrap', {}, meTok).data;
const me = boot.me, wife = boot.users.find((u) => u.id !== me.id);
const cat = (name) => boot.categories.find((c) => c.name === name).id;

// ---- contas e cartões
const acc = call('account.create', { name: 'Conta corrente', kind: 'checking', ownerId: me.id, initialBalance: 1000 }, meTok).data;
ok('conta criada; nome repetido é recusado', () => {
  assert.ok(acc.id);
  assert.equal(call('account.create', { name: 'conta corrente', kind: 'checking', ownerId: me.id }, meTok).error.code, 'DUPLICATE');
  assert.equal(call('account.create', { name: 'X', kind: 'invalido', ownerId: me.id }, meTok).error.code, 'VALIDATION');
});
const credit = call('card.create', { name: 'Crédito', kind: 'credit', ownerId: me.id, limit: 5000, closingDay: 5, dueDay: 12 }, meTok).data;
const food = call('card.create', { name: 'Alimentação', kind: 'food', ownerId: me.id, initialBalance: 0 }, meTok).data;

// ---- lançamentos
const base = { date: '2026-11-10', type: 'expense', amount: '45,90', description: 'Padaria', categoryId: cat('Restaurantes'), accountId: acc.id };
const t1 = call('tx.create', { ...base, clientId: 'abc-1' }, meTok).data;
ok('lançamento aceita valor em formato BR e guarda número', () => assert.equal(t1.amount, 45.9));
ok('mesmo clientId não duplica (idempotência)', () => {
  const r = call('tx.create', { ...base, clientId: 'abc-1' }, meTok).data;
  assert.equal(r.id, t1.id); assert.equal(r.duplicate, true);
  assert.equal(sheets.Transactions.rows.length, 2);
});
ok('lançamento igual é barrado; force=true permite', () => {
  const r = call('tx.create', { ...base, clientId: 'abc-2' }, meTok);
  assert.equal(r.error.code, 'DUPLICATE'); assert.equal(r.error.data.existingId, t1.id);
  assert.ok(call('tx.create', { ...base, clientId: 'abc-3', force: true }, meTok).ok);
});
ok('validações de lançamento', () => {
  assert.equal(call('tx.create', { ...base, amount: -5, description: 'a' }, meTok).error.code, 'VALIDATION');
  assert.equal(call('tx.create', { ...base, date: '10/11/2026', description: 'b' }, meTok).error.code, 'VALIDATION');
  assert.equal(call('tx.create', { ...base, accountId: '', description: 'c' }, meTok).error.code, 'VALIDATION');
  assert.equal(call('tx.create', { ...base, categoryId: cat('Salário'), description: 'd' }, meTok).error.code, 'VALIDATION', 'categoria de receita em despesa');
  assert.equal(call('tx.create', { ...base, type: 'card_payment', description: 'e' }, meTok).error.code, 'VALIDATION');
});
ok('fórmula digitada vira texto', () => {
  call('tx.create', { ...base, description: '=IMPORTXML("x")', amount: 1 }, meTok);
  const row = sheets.Transactions.rows.at(-1);
  assert.ok(row[5].startsWith(' ='));
});
// receita, cartão de alimentação, crédito, guardar
call('tx.create', { date: '2026-11-05', type: 'income', amount: 5000, description: 'Salário', categoryId: cat('Salário'), accountId: acc.id }, meTok);
call('tx.create', { date: '2026-11-06', type: 'income', amount: 800, description: 'Crédito benefício', cardId: food.id }, meTok);
call('tx.create', { date: '2026-11-07', type: 'expense', amount: 200, description: 'Mercado', categoryId: cat('Mercado'), cardId: food.id }, meTok);
call('tx.create', { date: '2026-11-08', type: 'expense', amount: 300, description: 'Roupa', categoryId: cat('Compras'), cardId: credit.id, ownerId: wife.id }, wifeTok);
const goal = call('goal.create', { name: 'Reserva', target: 10000, ownerId: me.id }, meTok).data;
call('tx.create', { date: '2026-11-09', type: 'saving', amount: 400, description: 'Aporte', accountId: acc.id, goalId: goal.id }, meTok);

ok('relatório mensal separa cartão alimentação e ignora guardado/pagamento nas despesas', () => {
  const r = call('report.monthly', { months: 2, end: '2026-11' }, meTok).data;
  const nov = r[1];
  assert.equal(r[0].month, '2026-10');
  assert.equal(nov.income, 5000);                                   // 800 do cartão alimentação fica de fora
  assert.equal(Math.round(nov.expense * 100) / 100, 45.9 * 2 + 1 + 300); // 2 padarias + 1 + roupa no crédito
  assert.equal(nov.foodCardSpent, 200);
  assert.equal(nov.saved, 400);
  assert.equal(nov.byOwner[wife.id].expense, 300);
  assert.equal(call('indicators.get', { month: '2026-11' }, meTok).data.result, nov.income - nov.expense);
});
ok('update, remove e listagem com filtros', () => {
  const u = call('tx.update', { id: t1.id, amount: 50, description: 'Padaria do bairro' }, meTok).data;
  assert.equal(u.amount, 50);
  assert.equal(call('tx.list', { q: 'bairro' }, meTok).data.length, 1);
  assert.equal(call('tx.list', { ownerId: wife.id }, meTok).data.length, 1);
  assert.ok(call('tx.remove', { id: t1.id }, meTok).ok);
  assert.equal(call('tx.list', { q: 'bairro' }, meTok).data.length, 0);
  assert.equal(call('tx.update', { id: 'nao-existe', amount: 1 }, meTok).error.code, 'NOT_FOUND');
});
ok('sync devolve só o alterado', () => {
  const t0 = new Date(Date.now() + 1000).toISOString();
  assert.equal(call('sync', { since: t0 }, meTok).data.transactions.length, 0);
  assert.ok(call('sync', { since: '2000-01-01' }, meTok).data.transactions.length > 3);
});
ok('conta fixa, anexos e pasta', () => {
  const bill = call('fixedBill.create', { name: 'Internet', amount: 120, dueDay: 10, categoryId: cat('Contas da casa'), accountId: acc.id, ownerId: me.id, startMonth: '2026-01' }, meTok);
  assert.ok(bill.ok, JSON.stringify(bill));
  const a = call('attachment.upload', { name: 'nota.jpg', mime: 'image/jpeg', data: Buffer.from('abc').toString('base64') }, meTok).data;
  assert.equal(a.transactionId, '');
  assert.equal(call('attachment.upload', { name: 'x.exe', mime: 'application/x-msdownload', data: 'AA==' }, meTok).error.code, 'VALIDATION');
});

// ---- configurações
ok('configurações validam soma 100% e apps monitorados', () => {
  assert.equal(call('settings.save', { values: { budgetSplit: { reserve: 30, bills: 50, others: 30 } } }, meTok).error.code, 'VALIDATION');
  const s = call('settings.save', { values: { budgetSplit: { reserve: 25, bills: 55, others: 20 }, monitoredApps: [{ name: 'Nubank', package: 'com.nu.production' }] } }, meTok).data;
  assert.equal(s.budgetSplit.bills, 55); assert.equal(s.monitoredApps[0].name, 'Nubank');
  assert.equal(call('settings.save', { values: { hack: 1 } }, meTok).error.code, 'VALIDATION');
});

// ---- notificações
const cats = boot.categories;
ok('parser de notificações', () => {
  const cases = [
    ['Compra aprovada no cartão final 1234 em PADARIA SAO JOSE no valor de R$ 45,90.', 'expense', 45.9, 'PADARIA SAO JOSE'],
    ['Você recebeu um Pix de MARIA SILVA no valor de R$ 1.250,00', 'income', 1250, 'MARIA SILVA'],
    ['Pix enviado: R$ 80,00 para JOAO PEREIRA. Saldo: R$ 500,00', 'expense', 80, 'JOAO PEREIRA'],
    ['Compra de R$ 32,50 em IFOOD', 'expense', 32.5, 'IFOOD'],
    ['Pagamento de fatura no valor de R$ 1.000,00 realizado', 'expense', 1000, ''],
  ];
  cases.forEach(([txt, type, amount, merchant]) => {
    const r = ctx.parseNotification_(txt, 'Nubank', cats);
    assert.equal(r.type, type, txt); assert.equal(r.amount, amount, txt);
    if (merchant) assert.equal(r.merchant, merchant, txt);
  });
  assert.equal(ctx.parseNotification_('Compra de R$ 32,50 em IFOOD', 'x', cats).categoryId, cat('Fast food e delivery'));
  assert.equal(ctx.parseNotification_('Compra em POSTO SHELL no valor de R$ 200,00', 'x', cats).categoryId, cat('Combustível'));
  assert.equal(ctx.parseNotification_('Seu pedido saiu para entrega', 'x', cats).amount, null);
  assert.equal(ctx.parseNotification_('olá', 'Itaú Mobile', cats).institution, 'Itaú');
});
ok('fila de notificações: add, duplicata, recusar, reconsiderar, confirmar', () => {
  const raw = 'Compra aprovada em IFOOD no valor de R$ 32,50';
  const n1 = call('inbox.add', { app: 'Nubank', rawText: raw, receivedAt: '2026-11-19T12:00:00.000Z' }, meTok).data;
  assert.equal(n1.status, 'pending'); assert.equal(n1.amount, 32.5);
  assert.equal(call('inbox.add', { app: 'Nubank', rawText: raw, receivedAt: '2026-11-19T12:03:00.000Z' }, meTok).data.duplicate, true);
  assert.equal(call('inbox.resolve', { id: n1.id, status: 'rejected' }, meTok).data.status, 'rejected');
  assert.equal(call('inbox.list', { status: 'rejected' }, meTok).data.length, 1);
  call('inbox.resolve', { id: n1.id, status: 'pending' }, meTok);
  const done = call('inbox.resolve', { id: n1.id, status: 'confirmed', transactionId: 'abc' }, meTok).data;
  assert.equal(done.transactionId, 'abc');
  assert.equal(call('inbox.add', { rawText: '' }, meTok).error.code, 'VALIDATION');
});

// ---- contracheque (texto sintético que imita a saída de OCR)
ok('parser de contracheque', () => {
  const sample = [
    'EMPRESA EXEMPLO LTDA', 'Recibo de Pagamento de Salário', 'Competência: 10/2026',
    '0001 SALARIO BASE 5.000,00', '0002 HORAS EXTRAS 50% 500,00', '0101 INSS 14,00 513,45 D', '0102 IRRF 7,5 120,30 D',
    '0201 VALE TRANSPORTE 6% 300,00 D', 'FGTS do mês 440,00',
    'Total de Vencimentos 5.500,00', 'Total de Descontos 933,75', 'Líquido a Receber 4.566,25'
  ].join('\n');
  const r = ctx.parsePayslipText_(sample);
  assert.equal(r.competence, '2026-10'); assert.equal(r.gross, 5500); assert.equal(r.discounts, 933.75); assert.equal(r.net, 4566.25);
  assert.equal(r.warnings.length, 0, r.warnings.join('|'));
  const labels = r.items.map((i) => i.label + ':' + i.kind);
  assert.ok(labels.some((l) => /INSS:discount/.test(l)) && labels.some((l) => /IRRF:discount/.test(l)));
  const odd = ctx.parsePayslipText_('Total de Vencimentos 3.000,00\nTotal de Descontos 500,00');
  assert.equal(odd.net, 2500); assert.ok(odd.warnings.length >= 1);
  const bad = ctx.parsePayslipText_('Total de Vencimentos 3.000,00 Total de Descontos 500,00 Líquido a Receber 2.000,00');
  assert.ok(bad.warnings.some((w) => /não fecham/.test(w)));
});
ok('payslip.parse sem serviço Drive avisa em vez de gravar', () => {
  const r = call('payslip.parse', { name: 'c.pdf', mime: 'application/pdf', data: Buffer.from('x').toString('base64') }, meTok);
  assert.equal(r.error.code, 'OCR_UNAVAILABLE');
  assert.equal(sheets.Attachments.rows.length, 1 + 1, 'nenhum anexo novo deve ficar salvo');
});
ok('usuário só altera o próprio nome', () => {
  assert.equal(call('user.update', { name: 'Fulano' }, meTok).data.name, 'Fulano');
  assert.equal(call('user.list', {}, meTok).data.find((u) => u.id === wife.id).name, 'Esposa');
  assert.ok(!('tokenHash' in call('user.list', {}, meTok).data[0]));
});
console.log(`\n${n} grupos de testes do backend passaram.`);
