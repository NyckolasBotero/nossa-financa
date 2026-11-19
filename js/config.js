/**
 * config.js — configurações públicas do app.
 * NUNCA coloque o token aqui: este arquivo vai para o GitHub.
 * A URL do Web App não é segredo (sem o token ela não entrega nada), mas também pode ser
 * informada na tela de conexão, que guarda tudo só no navegador do aparelho.
 */
export const CONFIG = {
  APP_NAME: 'Nossa Finança',
  VERSION: '1.0.0',
  API_URL: '',               // opcional: URL do Web App do Apps Script (termina em /exec)
  REQUEST_TIMEOUT_MS: 30000, // o Apps Script pode demorar alguns segundos na primeira chamada
  SYNC_MIN_INTERVAL_MS: 30000
};
