/**
 * news.js — notícias de finanças (Brasil e mundo) vindas do backend (Google Notícias, em cache de 30 min).
 */
import * as api from './api.js';

let cache = null, at = 0, pending = null;
export function loadNews({ force = false } = {}) {
  if (!force && cache && Date.now() - at < 30 * 60e3) return Promise.resolve(cache);
  if (pending) return pending;
  pending = api.call('news.get', {}, { silent: true, timeout: 30000 })
    .then((r) => { cache = r; at = Date.now(); return r; })
    .finally(() => { pending = null; });
  return pending;
}
export function ago(dateStr) {
  const t = Date.parse(dateStr); if (!Number.isFinite(t)) return '';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  return m < 60 ? `há ${m || 1} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`;
}
