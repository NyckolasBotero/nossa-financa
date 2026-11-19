/**
 * NOSSA FINANÇA — Code.gs (backend central / API)
 *
 * Web App do Apps Script. Implantar como:
 *   Executar como: Eu  |  Quem pode acessar: Qualquer pessoa
 * O acesso aos dados é protegido por TOKEN (um por pessoa), validado em toda chamada.
 * O front envia POST com Content-Type text/plain (evita preflight CORS) e corpo JSON:
 *   { "action": "tx.create", "token": "...", "payload": { ... } }
 * Resposta: { ok:true, data } ou { ok:false, error:{ code, message, data? } }
 *
 * Arquivos: Code.gs (API/CRUD)  Setup.gs (criação das abas)  Parsers.gs (notificações e contracheque)
 */

const APP = { name: 'Nossa Finança', version: '1.0.0', folderName: 'Nossa Finança - Comprovantes' };
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const UPLOAD_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const ALLOWED_SETTINGS = ['budgetSplit', 'monitoredApps', 'incomeBase'];

/** Esquema de cada aba (a primeira coluna é sempre o id). */
const SCHEMA = {
  Users: ['id', 'name', 'email', 'tokenHash', 'role', 'createdAt'],
  Accounts: ['id', 'name', 'kind', 'ownerId', 'institution', 'initialBalance', 'createdAt', 'updatedAt', 'archived'],
  Cards: ['id', 'name', 'kind', 'ownerId', 'limit', 'closingDay', 'dueDay', 'initialBalance', 'createdAt', 'updatedAt', 'archived'],
  Categories: ['id', 'name', 'type', 'icon', 'color', 'tag', 'bucket', 'keywords', 'createdAt', 'updatedAt', 'archived'],
  FixedBills: ['id', 'name', 'amount', 'dueDay', 'categoryId', 'accountId', 'cardId', 'ownerId', 'scope', 'startMonth', 'endMonth', 'createdAt', 'updatedAt', 'archived'],
  Goals: ['id', 'name', 'target', 'deadline', 'ownerId', 'scope', 'createdAt', 'updatedAt', 'archived'],
  Transactions: ['id', 'clientId', 'date', 'type', 'amount', 'description', 'merchant', 'categoryId', 'accountId', 'cardId', 'ownerId', 'scope', 'origin', 'fixedBillId', 'goalId', 'refMonth', 'notes', 'fingerprint', 'createdBy', 'createdAt', 'updatedAt', 'archived'],
  Settings: ['key', 'value', 'updatedAt'],
  NotificationInbox: ['id', 'receivedAt', 'app', 'rawText', 'amount', 'merchant', 'institution', 'type', 'ownerId', 'suggestedCategoryId', 'status', 'fingerprint', 'transactionId', 'resolvedAt'],
  Attachments: ['id', 'transactionId', 'fileId', 'name', 'url', 'mime', 'size', 'createdAt', 'createdBy'],
  AuditLog: ['ts', 'userId', 'action', 'entity', 'entityId', 'detail']
};
const NUM_COLS = ['amount', 'initialBalance', 'limit', 'closingDay', 'dueDay', 'target', 'size'];
const BOOL_COLS = ['archived'];
const DATE_COLS = ['date', 'startMonth', 'endMonth', 'deadline', 'refMonth'];
const PROTECTED = ['id', 'createdAt', 'updatedAt', 'createdBy', 'archived', 'fingerprint'];

const ENUMS = {
  accountKind: ['checking', 'savings', 'cash'],
  cardKind: ['credit', 'food'],
  catType: ['income', 'expense'],
  bucket: ['bills', 'others', ''],
  scope: ['individual', 'shared'],
  txType: ['income', 'expense', 'card_payment', 'saving'],
  origin: ['manual', 'notification', 'payslip', 'fixed', 'import']
};

/** Regras de validação: t = tipo, req = obrigatório. */
const RULES = {
  Accounts: {
    name: { t: 'str', req: 1, max: 60, l: 'Nome' }, kind: { t: 'enum', v: ENUMS.accountKind, req: 1, l: 'Tipo' },
    ownerId: { t: 'str', req: 1, l: 'Responsável' }, institution: { t: 'str', max: 60 }, initialBalance: { t: 'num', l: 'Saldo inicial' }
  },
  Cards: {
    name: { t: 'str', req: 1, max: 60, l: 'Nome' }, kind: { t: 'enum', v: ENUMS.cardKind, req: 1, l: 'Tipo' },
    ownerId: { t: 'str', req: 1, l: 'Responsável' }, limit: { t: 'num', min: 0, l: 'Limite' },
    closingDay: { t: 'int', min: 1, max: 31, l: 'Dia de fechamento' }, dueDay: { t: 'int', min: 1, max: 31, l: 'Dia de vencimento' },
    initialBalance: { t: 'num', l: 'Saldo inicial' }
  },
  Categories: {
    name: { t: 'str', req: 1, max: 40, l: 'Nome' }, type: { t: 'enum', v: ENUMS.catType, req: 1, l: 'Tipo' },
    icon: { t: 'str', max: 8 }, color: { t: 'str', max: 9 }, tag: { t: 'str', max: 20 },
    bucket: { t: 'enum', v: ENUMS.bucket }, keywords: { t: 'str', max: 400 }
  },
  FixedBills: {
    name: { t: 'str', req: 1, max: 60, l: 'Nome' }, amount: { t: 'num', req: 1, min: 0.01, l: 'Valor' },
    dueDay: { t: 'int', req: 1, min: 1, max: 31, l: 'Dia de vencimento' }, categoryId: { t: 'str' }, accountId: { t: 'str' },
    cardId: { t: 'str' }, ownerId: { t: 'str', req: 1, l: 'Responsável' }, scope: { t: 'enum', v: ENUMS.scope },
    startMonth: { t: 'month', l: 'Mês inicial' }, endMonth: { t: 'month', l: 'Mês final' }
  },
  Goals: {
    name: { t: 'str', req: 1, max: 60, l: 'Nome' }, target: { t: 'num', req: 1, min: 0.01, l: 'Valor da meta' },
    deadline: { t: 'date', l: 'Prazo' }, ownerId: { t: 'str', req: 1, l: 'Responsável' }, scope: { t: 'enum', v: ENUMS.scope }
  },
  Transactions: {
    clientId: { t: 'str', max: 60 }, date: { t: 'date', req: 1, l: 'Data' }, type: { t: 'enum', v: ENUMS.txType, req: 1, l: 'Tipo' },
    amount: { t: 'num', req: 1, min: 0.01, l: 'Valor' }, description: { t: 'str', max: 120 }, merchant: { t: 'str', max: 80 },
    categoryId: { t: 'str' }, accountId: { t: 'str' }, cardId: { t: 'str' }, ownerId: { t: 'str', req: 1, l: 'Responsável' },
    scope: { t: 'enum', v: ENUMS.scope }, origin: { t: 'enum', v: ENUMS.origin }, fixedBillId: { t: 'str' }, goalId: { t: 'str' },
    refMonth: { t: 'month' }, notes: { t: 'str', max: 500 }
  }
};

const ENT = { account: 'Accounts', card: 'Cards', category: 'Categories', fixedBill: 'FixedBills', goal: 'Goals' };

/** Tabela de ações: nome -> [função, escreve?]. */
const ACTIONS = {
  'auth.me': [function (p, u) { return publicUser_(u); }, false],
  'bootstrap': [bootstrap_, false],
  'sync': [sync_, false],
  'tx.list': [txList_, false],
  'tx.create': [txCreate_, true],
  'tx.update': [txUpdate_, true],
  'tx.remove': [txRemove_, true],
  'user.list': [function () { return readAll_('Users').map(publicUser_); }, false],
  'user.update': [userUpdate_, true],
  'settings.get': [function () { return settings_(); }, false],
  'settings.save': [settingsSave_, true],
  'inbox.add': [inboxAdd_, true],
  'inbox.list': [inboxList_, false],
  'inbox.resolve': [inboxResolve_, true],
  'attachment.upload': [attachmentUpload_, true],
  'attachment.list': [attachmentList_, false],
  'attachment.remove': [attachmentRemove_, true],
  'payslip.parse': [payslipParse_, true],
  'report.monthly': [reportMonthly_, false],
  'indicators.get': [indicatorsGet_, false]
};
Object.keys(ENT).forEach(function (k) {
  const sheet = ENT[k];
  ACTIONS[k + '.list'] = [function (p) { return list_(sheet, p); }, false];
  ACTIONS[k + '.create'] = [function (p, u) { return create_(sheet, p, u); }, true];
  ACTIONS[k + '.update'] = [function (p, u) { return update_(sheet, p, u); }, true];
  ACTIONS[k + '.remove'] = [function (p, u) { return remove_(sheet, p, u); }, true];
});

// ---------------------------------------------------------------- entrada HTTP

function doGet() {
  return json_({ ok: true, data: { app: APP.name, version: APP.version } });
}

function doPost(e) {
  let out;
  try {
    const req = parseBody_(e);
    const entry = ACTIONS[String(req.action || '')];
    if (!entry) throw fail_('UNKNOWN_ACTION', 'Ação desconhecida.');
    const user = auth_(req.token);
    const payload = req.payload && typeof req.payload === 'object' ? req.payload : {};
    const data = entry[1] ? withLock_(function () { return entry[0](payload, user); }) : entry[0](payload, user);
    out = { ok: true, data: data };
  } catch (err) {
    out = { ok: false, error: { code: err.code || 'SERVER_ERROR', message: err.code ? err.message : 'Erro interno. Tente novamente.', data: err.data } };
    if (!err.code) console.error(err && err.stack ? err.stack : err);
  }
  return json_(out);
}

function parseBody_(e) {
  try { return JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { throw fail_('BAD_REQUEST', 'Requisição inválida.'); }
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function fail_(code, message, data) {
  const e = new Error(message); e.code = code; e.data = data; return e;
}

// ---------------------------------------------------------------- autenticação

function auth_(token) {
  if (!token || typeof token !== 'string') throw fail_('UNAUTHORIZED', 'Informe o token de acesso.');
  const h = hash_(token);
  const u = readAll_('Users').filter(function (x) { return x.tokenHash === h; })[0];
  if (!u) throw fail_('UNAUTHORIZED', 'Token inválido.');
  return u;
}
function publicUser_(u) { return { id: u.id, name: u.name, email: u.email, role: u.role }; }
function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function newToken_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }
function uid_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 20); }
function iso_() { return new Date().toISOString(); }
function today_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }

// ---------------------------------------------------------------- camada de planilha

function db_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function sheet_(name) {
  const sh = db_().getSheetByName(name);
  if (!sh) throw fail_('NOT_SETUP', 'Planilha não preparada. Rode setup() no Apps Script.');
  return sh;
}
function readAll_(name) {
  const sh = sheet_(name), n = sh.getLastRow();
  if (n < 2) return [];
  const cols = SCHEMA[name];
  return sh.getRange(2, 1, n - 1, cols.length).getValues().map(function (r) { return fromRow_(cols, r); });
}
function fromRow_(cols, r) {
  const o = {};
  cols.forEach(function (c, i) {
    let v = r[i];
    if (v instanceof Date) v = DATE_COLS.indexOf(c) >= 0 ? Utilities.formatDate(v, Session.getScriptTimeZone(), c === 'startMonth' || c === 'endMonth' || c === 'refMonth' ? 'yyyy-MM' : 'yyyy-MM-dd') : v.toISOString();
    if (NUM_COLS.indexOf(c) >= 0) v = (v === '' || v === null) ? null : Number(v);
    else if (c === 'archived') v = (v === true || v === 'TRUE' || v === 1);
    o[c] = v;
  });
  return o;
}
function toRow_(cols, o) {
  return cols.map(function (c) {
    const v = o[c];
    if (v === undefined || v === null) return '';
    return typeof v === 'string' ? safeStr_(v) : v;
  });
}
function safeStr_(s) { return /^[=+@]/.test(s) ? ' ' + s : s; }  // bloqueia injeção de fórmula
function insert_(name, o) { sheet_(name).appendRow(toRow_(SCHEMA[name], o)); }
function writeRow_(name, row, o) {
  const cols = SCHEMA[name];
  sheet_(name).getRange(row, 1, 1, cols.length).setValues([toRow_(cols, o)]);
}
function findRow_(name, id) {
  const sh = sheet_(name), n = sh.getLastRow();
  if (n < 2 || !id) return 0;
  const ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}
function getById_(name, id) {
  const row = findRow_(name, id);
  if (!row) return null;
  const cols = SCHEMA[name];
  return fromRow_(cols, sheet_(name).getRange(row, 1, 1, cols.length).getValues()[0]);
}
function audit_(user, action, entity, entityId, detail) {
  insert_('AuditLog', { ts: iso_(), userId: user.id, action: action, entity: entity, entityId: entityId, detail: detail || '' });
}

// ---------------------------------------------------------------- validação

function pick_(name, input) {
  const o = {};
  SCHEMA[name].forEach(function (c) {
    if (PROTECTED.indexOf(c) >= 0) return;
    if (input && Object.prototype.hasOwnProperty.call(input, c)) o[c] = input[c];
  });
  return o;
}

function validate_(name, o, partial) {
  const rules = RULES[name];
  Object.keys(rules).forEach(function (f) {
    const r = rules[f], label = r.l || f;
    if (!(f in o)) { if (r.req && !partial) throw fail_('VALIDATION', label + ' é obrigatório.'); return; }
    let v = o[f];
    if (v === null || v === undefined || v === '') {
      if (r.req) throw fail_('VALIDATION', label + ' é obrigatório.');
      o[f] = ''; return;
    }
    if (r.t === 'str') {
      v = String(v).trim();
      if (r.max && v.length > r.max) throw fail_('VALIDATION', label + ' passou de ' + r.max + ' caracteres.');
    } else if (r.t === 'num' || r.t === 'int') {
      v = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      if (!isFinite(v)) throw fail_('VALIDATION', label + ' precisa ser um número.');
      if (r.t === 'int' && Math.floor(v) !== v) throw fail_('VALIDATION', label + ' precisa ser inteiro.');
      if (r.min !== undefined && v < r.min) throw fail_('VALIDATION', label + ' deve ser no mínimo ' + r.min + '.');
      if (r.max !== undefined && v > r.max) throw fail_('VALIDATION', label + ' deve ser no máximo ' + r.max + '.');
      if (r.t === 'num') v = Math.round(v * 100) / 100;
    } else if (r.t === 'enum') {
      if (r.v.indexOf(v) < 0) throw fail_('VALIDATION', label + ' inválido.');
    } else if (r.t === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) throw fail_('VALIDATION', label + ' inválida (use AAAA-MM-DD).');
    } else if (r.t === 'month') {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) throw fail_('VALIDATION', label + ' inválido (use AAAA-MM).');
    }
    o[f] = v;
  });
}

function activeOrFail_(sheet, id, label) {
  const o = getById_(sheet, id);
  if (!o || o.archived) throw fail_('VALIDATION', label + ' não encontrado(a).');
  return o;
}
function ownerOrFail_(id, allowFamily) {
  if (allowFamily && id === 'family') return;
  if (!getById_('Users', id)) throw fail_('VALIDATION', 'Responsável não encontrado.');
}

function crossCheck_(name, o) {
  if (name === 'Accounts' || name === 'Cards') ownerOrFail_(o.ownerId, true);
  if (name === 'FixedBills' || name === 'Goals') ownerOrFail_(o.ownerId, false);
  if (name === 'FixedBills') {
    if (o.categoryId) activeOrFail_('Categories', o.categoryId, 'Categoria');
    if (o.accountId) activeOrFail_('Accounts', o.accountId, 'Conta');
    if (o.cardId) activeOrFail_('Cards', o.cardId, 'Cartão');
  }
}

function dupName_(name, o) {
  if (['Accounts', 'Cards', 'Categories', 'Goals', 'FixedBills'].indexOf(name) < 0) return;
  const n = String(o.name).trim().toLowerCase();
  const clash = readAll_(name).some(function (x) {
    return !x.archived && x.id !== o.id && String(x.name).trim().toLowerCase() === n &&
      (name !== 'Categories' || x.type === o.type) && (name === 'Categories' || name === 'Goals' || name === 'FixedBills' || x.ownerId === o.ownerId);
  });
  if (clash) throw fail_('DUPLICATE', 'Já existe um registro com esse nome.');
}

// ---------------------------------------------------------------- CRUD genérico

function list_(name, p) {
  const all = !!(p && p.includeArchived);
  return readAll_(name).filter(function (x) { return all || !x.archived; });
}
function create_(name, input, user) {
  const o = pick_(name, input);
  if (name === 'Categories' && o.bucket === undefined) o.bucket = '';
  validate_(name, o, false);
  crossCheck_(name, o); dupName_(name, o);
  const now = iso_();
  o.id = uid_(); o.createdAt = now; o.updatedAt = now; o.archived = false;
  insert_(name, o); audit_(user, 'create', name, o.id);
  return o;
}
function update_(name, input, user) {
  const row = findRow_(name, input && input.id);
  if (!row) throw fail_('NOT_FOUND', 'Registro não encontrado.');
  const cur = getById_(name, input.id);
  const patch = pick_(name, input);
  validate_(name, patch, true);
  const next = Object.assign({}, cur, patch);
  crossCheck_(name, next); dupName_(name, next);
  next.updatedAt = iso_();
  writeRow_(name, row, next); audit_(user, 'update', name, next.id);
  return next;
}
function remove_(name, input, user) {
  const row = findRow_(name, input && input.id);
  if (!row) throw fail_('NOT_FOUND', 'Registro não encontrado.');
  const cur = getById_(name, input.id);
  cur.archived = true; cur.updatedAt = iso_();
  writeRow_(name, row, cur); audit_(user, 'archive', name, cur.id);
  return cur;
}

// ---------------------------------------------------------------- bootstrap e sync

/** Por padrão devolve TODOS os lançamentos: saldos e metas são calculados a partir do histórico completo. */
function bootstrap_(p, user) {
  const since = /^\d{4}-\d{2}-\d{2}$/.test(p.since || '') ? p.since : '';
  return {
    serverTime: iso_(), me: publicUser_(user), since: since,
    users: readAll_('Users').map(publicUser_),
    accounts: readAll_('Accounts'), cards: readAll_('Cards'), categories: readAll_('Categories'),
    fixedBills: readAll_('FixedBills'), goals: readAll_('Goals'), settings: settings_(),
    transactions: readAll_('Transactions').filter(function (t) { return !t.archived && (!since || t.date >= since); }),
    inboxCounts: inboxCounts_()
  };
}
/** Sincronização incremental: devolve só o que mudou depois de `since` (ISO). */
function sync_(p) {
  const since = String(p.since || '');
  const changed = function (n) { return readAll_(n).filter(function (x) { return String(x.updatedAt) > since; }); };
  return {
    serverTime: iso_(), accounts: changed('Accounts'), cards: changed('Cards'), categories: changed('Categories'),
    fixedBills: changed('FixedBills'), goals: changed('Goals'), transactions: changed('Transactions'),
    users: readAll_('Users').map(publicUser_), settings: settings_(), inboxCounts: inboxCounts_()
  };
}

// ---------------------------------------------------------------- lançamentos

function fingerprint_(t) {
  const base = [t.date, t.type, Number(t.amount).toFixed(2), normalize_(t.description || t.merchant || ''), t.accountId || '', t.cardId || '', t.ownerId].join('|');
  return hash_(base).slice(0, 24);
}

function normalizeTx_(o, user) {
  if (o.amount !== undefined && o.amount !== '') o.amount = Math.round(Number(String(o.amount).replace(',', '.')) * 100) / 100;
  if (!o.ownerId) o.ownerId = user.id;
  if (!o.scope) o.scope = 'individual';
  if (!o.origin) o.origin = 'manual';
}

function crossTx_(o) {
  ownerOrFail_(o.ownerId, false);
  const a = o.accountId ? activeOrFail_('Accounts', o.accountId, 'Conta') : null;
  const c = o.cardId ? activeOrFail_('Cards', o.cardId, 'Cartão') : null;
  if (o.categoryId) {
    const cat = activeOrFail_('Categories', o.categoryId, 'Categoria');
    if ((o.type === 'income' || o.type === 'expense') && cat.type !== o.type) throw fail_('VALIDATION', 'A categoria não combina com o tipo do lançamento.');
  }
  if (o.fixedBillId) activeOrFail_('FixedBills', o.fixedBillId, 'Conta fixa');
  if (o.goalId) activeOrFail_('Goals', o.goalId, 'Meta');
  if (o.type === 'income' || o.type === 'expense') {
    if (!a && !c) throw fail_('VALIDATION', 'Escolha a conta ou o cartão.');
    if (a && c) throw fail_('VALIDATION', 'Escolha só a conta ou só o cartão.');
    if (o.type === 'income' && c && c.kind === 'credit') throw fail_('VALIDATION', 'Receita não entra em cartão de crédito.');
  }
  if (o.type === 'card_payment') {
    if (!a || !c || c.kind !== 'credit') throw fail_('VALIDATION', 'Pagamento de fatura precisa de conta e cartão de crédito.');
    if (!o.refMonth) throw fail_('VALIDATION', 'Informe o mês da fatura.');
  }
  if (o.type === 'saving') {
    if (!a) throw fail_('VALIDATION', 'Informe a conta de origem do valor guardado.');
    if (!o.goalId) throw fail_('VALIDATION', 'Escolha a meta.');
  }
}

function linkAttachments_(ids, txId) {
  (ids || []).forEach(function (id) {
    const row = findRow_('Attachments', id);
    if (!row) return;
    const att = getById_('Attachments', id);
    att.transactionId = txId; writeRow_('Attachments', row, att);
  });
}

function txCreate_(p, user) {
  const o = pick_('Transactions', p);
  normalizeTx_(o, user);
  validate_('Transactions', o, false);
  crossTx_(o);
  const all = readAll_('Transactions');
  if (o.clientId) {  // idempotência: repetir o mesmo envio não duplica
    const same = all.filter(function (t) { return t.clientId === o.clientId; })[0];
    if (same) return Object.assign({}, same, { duplicate: true });
  }
  o.fingerprint = fingerprint_(o);
  if (!p.force) {
    const dup = all.filter(function (t) { return !t.archived && t.fingerprint === o.fingerprint; })[0];
    if (dup) throw fail_('DUPLICATE', 'Já existe um lançamento igual nesse dia.', { existingId: dup.id });
  }
  const now = iso_();
  o.id = uid_(); o.createdBy = user.id; o.createdAt = now; o.updatedAt = now; o.archived = false;
  insert_('Transactions', o);
  linkAttachments_(p.attachmentIds, o.id);
  audit_(user, 'create', 'Transactions', o.id, o.type + ' ' + o.amount);
  return o;
}

function txUpdate_(p, user) {
  const row = findRow_('Transactions', p.id);
  if (!row) throw fail_('NOT_FOUND', 'Lançamento não encontrado.');
  const cur = getById_('Transactions', p.id);
  const patch = pick_('Transactions', p);
  delete patch.clientId;
  validate_('Transactions', patch, true);
  const next = Object.assign({}, cur, patch);
  normalizeTx_(next, user);
  crossTx_(next);
  next.fingerprint = fingerprint_(next);
  if (!p.force) {
    const dup = readAll_('Transactions').filter(function (t) { return !t.archived && t.id !== next.id && t.fingerprint === next.fingerprint; })[0];
    if (dup) throw fail_('DUPLICATE', 'Já existe um lançamento igual nesse dia.', { existingId: dup.id });
  }
  next.updatedAt = iso_();
  writeRow_('Transactions', row, next);
  linkAttachments_(p.attachmentIds, next.id);
  audit_(user, 'update', 'Transactions', next.id);
  return next;
}

function txRemove_(p, user) {
  const row = findRow_('Transactions', p.id);
  if (!row) throw fail_('NOT_FOUND', 'Lançamento não encontrado.');
  const cur = getById_('Transactions', p.id);
  cur.archived = true; cur.updatedAt = iso_();
  writeRow_('Transactions', row, cur);
  audit_(user, 'archive', 'Transactions', cur.id);
  return cur;
}

function txList_(p) {
  const q = normalize_(p.q || '');
  const min = p.minAmount !== undefined && p.minAmount !== '' ? Number(p.minAmount) : null;
  const max = p.maxAmount !== undefined && p.maxAmount !== '' ? Number(p.maxAmount) : null;
  const rows = readAll_('Transactions').filter(function (t) {
    if (t.archived && !p.includeArchived) return false;
    if (p.from && t.date < p.from) return false;
    if (p.to && t.date > p.to) return false;
    if (p.before && t.date >= p.before) return false;
    for (const f of ['type', 'categoryId', 'accountId', 'cardId', 'ownerId', 'scope', 'origin']) if (p[f] && t[f] !== p[f]) return false;
    if (min !== null && t.amount < min) return false;
    if (max !== null && t.amount > max) return false;
    if (q && normalize_([t.description, t.merchant, t.notes].join(' ')).indexOf(q) < 0) return false;
    return true;
  });
  rows.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1); });
  return rows.slice(0, Math.min(Number(p.limit) || 500, 2000));
}

// ---------------------------------------------------------------- usuários e configurações

function userUpdate_(p, user) {
  const name = String(p.name || '').trim();
  if (!name || name.length > 40) throw fail_('VALIDATION', 'Nome deve ter de 1 a 40 caracteres.');
  const row = findRow_('Users', user.id);
  const cur = getById_('Users', user.id);
  cur.name = name; writeRow_('Users', row, cur);
  audit_(user, 'update', 'Users', user.id);
  return publicUser_(cur);
}

function settings_() {
  const out = {};
  readAll_('Settings').forEach(function (r) { try { out[r.key] = JSON.parse(r.value); } catch (e) { /* ignora valor corrompido */ } });
  return out;
}
function settingsSave_(p, user) {
  const values = p.values || {};
  Object.keys(values).forEach(function (k) {
    if (ALLOWED_SETTINGS.indexOf(k) < 0) throw fail_('VALIDATION', 'Configuração desconhecida: ' + k);
    const v = values[k];
    if (k === 'budgetSplit') {
      const keys = ['reserve', 'bills', 'others'];
      const nums = keys.map(function (x) { return Number(v && v[x]); });
      if (nums.some(function (n) { return !isFinite(n) || n < 0 || n > 100; })) throw fail_('VALIDATION', 'Percentuais devem estar entre 0 e 100.');
      if (Math.abs(nums[0] + nums[1] + nums[2] - 100) > 0.01) throw fail_('VALIDATION', 'Os percentuais precisam somar 100%.');
    }
    if (k === 'incomeBase' && ['received', 'expected'].indexOf(v) < 0) throw fail_('VALIDATION', 'Base de renda inválida.');
    if (k === 'monitoredApps') {
      if (!Array.isArray(v) || v.length > 50) throw fail_('VALIDATION', 'Lista de apps inválida.');
      values[k] = v.map(function (a) { return { name: String(a.name || '').slice(0, 40), package: String(a.package || '').slice(0, 120) }; })
        .filter(function (a) { return a.name; });
    }
    const row = findRow_('Settings', k);
    const rec = { key: k, value: JSON.stringify(values[k]), updatedAt: iso_() };
    if (row) writeRow_('Settings', row, rec); else insert_('Settings', rec);
  });
  audit_(user, 'save', 'Settings', Object.keys(values).join(','));
  return settings_();
}

// ---------------------------------------------------------------- fila de notificações

function inboxCounts_() {
  const c = { pending: 0, rejected: 0 };
  readAll_('NotificationInbox').forEach(function (n) { if (c[n.status] !== undefined) c[n.status]++; });
  return c;
}

/** Recebe o texto bruto de uma notificação (do app auxiliar ou colado no app), identifica e enfileira. */
function inboxAdd_(p, user) {
  const raw = String(p.rawText || '').trim();
  if (!raw || raw.length > 1000) throw fail_('VALIDATION', 'Texto da notificação vazio ou grande demais.');
  const app = String(p.app || '').slice(0, 60);
  const receivedAt = /^\d{4}-\d{2}-\d{2}T/.test(p.receivedAt || '') ? p.receivedAt : iso_();
  const bucket = Math.floor(new Date(receivedAt).getTime() / (10 * 60 * 1000));  // janela de 10 min
  const fp = hash_([app, normalize_(raw), bucket, user.id].join('|')).slice(0, 24);
  const existing = readAll_('NotificationInbox').filter(function (n) { return n.fingerprint === fp; })[0];
  if (existing) return Object.assign({}, existing, { duplicate: true });
  const parsed = parseNotification_(raw, app, readAll_('Categories').filter(function (c) { return !c.archived; }));
  const ownerId = p.ownerId && getById_('Users', p.ownerId) ? p.ownerId : user.id;
  const rec = {
    id: uid_(), receivedAt: receivedAt, app: app, rawText: raw, amount: parsed.amount, merchant: parsed.merchant,
    institution: parsed.institution, type: parsed.type, ownerId: ownerId, suggestedCategoryId: parsed.categoryId,
    status: 'pending', fingerprint: fp, transactionId: '', resolvedAt: ''
  };
  insert_('NotificationInbox', rec);
  audit_(user, 'create', 'NotificationInbox', rec.id);
  return rec;
}

function inboxList_(p) {
  const rows = readAll_('NotificationInbox').filter(function (n) { return !p.status || n.status === p.status; });
  rows.sort(function (a, b) { return a.receivedAt < b.receivedAt ? 1 : -1; });
  return rows.slice(0, Math.min(Number(p.limit) || 200, 500));
}

function inboxResolve_(p, user) {
  const row = findRow_('NotificationInbox', p.id);
  if (!row) throw fail_('NOT_FOUND', 'Notificação não encontrada.');
  if (['confirmed', 'rejected', 'pending'].indexOf(p.status) < 0) throw fail_('VALIDATION', 'Status inválido.');
  const cur = getById_('NotificationInbox', p.id);
  cur.status = p.status;
  cur.transactionId = p.status === 'confirmed' ? String(p.transactionId || '') : '';
  cur.resolvedAt = p.status === 'pending' ? '' : iso_();
  writeRow_('NotificationInbox', row, cur);
  audit_(user, p.status, 'NotificationInbox', cur.id);
  return cur;
}

// ---------------------------------------------------------------- anexos (Drive)

function folder_() {
  const it = DriveApp.getFoldersByName(APP.folderName);
  return it.hasNext() ? it.next() : DriveApp.createFolder(APP.folderName);
}

function saveAttachment_(p, user, blobBytes) {
  const mime = String(p.mime || '');
  if (UPLOAD_MIMES.indexOf(mime) < 0) throw fail_('VALIDATION', 'Envie JPG, PNG, WEBP ou PDF.');
  if (!blobBytes.length || blobBytes.length > MAX_UPLOAD_BYTES) throw fail_('VALIDATION', 'Arquivo vazio ou maior que 8 MB.');
  const name = String(p.name || 'comprovante').replace(/[^\w.\- ]+/g, '_').slice(0, 80);
  const file = folder_().createFile(Utilities.newBlob(blobBytes, mime, name));
  const rec = {
    id: uid_(), transactionId: String(p.transactionId || ''), fileId: file.getId(), name: name, url: file.getUrl(),
    mime: mime, size: blobBytes.length, createdAt: iso_(), createdBy: user.id
  };
  insert_('Attachments', rec);
  audit_(user, 'create', 'Attachments', rec.id);
  return rec;
}
function attachmentUpload_(p, user) {
  if (p.transactionId) activeOrFail_('Transactions', p.transactionId, 'Lançamento');
  return saveAttachment_(p, user, Utilities.base64Decode(String(p.data || '')));
}
function attachmentList_(p) {
  return readAll_('Attachments').filter(function (a) { return a.transactionId === p.transactionId; });
}
function attachmentRemove_(p, user) {
  const row = findRow_('Attachments', p.id);
  if (!row) throw fail_('NOT_FOUND', 'Anexo não encontrado.');
  const a = getById_('Attachments', p.id);
  try { DriveApp.getFileById(a.fileId).setTrashed(true); } catch (e) { /* arquivo já removido */ }
  sheet_('Attachments').deleteRow(row);
  audit_(user, 'delete', 'Attachments', a.id);
  return { id: a.id };
}

// ---------------------------------------------------------------- contracheque

function payslipParse_(p, user) {
  const bytes = Utilities.base64Decode(String(p.data || ''));
  if (bytes.length > MAX_UPLOAD_BYTES) throw fail_('VALIDATION', 'Arquivo maior que 8 MB.');
  const text = ocrToText_(Utilities.newBlob(bytes, String(p.mime || ''), 'contracheque'));  // falha antes de salvar se o OCR não estiver ativo
  const attachment = saveAttachment_({ name: p.name || 'contracheque', mime: p.mime }, user, bytes);
  return { attachment: attachment, result: parsePayslipText_(text), textPreview: text.slice(0, 1500) };
}

// ---------------------------------------------------------------- relatórios e indicadores

function foodCardIds_() {
  const ids = {};
  readAll_('Cards').forEach(function (c) { if (c.kind === 'food') ids[c.id] = true; });
  return ids;
}

/** Agrega por mês. Receita/despesa NÃO incluem o cartão alimentação (contabilizado à parte). */
function reportMonthly_(p) {
  const n = Math.min(Math.max(parseInt(p.months, 10) || 6, 1), 24);
  const endMonth = /^\d{4}-\d{2}$/.test(p.end || '') ? p.end : today_().slice(0, 7);
  const months = [];
  let y = Number(endMonth.slice(0, 4)), m = Number(endMonth.slice(5, 7));
  for (let i = 0; i < n; i++) { months.unshift(y + '-' + ('0' + m).slice(-2)); m--; if (m === 0) { m = 12; y--; } }
  const rows = {};
  months.forEach(function (k) { rows[k] = { month: k, income: 0, expense: 0, saved: 0, foodCardSpent: 0, byCategory: {}, byOwner: {} }; });
  const food = foodCardIds_();
  readAll_('Transactions').forEach(function (t) {
    const r = rows[t.date.slice(0, 7)];
    if (!r || t.archived) return;
    const isFood = !!food[t.cardId];
    const own = r.byOwner[t.ownerId] = r.byOwner[t.ownerId] || { income: 0, expense: 0 };
    if (t.type === 'saving') { r.saved += t.amount; return; }
    if (t.type === 'card_payment') return;
    if (t.type === 'expense') {
      r.byCategory[t.categoryId || 'none'] = (r.byCategory[t.categoryId || 'none'] || 0) + t.amount;
      if (isFood) { r.foodCardSpent += t.amount; return; }
      r.expense += t.amount; own.expense += t.amount;
    } else if (t.type === 'income' && !isFood) { r.income += t.amount; own.income += t.amount; }
  });
  return months.map(function (k) { return rows[k]; });
}
function indicatorsGet_(p) {
  const month = /^\d{4}-\d{2}$/.test(p.month || '') ? p.month : today_().slice(0, 7);
  const row = reportMonthly_({ months: 1, end: month })[0];
  row.result = Math.round((row.income - row.expense) * 100) / 100;
  return row;
}
