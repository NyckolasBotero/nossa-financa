/**
 * NOSSA FINANÇA — Code.gs (backend central / API)
 *
 * Web App do Apps Script. Implantar como:
 *   Executar como: Eu  |  Quem pode acessar: Qualquer pessoa
 * Acesso: login (usuário + senha) cadastrado na aba "Acessos". A senha nunca é guardada: só hash com sal.
 * O login devolve um token de sessão; ele é validado em toda chamada. Usuários são geridos pelo menu "Finanças" da planilha.
 * O front envia POST com Content-Type text/plain (evita preflight CORS) e corpo JSON:
 *   { "action": "tx.create", "token": "...", "payload": { ... } }
 * Resposta: { ok:true, data } ou { ok:false, error:{ code, message, data? } }
 *
 * Arquivo único: API/CRUD, acessos, parsers (notificações/contracheque) e setup.
 */

const APP = { name: 'Nossa Finança', version: '1.0.0', folderName: 'Nossa Finança - Comprovantes' };
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const UPLOAD_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const ALLOWED_SETTINGS = ['budgetSplit', 'monitoredApps', 'incomeBase', 'paymentMethods'];

/** Esquema de cada aba (a primeira coluna é sempre o id). */
const SCHEMA = {
  Acessos: ['id', 'usuario', 'nome', 'email', 'perfil', 'status', 'senhaHash', 'sal', 'criadoEm', 'ultimoAcesso'],
  Sessoes: ['id', 'userId', 'criadaEm', 'expiraEm', 'aparelho'],
  Accounts: ['id', 'name', 'kind', 'ownerId', 'institution', 'initialBalance', 'createdAt', 'updatedAt', 'archived'],
  Cards: ['id', 'name', 'kind', 'ownerId', 'limit', 'closingDay', 'dueDay', 'initialBalance', 'createdAt', 'updatedAt', 'archived'],
  Categories: ['id', 'name', 'type', 'icon', 'color', 'tag', 'bucket', 'keywords', 'createdAt', 'updatedAt', 'archived'],
  FixedBills: ['id', 'name', 'amount', 'dueDay', 'categoryId', 'accountId', 'cardId', 'ownerId', 'scope', 'startMonth', 'endMonth', 'createdAt', 'updatedAt', 'archived', 'kind', 'method'],
  Goals: ['id', 'name', 'target', 'deadline', 'ownerId', 'scope', 'createdAt', 'updatedAt', 'archived'],
  Transactions: ['id', 'clientId', 'date', 'type', 'amount', 'description', 'merchant', 'categoryId', 'accountId', 'cardId', 'ownerId', 'scope', 'origin', 'fixedBillId', 'goalId', 'refMonth', 'notes', 'fingerprint', 'createdBy', 'createdAt', 'updatedAt', 'archived', 'method'],
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
  origin: ['manual', 'notification', 'payslip', 'fixed', 'import'],
  billKind: ['expense', 'income']
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
    startMonth: { t: 'month', l: 'Mês inicial' }, endMonth: { t: 'month', l: 'Mês final' }, kind: { t: 'enum', v: ENUMS.billKind, l: 'Tipo' }, method: { t: 'str', max: 30 }
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
    refMonth: { t: 'month' }, notes: { t: 'str', max: 500 }, method: { t: 'str', max: 30, l: 'Forma de pagamento' }
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
  'user.list': [function () { return activeUsers_(); }, false],
  'user.admin.list': [function (p, u) { adminOnly_(u); return umList(); }, false],
  'user.admin.set': [function (p, u) { adminOnly_(u); return umSet(p); }, false],   // umSet já usa a trava
  'auth.logout': [logout_, false],
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
    const entry = ANON_ACTIONS[req.action] ? [] : ACTIONS[String(req.action || '')];
    if (!entry) throw fail_('UNKNOWN_ACTION', 'Ação desconhecida.');
    const payload = req.payload && typeof req.payload === 'object' ? req.payload : {};
    if (ANON_ACTIONS[req.action]) return json_({ ok: true, data: ANON_ACTIONS[req.action](payload) });
    const user = auth_(req.token);
    payload.__token = req.token;
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

/** Ações que não exigem sessão (login, cadastro e recuperação de senha). */
const ANON_ACTIONS = {
  'auth.login': function (p) { return login_(p); },
  'auth.register': function (p) { return register_(p); },
  'auth.verify': function (p) { return verify_(p); },
  'auth.forgot': function (p) { return forgot_(p); },
  'auth.reset': function (p) { return reset_(p); }
};
const SESSION_DAYS = 30;
const CODE_TTL = 600;               // código por e-mail vale 10 min
const PW_ROUNDS = 3000;
const MAX_FAILS = 8;           // tentativas erradas por usuário a cada 15 min

function auth_(token) {
  if (!token || typeof token !== 'string') throw fail_('UNAUTHORIZED', 'Entre com seu usuário e senha.');
  const row = findRow_('Sessoes', hash_(token));
  const ses = row ? getById_('Sessoes', hash_(token)) : null;
  if (!ses || new Date(ses.expiraEm).getTime() < Date.now()) throw fail_('UNAUTHORIZED', 'Sessão expirada. Entre novamente.');
  const u = getById_('Acessos', ses.userId);
  if (!u || u.status !== 'ativo') throw fail_('UNAUTHORIZED', 'Acesso desativado. Fale com quem administra a planilha.');
  return u;
}
function publicUser_(u) { return { id: u.id, name: u.nome, username: u.usuario, email: u.email, role: u.perfil, active: u.status === 'ativo' }; }

/** Login: valida usuário e senha e cria uma sessão. A senha nunca é gravada nem registrada em log. */
function login_(p) {
  const usuario = String(p.username || '').trim().toLowerCase();
  const senha = String(p.password || '');
  if (!usuario || !senha) throw fail_('VALIDATION', 'Informe usuário e senha.');
  const cache = CacheService.getScriptCache(), key = 'fails:' + usuario;
  if (Number(cache.get(key) || 0) >= MAX_FAILS) throw fail_('LOCKED', 'Muitas tentativas. Aguarde 15 minutos e tente de novo.');
  const u = readAll_('Acessos').filter(function (x) { return x.usuario === usuario; })[0];
  const passOk = u && u.senhaHash && pwHash_(senha, u.sal) === u.senhaHash;
  if (!passOk) {
    cache.put(key, String(Number(cache.get(key) || 0) + 1), 900);
    throw fail_('BAD_LOGIN', 'Usuário ou senha inválidos.');
  }
  if (u.status === 'pendente') throw fail_('PENDING', 'Seu cadastro aguarda aprovação de quem administra o app.');
  if (u.status !== 'ativo') throw fail_('BAD_LOGIN', 'Acesso desativado. Fale com quem administra a planilha.');
  cache.remove(key);
  return withLock_(function () { return createSession_(u, p.device); });
}
function createSession_(u, device) {
  purgeSessions_();
  const token = newToken_(), now = new Date();
  insert_('Sessoes', { id: hash_(token), userId: u.id, criadaEm: now.toISOString(), expiraEm: new Date(now.getTime() + SESSION_DAYS * 864e5).toISOString(), aparelho: String(device || '').slice(0, 80) });
  const row = findRow_('Acessos', u.id); u.ultimoAcesso = now.toISOString(); writeRow_('Acessos', row, u);
  audit_(u, 'login', 'Acessos', u.id);
  return { token: token, user: publicUser_(u) };
}

// ---- cadastro e recuperação de senha por e-mail (código de 6 dígitos, vale 10 min)

function emailOk_(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 80; }
function newCode_() { return ('00000' + (parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16) % 1000000)).slice(-6); }
function throttle_(key, seconds, msg) {
  const c = CacheService.getScriptCache();
  if (c.get(key)) throw fail_('THROTTLE', msg || 'Aguarde um minuto para pedir outro código.');
  c.put(key, '1', seconds);
}
function sendCode_(email, code, motivo) {
  MailApp.sendEmail({ to: email, name: APP.name, subject: APP.name + ': seu código ' + code,
    body: 'Seu código para ' + motivo + ' é: ' + code + '\n\nEle vale por 10 minutos. Se não foi você, ignore este e-mail.' });
}
function ownerEmail_() { try { return String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (e) { return ''; } }
function checkCode_(prefix, email, code) {
  const cache = CacheService.getScriptCache(), raw = cache.get(prefix + email);
  if (!raw) throw fail_('CODE_EXPIRED', 'Código vencido. Peça um novo.');
  const d = JSON.parse(raw);
  if (d.tries >= 5) { cache.remove(prefix + email); throw fail_('CODE_EXPIRED', 'Muitas tentativas. Peça um novo código.'); }
  if (hash_(String(code || '').trim() + ':' + email) !== d.codeHash) {
    d.tries++; cache.put(prefix + email, JSON.stringify(d), CODE_TTL);
    throw fail_('BAD_CODE', 'Código incorreto.');
  }
  cache.remove(prefix + email);
  return d;
}

/** 1º passo do cadastro: valida e manda o código. Nada é gravado na planilha ainda. */
function register_(p) {
  const nome = String(p.name || '').trim(), email = String(p.email || '').trim().toLowerCase();
  if (!nome || nome.length > 40) throw fail_('VALIDATION', 'Informe seu nome (até 40 letras).');
  if (!emailOk_(email)) throw fail_('VALIDATION', 'Informe um e-mail válido.');
  validatePassword_(String(p.password || ''), String(p.confirm || ''), email);
  const all = readAll_('Acessos');
  if (all.some(function (u) { return u.usuario === email; })) throw fail_('DUPLICATE', 'Esse e-mail já tem cadastro. Use "Esqueci a senha" se precisar.');
  const owner = ownerEmail_();
  if (!all.length && owner && email !== owner) throw fail_('VALIDATION', 'O primeiro cadastro precisa ser feito com o Gmail dono desta planilha.');
  if (all.filter(function (u) { return u.status === 'pendente'; }).length >= 10) throw fail_('LIMIT', 'Há cadastros demais aguardando aprovação.');
  throttle_('sentreg:' + email, 60);
  const sal = newToken_(), code = newCode_();
  CacheService.getScriptCache().put('reg:' + email, JSON.stringify({ nome: nome, sal: sal, senhaHash: pwHash_(String(p.password), sal), codeHash: hash_(code + ':' + email), tries: 0 }), CODE_TTL);
  sendCode_(email, code, 'confirmar seu cadastro');
  return { sent: true };
}
/** 2º passo: confere o código e cria o acesso. O 1º cadastro vira administrador; os demais ficam pendentes. */
function verify_(p) {
  const email = String(p.email || '').trim().toLowerCase();
  const d = checkCode_('reg:', email, p.code);
  return withLock_(function () {
    const all = readAll_('Acessos');
    if (all.some(function (u) { return u.usuario === email; })) throw fail_('DUPLICATE', 'Esse e-mail já tem cadastro.');
    const first = all.length === 0;
    const u = { id: uid_(), usuario: email, nome: d.nome, email: email, perfil: first ? 'admin' : 'membro', status: first ? 'ativo' : 'pendente', senhaHash: d.senhaHash, sal: d.sal, criadoEm: iso_(), ultimoAcesso: '' };
    insert_('Acessos', u);
    shareFolderWithEmail_(email);
    return first ? createSession_(u, p.device) : { pending: true };
  });
}
/** Esqueci a senha: sempre responde igual, exista o e-mail ou não. */
function forgot_(p) {
  const email = String(p.email || '').trim().toLowerCase();
  if (!emailOk_(email)) throw fail_('VALIDATION', 'Informe um e-mail válido.');
  throttle_('sentrst:' + email, 60);
  const u = readAll_('Acessos').filter(function (x) { return x.usuario === email; })[0];
  if (u && u.status !== 'inativo') {
    const code = newCode_();
    CacheService.getScriptCache().put('rst:' + email, JSON.stringify({ codeHash: hash_(code + ':' + email), tries: 0 }), CODE_TTL);
    sendCode_(email, code, 'redefinir sua senha');
  }
  return { sent: true };
}
function reset_(p) {
  const email = String(p.email || '').trim().toLowerCase();
  validatePassword_(String(p.password || ''), String(p.confirm || ''), email);
  checkCode_('rst:', email, p.code);
  return withLock_(function () {
    const u = readAll_('Acessos').filter(function (x) { return x.usuario === email; })[0];
    if (!u) throw fail_('CODE_EXPIRED', 'Código vencido. Peça um novo.');
    u.sal = newToken_(); u.senhaHash = pwHash_(String(p.password), u.sal);
    writeRow_('Acessos', findRow_('Acessos', u.id), u);
    revokeSessions_(u.id);
    CacheService.getScriptCache().remove('fails:' + email);
    return { ok: true };
  });
}
function adminOnly_(u) { if (u.perfil !== 'admin') throw fail_('FORBIDDEN', 'Só administradores podem fazer isso.'); }
function activeUsers_() { return readAll_('Acessos').filter(function (u) { return u.status !== 'pendente'; }).map(publicUser_); }
function logout_(p, user) {
  const row = p.__token ? findRow_('Sessoes', hash_(p.__token)) : 0;
  if (row) sheet_('Sessoes').deleteRow(row);
  return { ok: true };
}
function revokeSessions_(userId) {
  const sh = sheet_('Sessoes');
  for (let r = sh.getLastRow(); r >= 2; r--) if (String(sh.getRange(r, 2).getValues()[0][0]) === String(userId)) sh.deleteRow(r);
}
function purgeSessions_() {
  const sh = sheet_('Sessoes'), now = Date.now();
  for (let r = sh.getLastRow(); r >= 2; r--) {
    const v = sh.getRange(r, 4).getValues()[0][0];
    if (!v || new Date(v).getTime() < now) sh.deleteRow(r);
  }
}
/** Senha com sal e 3000 rodadas de SHA-256 (o Apps Script não tem bcrypt). */
function pwHash_(senha, sal) {
  let h = hash_(sal + ':' + senha);
  for (let i = 0; i < PW_ROUNDS; i++) h = hash_(h + sal + senha);
  return h;
}
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
  if (!getById_('Acessos', id)) throw fail_('VALIDATION', 'Responsável não encontrado.');
}

function crossCheck_(name, o) {
  if (name === 'Accounts' || name === 'Cards') ownerOrFail_(o.ownerId, true);
  if (name === 'FixedBills' || name === 'Goals') ownerOrFail_(o.ownerId, false);
  if (name === 'FixedBills') {
    const kind = o.kind || 'expense';
    if (o.categoryId) { const cat = activeOrFail_('Categories', o.categoryId, 'Categoria'); if (cat.type !== kind) throw fail_('VALIDATION', 'A categoria não combina com o tipo (receita/despesa).'); }
    if (o.accountId) activeOrFail_('Accounts', o.accountId, 'Conta');
    if (o.cardId) {
      const cd = activeOrFail_('Cards', o.cardId, 'Cartão');
      if (kind === 'income' && cd.kind === 'credit') throw fail_('VALIDATION', 'Receita não entra em cartão de crédito.');
    }
  }
}

function dupName_(name, o) {
  if (['Accounts', 'Cards', 'Categories', 'Goals', 'FixedBills'].indexOf(name) < 0) return;
  const n = String(o.name).trim().toLowerCase();
  const clash = readAll_(name).some(function (x) {
    return !x.archived && x.id !== o.id && String(x.name).trim().toLowerCase() === n &&
      (name !== 'Categories' || x.type === o.type) && (name !== 'FixedBills' || (x.kind || 'expense') === (o.kind || 'expense')) && (name === 'Categories' || name === 'Goals' || name === 'FixedBills' || x.ownerId === o.ownerId);
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
  if (name === 'FixedBills' && !o.kind) o.kind = 'expense';
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
    users: activeUsers_(),
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
    users: activeUsers_(), settings: settings_(), inboxCounts: inboxCounts_()
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
  if (o.fixedBillId) {
    const fb = activeOrFail_('FixedBills', o.fixedBillId, 'Conta fixa');
    if ((fb.kind || 'expense') !== o.type) throw fail_('VALIDATION', 'O lançamento não combina com o tipo da conta/receita fixa.');
  }
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
  const row = findRow_('Acessos', user.id);
  const cur = getById_('Acessos', user.id);
  cur.nome = name; writeRow_('Acessos', row, cur);
  audit_(user, 'update', 'Acessos', user.id);
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
    if (k === 'paymentMethods') {
      if (!Array.isArray(v) || v.length > 20) throw fail_('VALIDATION', 'Lista de formas de pagamento inválida.');
      const seen = {};
      values[k] = v.map(function (x) { return String(x || '').trim().slice(0, 30); }).filter(function (x) {
        const key = x.toLowerCase(); if (!x || seen[key]) return false; seen[key] = 1; return true;
      });
    }
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
  const ownerId = p.ownerId && getById_('Acessos', p.ownerId) ? p.ownerId : user.id;
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


// ============================================================
// PARSERS — notificações e contracheque
// ============================================================
/**
 * NOSSA FINANÇA — Parsers
 * Funções puras de leitura de texto: notificações bancárias e contracheque.
 * São heurísticas: o app SEMPRE mostra o resultado para o usuário conferir antes de gravar.
 */

function normalize_(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** "1.234,56" -> 1234.56 ; "1234.56" -> 1234.56 ; "1.234" -> 1234 */
function parseMoney_(s) {
  let t = String(s).replace(/[^\d.,]/g, '');
  if (!t) return null;
  if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '');
  const n = parseFloat(t);
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const BANKS_ = [
  ['nubank', 'Nubank'], ['itau', 'Itaú'], ['bradesco', 'Bradesco'], ['santander', 'Santander'], ['banco inter', 'Inter'],
  ['inter', 'Inter'], ['c6', 'C6 Bank'], ['caixa', 'Caixa'], ['banco do brasil', 'Banco do Brasil'], ['picpay', 'PicPay'],
  ['mercado pago', 'Mercado Pago'], ['sicredi', 'Sicredi'], ['sicoob', 'Sicoob'], ['neon', 'Neon'], ['will bank', 'Will Bank'],
  ['pagbank', 'PagBank'], ['bnb', 'Banco do Nordeste'], ['btg', 'BTG'], ['xp', 'XP'], ['alelo', 'Alelo'], ['sodexo', 'Sodexo'],
  ['ticket', 'Ticket'], ['vr ', 'VR'], ['ifood benef', 'iFood Benefícios']
];

function parseNotification_(text, app, categories) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  const norm = normalize_(raw);
  const out = { amount: null, merchant: '', institution: '', type: 'expense', categoryId: '', confidence: 'low' };

  // valor: primeiro R$ que não seja saldo/limite; prefere o que vem depois de "valor"
  const re = /R\$\s*([\d]{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)/gi;
  let m, first = null, preferred = null;
  while ((m = re.exec(raw))) {
    const before = normalize_(raw.slice(Math.max(0, m.index - 18), m.index));
    if (/saldo|limite|disponivel/.test(before)) continue;
    const v = parseMoney_(m[1]);
    if (v === null) continue;
    if (first === null) first = v;
    if (/valor( de| da| do)?\s*$/.test(before) && preferred === null) preferred = v;
  }
  out.amount = preferred !== null ? preferred : first;

  // tipo: vence a palavra-chave que aparece primeiro
  const inc = /(voce recebeu|recebeu um pix|pix recebido|recebeu uma transferencia|transferencia recebida|ted recebida|doc recebido|deposito|credito em conta|salario|estorno|reembolso|cashback|rendimento|recebimento)/.exec(norm);
  const exp = /(compra|pagamento|pague|pix enviado|voce enviou|enviou um pix|transferencia enviada|voce transferiu|transferiu|debito|saque|fatura|boleto|pagou|cobranca|assinatura|recarga)/.exec(norm);
  if (inc && (!exp || inc.index < exp.index)) { out.type = 'income'; out.confidence = 'medium'; }
  else if (exp) { out.type = 'expense'; out.confidence = 'medium'; }

  // estabelecimento / pessoa
  const stop = '(?=\\s+(?:no valor|valor|por R\\$|R\\$|no cart[aã]o|com final|final \\d|[àa]s \\d|em \\d{2}\\/|hoje|agora)|[.,;]|$)';
  let mm = new RegExp('(?:compra|pagamento|d[eé]bito)[^.]*?\\b(?:em|no|na)\\s+(?!cart[aã]o|valor|conta)([^,.;]+?)' + stop, 'i').exec(raw);
  if (!mm) mm = new RegExp('\\b(?:[Dd]e|[Pp]ara)\\s+([A-ZÀ-Ú][^,.;]{2,40}?)' + stop).exec(raw);
  if (!mm) mm = new RegExp('\\b(?:em|no|na)\\s+([A-Z0-9][A-Z0-9 *.&\'-]{2,30})' + stop).exec(raw);
  if (mm) out.merchant = mm[1].replace(/\s+/g, ' ').replace(/^(?:o|a)\s+/i, '').trim().slice(0, 60);

  // instituição
  const hay = normalize_(app) + ' ' + norm;
  for (let i = 0; i < BANKS_.length; i++) {
    if (hay.indexOf(BANKS_[i][0]) >= 0) { out.institution = BANKS_[i][1]; break; }
  }

  // categoria sugerida: palavra-chave mais específica (mais longa) que aparece no texto
  const hayCat = normalize_(out.merchant + ' ' + raw);
  let best = 0;
  (categories || []).forEach(function (c) {
    if (c.type !== out.type || !c.keywords) return;
    String(c.keywords).split(',').forEach(function (k) {
      const kw = normalize_(k);
      if (kw.length >= 2 && kw.length > best && new RegExp('(^|[^a-z0-9])' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)').test(hayCat)) { best = kw.length; out.categoryId = c.id; }
    });
  });
  if (out.amount !== null && out.merchant) out.confidence = 'high';
  return out;
}

// ---------------------------------------------------------------- OCR (Drive)

/** Converte PDF/imagem em texto usando o OCR do Drive (serviço avançado "Drive API" v2). */
function ocrToText_(blob) {
  if (typeof Drive === 'undefined' || !Drive.Files) {
    throw fail_('OCR_UNAVAILABLE', 'Ative o serviço "Drive API" (v2) no Apps Script para ler contracheques.');
  }
  let file;
  try {
    file = Drive.Files.insert({ title: 'tmp-ocr-' + uid_(), mimeType: blob.getContentType() }, blob, { ocr: true, ocrLanguage: 'pt' });
    return DocumentApp.openById(file.id).getBody().getText();
  } catch (e) {
    throw fail_('OCR_FAILED', 'Não consegui ler o arquivo. Tente outro PDF ou uma foto mais nítida.');
  } finally {
    if (file && file.id) { try { Drive.Files.remove(file.id); } catch (e2) { /* ignore */ } }
  }
}

// ---------------------------------------------------------------- contracheque

const MONTHS_PT_ = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const PAYSLIP_LABELS_ = {
  gross: /total (de |dos )?(vencimentos|proventos)|salario bruto|total bruto|rendimentos totais/,
  discounts: /total (de |dos |das )?(descontos|deducoes)|descontos totais/,
  net: /liquido( a receber| do mes)?|valor liquido|total liquido/
};

function parsePayslipText_(text) {
  const lines = String(text || '').split(/\r?\n/).map(function (s) { return s.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
  const out = { competence: '', gross: null, discounts: null, net: null, items: [], warnings: [] };
  const moneyRe = /\d{1,3}(?:\.\d{3})*,\d{2}/;

  // competência
  const flat = normalize_(lines.join(' \n '));
  let c = /(?:competencia|referencia|mes\/ano|periodo)[^\d\n]{0,15}(\d{2})\s*[\/.-]\s*(\d{4})/.exec(flat);
  if (c) out.competence = c[2] + '-' + c[1];
  else {
    c = new RegExp('(' + MONTHS_PT_.join('|') + ')\\s*(?:de|\\/)?\\s*(\\d{4})').exec(flat);
    if (c) out.competence = c[2] + '-' + ('0' + (MONTHS_PT_.indexOf(c[1]) + 1)).slice(-2);
  }

  // totais: primeiro valor depois do rótulo (mesma linha ou até 2 linhas abaixo)
  function findAfter(labelRe) {
    for (let i = 0; i < lines.length; i++) {
      const n = normalize_(lines[i]), m = labelRe.exec(n);
      if (!m) continue;
      const tail = lines[i].slice(Math.min(m.index + m[0].length, lines[i].length));
      let v = moneyRe.exec(tail);
      for (let k = 1; !v && k <= 2 && i + k < lines.length; k++) v = moneyRe.exec(lines[i + k]);
      if (v) return parseMoney_(v[0]);
    }
    return null;
  }
  out.gross = findAfter(PAYSLIP_LABELS_.gross);
  out.discounts = findAfter(PAYSLIP_LABELS_.discounts);
  out.net = findAfter(PAYSLIP_LABELS_.net);

  // itens (linhas de rubrica com um valor no fim)
  const rowRe = /^(?:\d{1,5}\s+)?(.{3,45}?)\s+(?:\d{1,3}(?:[.,]\d{1,2})?\s*%?\s+)?(\d{1,3}(?:\.\d{3})*,\d{2})\s*([CD])?$/;
  const seen = {};
  lines.forEach(function (ln) {
    const n = normalize_(ln);
    if (PAYSLIP_LABELS_.gross.test(n) || PAYSLIP_LABELS_.discounts.test(n) || PAYSLIP_LABELS_.net.test(n) || /^base|base de calculo|salario base|fgts mes/.test(n)) return;
    const m = rowRe.exec(ln);
    if (!m) return;
    const label = m[1].replace(/\s+/g, ' ').trim();
    if (!/[A-Za-zÀ-ú]{3}/.test(label)) return;
    const value = parseMoney_(m[2]);
    const ln2 = normalize_(label);
    let kind = m[3] === 'D' ? 'discount' : 'earning';
    if (/inss|irrf|\bir\b|imposto|desconto|plano|vale|contribuicao|previd|falta|adiantamento|consignado|sindical|coparticipacao/.test(ln2)) kind = 'discount';
    if (/fgts/.test(ln2)) kind = 'info';
    const key = ln2 + '|' + value;
    if (seen[key]) return; seen[key] = 1;
    out.items.push({ label: label, value: value, kind: kind });
  });

  // reconciliação
  const sum = function (k) { return Math.round(out.items.filter(function (i) { return i.kind === k; }).reduce(function (a, i) { return a + i.value; }, 0) * 100) / 100; };
  if (out.gross === null && out.items.some(function (i) { return i.kind === 'earning'; })) { out.gross = sum('earning'); out.warnings.push('Bruto calculado pela soma dos proventos encontrados.'); }
  if (out.discounts === null && out.items.some(function (i) { return i.kind === 'discount'; })) { out.discounts = sum('discount'); out.warnings.push('Descontos calculados pela soma das linhas encontradas.'); }
  if (out.net === null && out.gross !== null && out.discounts !== null) { out.net = Math.round((out.gross - out.discounts) * 100) / 100; out.warnings.push('Líquido calculado (bruto menos descontos).'); }
  if (out.net === null) out.warnings.push('Não encontrei o valor líquido. Informe manualmente.');
  if (out.gross !== null && out.discounts !== null && out.net !== null && Math.abs(out.gross - out.discounts - out.net) > 0.05) {
    out.warnings.push('Bruto, descontos e líquido não fecham. Confira os valores.');
  }
  if (!out.competence) out.warnings.push('Não identifiquei a competência (mês/ano).');
  return out;
}


// ============================================================
// SETUP — rode setup() uma vez
// ============================================================
/**
 * NOSSA FINANÇA — Setup
 * Rode setup() UMA vez no editor do Apps Script. É idempotente: pode rodar de novo
 * sem apagar dados (só cria o que falta).
 *
 * Depois do setup, crie os usuários em: planilha > menu "Finanças" > "Gerenciar usuários".
 */

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
  formatAcessos_();
  Logger.log('Setup concluído. Agora abra a planilha > menu Finanças > Gerenciar usuários e crie seu acesso.');
  return Object.keys(SCHEMA);
}

// ============================================================
// ACESSOS — gestão de usuários (menu "Finanças" na planilha)
// ============================================================
// As senhas são digitadas numa janela com campo mascarado e vão direto para o servidor,
// que guarda apenas hash com sal. Nenhuma tela, aba ou log mostra senha.

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('Finanças')
      .addItem('Gerenciar usuários', 'openUserManager')
      .addItem('Preparar planilha (setup)', 'setup')
      .addToUi();
  } catch (e) { /* fora de planilha */ }
}

function openUserManager() {
  const html = HtmlService.createHtmlOutput(USER_MANAGER_HTML_).setWidth(640).setHeight(640);
  SpreadsheetApp.getUi().showModalDialog(html, 'Gerenciar usuários');
}

function validatePassword_(senha, confirma, usuario) {
  if (String(senha).length < 8) throw fail_('VALIDATION', 'A senha precisa ter pelo menos 8 caracteres.');
  if (senha !== confirma) throw fail_('VALIDATION', 'A confirmação da senha não confere.');
  if (usuario && String(senha).toLowerCase() === usuario) throw fail_('VALIDATION', 'A senha não pode ser igual ao usuário.');
}
function activeAdmins_() { return readAll_('Acessos').filter(function (u) { return u.perfil === 'admin' && u.status === 'ativo'; }); }

/** Lista para o painel (nunca devolve hash nem sal). */
function umList() {
  return readAll_('Acessos').map(function (u) {
    return { id: u.id, usuario: u.usuario, nome: u.nome, email: u.email, perfil: u.perfil, status: u.status, ultimoAcesso: u.ultimoAcesso };
  });
}
function umCreate(f) {
  return withLock_(function () {
    const usuario = String(f.usuario || '').trim().toLowerCase(), nome = String(f.nome || '').trim();
    if (!/^[a-z0-9._@+-]{3,80}$/.test(usuario)) throw fail_('VALIDATION', 'Login: use o e-mail (ou 3+ caracteres: letras minúsculas, números, . _ - @).');
    if (!nome) throw fail_('VALIDATION', 'Informe o nome.');
    if (readAll_('Acessos').some(function (u) { return u.usuario === usuario; })) throw fail_('DUPLICATE', 'Esse usuário já existe.');
    validatePassword_(f.senha, f.confirma, usuario);
    const perfil = f.perfil === 'admin' || !readAll_('Acessos').length ? 'admin' : 'membro';
    const sal = newToken_();
    insert_('Acessos', { id: uid_(), usuario: usuario, nome: nome, email: usuario.indexOf('@') > 0 ? usuario : '', perfil: perfil, status: 'ativo', senhaHash: pwHash_(String(f.senha), sal), sal: sal, criadoEm: iso_(), ultimoAcesso: '' });
    if (usuario.indexOf('@') > 0) shareFolderWithEmail_(usuario);
    return umList();
  });
}
function umReset(f) {
  return withLock_(function () {
    const u = getById_('Acessos', f.id); if (!u) throw fail_('NOT_FOUND', 'Usuário não encontrado.');
    validatePassword_(f.senha, f.confirma, u.usuario);
    u.sal = newToken_(); u.senhaHash = pwHash_(String(f.senha), u.sal);
    writeRow_('Acessos', findRow_('Acessos', u.id), u);
    revokeSessions_(u.id);          // quem estava logado precisa entrar de novo
    CacheService.getScriptCache().remove('fails:' + u.usuario);   // redefinir também libera o bloqueio
    return umList();
  });
}
function umSet(f) {
  return withLock_(function () {
    const u = getById_('Acessos', f.id); if (!u) throw fail_('NOT_FOUND', 'Usuário não encontrado.');
    if (f.status) { if (['ativo', 'inativo', 'pendente'].indexOf(f.status) < 0) throw fail_('VALIDATION', 'Status inválido.'); u.status = f.status; }
    if (f.perfil) { if (['admin', 'membro'].indexOf(f.perfil) < 0) throw fail_('VALIDATION', 'Perfil inválido.'); u.perfil = f.perfil; }
    const rest = activeAdmins_().filter(function (a) { return a.id !== u.id; });
    if (!rest.length && !(u.perfil === 'admin' && u.status === 'ativo')) throw fail_('VALIDATION', 'Mantenha pelo menos um administrador ativo.');
    writeRow_('Acessos', findRow_('Acessos', u.id), u);
    if (u.status === 'inativo') revokeSessions_(u.id);
    return umList();
  });
}

/** Esconde hash e sal, trava o formato e coloca listas suspensas. Falhas aqui não impedem o resto. */
function formatAcessos_() {
  try {
    const sh = sheet_('Acessos');
    sh.hideColumns(7, 2);
    sh.getRange(2, 5, 500, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['admin', 'membro'], true).build());
    sh.getRange(2, 6, 500, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['ativo', 'inativo', 'pendente'], true).build());
    sheet_('Sessoes').hideSheet();
  } catch (e) { /* ambiente sem esses recursos */ }
}

const USER_MANAGER_HTML_ = '<!doctype html><html><head><base target="_top"><meta charset="utf-8"><style>' +
  'body{font:14px system-ui,sans-serif;margin:16px;color:#15324a}h3{margin:18px 0 8px}table{width:100%;border-collapse:collapse}' +
  'td,th{padding:6px 4px;border-bottom:1px solid #d9e6ef;text-align:left;font-size:13px}.b{padding:4px 10px;border:0;border-radius:12px;background:#dcf0fb;cursor:pointer;margin:1px}' +
  'input,select{width:100%;padding:7px;border:1px solid #b9cddb;border-radius:8px;box-sizing:border-box}.g{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
  '.p{background:#2d9cdb;color:#fff;padding:9px 16px;border:0;border-radius:14px;margin-top:10px;cursor:pointer}#m{margin:8px 0;font-weight:600}.e{color:#c0392b}.o{color:#16875f}small{color:#67829a}' +
  '</style></head><body><div id="m"></div><table><thead><tr><th>Usuário</th><th>Nome</th><th>Perfil</th><th>Status</th><th></th></tr></thead><tbody id="t"></tbody></table>' +
  '<h3 id="ft">Novo usuário</h3><div class="g"><input id="u" placeholder="e-mail (login)" autocomplete="off"><input id="n" placeholder="nome">' +
  '<select id="pf"><option value="membro">Membro</option><option value="admin">Administrador</option></select>' +
  '<input id="s" type="password" placeholder="senha (mín. 8)" autocomplete="new-password"><input id="c" type="password" placeholder="confirmar senha" autocomplete="new-password"></div>' +
  '<button class="p" id="go">Criar usuário</button> <button class="b" id="cx" style="display:none">Cancelar</button><br><small>As senhas não ficam salvas em lugar nenhum: só um código irreversível (hash).</small>' +
  '<script>var R=null;function $(i){return document.getElementById(i)}function msg(t,ok){var m=$("m");m.textContent=t;m.className=ok?"o":"e"}' +
  'function run(fn,args,done){google.script.run.withSuccessHandler(function(l){render(l);if(done)done()}).withFailureHandler(function(e){msg(e.message||String(e))})[fn].apply(null,args)}' +
  'function render(l){var t=$("t");t.innerHTML="";l.forEach(function(u){var r=t.insertRow();[u.usuario,u.nome,u.perfil,u.status].forEach(function(v){r.insertCell().textContent=v});var c=r.insertCell();' +
  'function B(x,f){var b=document.createElement("button");b.className="b";b.textContent=x;b.onclick=f;c.appendChild(b)}' +
  'B("Redefinir senha",function(){R=u;$("ft").textContent="Redefinir senha de "+u.usuario;$("go").textContent="Salvar nova senha";$("cx").style.display="";["u","n","pf"].forEach(function(i){$(i).disabled=true});$("s").focus()});' +
  'B(u.status=="ativo"?"Desativar":(u.status=="pendente"?"Aprovar":"Ativar"),function(){run("umSet",[{id:u.id,status:u.status=="ativo"?"inativo":"ativo"}],function(){msg("Atualizado.",1)})});' +
  'B(u.perfil=="admin"?"Tornar membro":"Tornar admin",function(){run("umSet",[{id:u.id,perfil:u.perfil=="admin"?"membro":"admin"}],function(){msg("Atualizado.",1)})})})}' +
  'function reset(){R=null;$("ft").textContent="Novo usuário";$("go").textContent="Criar usuário";$("cx").style.display="none";["u","n","pf"].forEach(function(i){$(i).disabled=false});["u","n","s","c"].forEach(function(i){$(i).value=""})}' +
  '$("cx").onclick=reset;$("go").onclick=function(){var s=$("s").value,c=$("c").value;' +
  'if(R){run("umReset",[{id:R.id,senha:s,confirma:c}],function(){msg("Senha alterada. Esse usuário precisa entrar de novo.",1);reset()})}' +
  'else{run("umCreate",[{usuario:$("u").value,nome:$("n").value,perfil:$("pf").value,senha:s,confirma:c}],function(){msg("Usuário criado.",1);reset()})}};' +
  'google.script.run.withSuccessHandler(render).withFailureHandler(function(e){msg(e.message)}).umList();</script></body></html>';

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

function shareFolderWithEmail_(email) {
  if (!email) return;
  try { folder_().addEditor(email); } catch (err) { Logger.log('Não foi possível compartilhar a pasta com ' + email); }
}
