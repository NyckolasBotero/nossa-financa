/**
 * store.js — estado em memória do app + sincronização com o backend.
 * Toda alteração passa por create/update/remove daqui: grava no Google Sheets e só então
 * atualiza o estado local com o registro devolvido pelo servidor (a planilha é a fonte da verdade).
 */
import * as api from './api.js';
import { scoped } from './projections.js';
import { currentMonth, todayISO } from './format.js';

export const state = {
  loaded: false, me: null, users: [], accounts: [], cards: [], categories: [], fixedBills: [], goals: [],
  settings: {}, transactions: [], inboxCounts: { pending: 0, rejected: 0 }, serverTime: ''
};

const PREF_KEY = 'nf.prefs';
const savedPrefs = (() => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; } })();
export const prefs = { who: savedPrefs.who || 'family', month: currentMonth() };

const subs = new Set();
let version = 0, cache = null, lastSync = 0;
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export function emit() { version++; cache = null; subs.forEach((f) => f()); }

export function setWho(who) {
  prefs.who = who;
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ who })); } catch { /* sem storage */ }
  emit();
}
export function setMonth(m) { prefs.month = m; emit(); }
export const today = () => todayISO();

/** Dados já filtrados pelo escopo atual, prontos para projections.js */
export function data() {
  if (cache && cache.v === version) return cache.d;
  const d = scoped(state, state.users.some((u) => u.id === prefs.who) ? prefs.who : 'family');
  d.inboxPending = state.inboxCounts.pending;
  cache = { v: version, d };
  return d;
}

const KIND = { transactions: 'tx', accounts: 'account', cards: 'card', categories: 'category', fixedBills: 'fixedBill', goals: 'goal' };

export function upsert(kind, rec) {
  const list = state[kind];
  const i = list.findIndex((x) => x.id === rec.id);
  if (kind === 'transactions' && rec.archived) { if (i >= 0) list.splice(i, 1); return; }
  if (i >= 0) list[i] = rec; else list.push(rec);
}
const clean = (rec) => { const r = { ...rec }; delete r.duplicate; return r; };

export async function load() {
  const r = await api.call('bootstrap', {}, { retries: 2 });
  Object.assign(state, r, { loaded: true });
  lastSync = Date.now();
  emit();
}

/** Sincronização incremental (traz só o que mudou, inclusive o que o outro aparelho lançou). */
export async function sync({ force = false, minInterval = 30000 } = {}) {
  if (!state.loaded || (!force && Date.now() - lastSync < minInterval)) return false;
  const since = new Date(Date.parse(state.serverTime) - 5000).toISOString();
  const r = await api.call('sync', { since }, { silent: !force, retries: 1 });
  for (const k of Object.keys(KIND)) (r[k] || []).forEach((rec) => upsert(k, rec));
  Object.assign(state, { users: r.users, settings: r.settings, inboxCounts: r.inboxCounts, serverTime: r.serverTime });
  lastSync = Date.now();
  emit();
  return true;
}

export async function create(kind, payload, opts) {
  const rec = clean(await api.call(`${KIND[kind]}.create`, payload, { retries: payload.clientId ? 1 : 0, ...opts }));
  upsert(kind, rec); emit(); return rec;
}
export async function update(kind, payload, opts) {
  const rec = clean(await api.call(`${KIND[kind]}.update`, payload, opts));
  upsert(kind, rec); emit(); return rec;
}
export async function remove(kind, id) {
  const rec = await api.call(`${KIND[kind]}.remove`, { id });
  upsert(kind, rec); emit(); return rec;
}
export async function saveSettings(values) {
  state.settings = await api.call('settings.save', { values });
  emit(); return state.settings;
}
export async function renameMe(name) {
  const u = await api.call('user.update', { name });
  state.users = state.users.map((x) => (x.id === u.id ? u : x)); state.me = u; emit();
}
export function setInboxCounts(c) { state.inboxCounts = c; emit(); }

// ---- seletores
export const byId = (kind, id) => state[kind].find((x) => x.id === id);
export const userName = (id) => (id === 'family' ? 'Família' : byId('users', id)?.name || '—');
export const categoryOf = (id) => byId('categories', id);
export const activeOf = (kind) => state[kind].filter((x) => !x.archived);
export const ownerOptions = () => state.users.map((u) => ({ value: u.id, label: u.name }));

/** Origem do pagamento: contas e cartões ativos como opções "a:<id>" / "c:<id>". */
export function sourceOptions({ type = 'expense' } = {}) {
  const opts = activeOf('accounts').map((a) => ({ value: `a:${a.id}`, label: `Conta · ${a.name}`, group: 'Contas' }));
  for (const c of activeOf('cards')) {
    if (c.kind === 'food') opts.push({ value: `c:${c.id}`, label: `Alimentação · ${c.name}`, group: 'Cartões' });
    else if (type === 'expense') opts.push({ value: `c:${c.id}`, label: `Crédito · ${c.name}`, group: 'Cartões' });
  }
  return opts;
}
export const categoryOptions = (type) => activeOf('categories').filter((c) => c.type === type).map((c) => ({ value: c.id, label: `${c.icon || ''} ${c.name}`.trim() }));
export const sourceLabel = (t) => (t.accountId ? byId('accounts', t.accountId)?.name : t.cardId ? byId('cards', t.cardId)?.name : '') || '';
