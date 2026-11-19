/**
 * api.js — ÚNICA camada que fala com o Google Apps Script.
 * Nenhuma tela ou componente chama fetch diretamente.
 *
 * Contrato: POST text/plain (evita preflight CORS) com { action, token, payload }.
 * Resposta: { ok:true, data } | { ok:false, error:{ code, message, data? } }.
 * O token fica só no localStorage do aparelho e nunca é registrado em log.
 */
import { CONFIG } from './config.js';

const KEY = 'nf.conn';
export class ApiError extends Error {
  constructor(code, message, data) { super(message); this.name = 'ApiError'; this.code = code; this.data = data; }
}

export function getConn() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { url: c.url || CONFIG.API_URL || '', token: c.token || '' };
  } catch { return { url: CONFIG.API_URL || '', token: '' }; }
}
export const setConn = ({ url, token }) => localStorage.setItem(KEY, JSON.stringify({ url: String(url).trim(), token: String(token).trim() }));
export const clearConn = () => localStorage.removeItem(KEY);
export const isConfigured = () => { const c = getConn(); return !!(c.url && c.token); };

// indicador global de "carregando"
const busyFns = new Set();
let pending = 0;
export const onBusy = (fn) => { busyFns.add(fn); return () => busyFns.delete(fn); };
const bump = (n) => { pending += n; busyFns.forEach((f) => f(pending > 0)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {string} action  ex.: 'tx.create'
 * @param {object} payload
 * @param {{retries?:number, silent?:boolean, conn?:{url:string,token:string}}} opts
 *   retries: repete só em falha de rede (use em leituras e em criações com clientId).
 *   timeout: ms; o OCR do contracheque pede mais que o padrão.
 */
export async function call(action, payload = {}, { retries = 0, silent = false, conn, timeout = CONFIG.REQUEST_TIMEOUT_MS } = {}) {
  const { url, token } = conn || getConn();
  if (!url || !token) throw new ApiError('NOT_CONFIGURED', 'Conecte o app ao seu Apps Script em Configurações.');
  if (!silent) bump(1);
  try {
    for (let attempt = 0; ; attempt++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeout);
      try {
        const res = await fetch(url, {
          method: 'POST', redirect: 'follow', signal: ctl.signal,
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action, token, payload })
        });
        const json = await res.json().catch(() => null);
        if (!json) throw new ApiError('BAD_RESPONSE', 'Resposta inesperada. Confira a URL do Web App e se ele está publicado para "Qualquer pessoa".');
        if (!json.ok) throw new ApiError(json.error?.code || 'SERVER_ERROR', json.error?.message || 'Erro no servidor.', json.error?.data);
        return json.data;
      } catch (e) {
        if (e instanceof ApiError) throw e;
        if (attempt < retries) { await sleep(700 * (attempt + 1)); continue; }
        throw new ApiError('NETWORK', e.name === 'AbortError' ? 'Tempo esgotado. Tente de novo.' : 'Sem conexão com o servidor.');
      } finally { clearTimeout(timer); }
    }
  } finally { if (!silent) bump(-1); }
}
