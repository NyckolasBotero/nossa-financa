/**
 * config.js — configurações públicas do app.
 * NUNCA coloque senha ou token aqui: este arquivo vai para o GitHub.
 * A URL do Web App não é segredo: sem login ela não entrega nenhum dado.
 */
export const CONFIG = {
  APP_NAME: 'Nossa Finança',
  VERSION: '1.0.0',
  API_URL: 'https://script.google.com/macros/s/AKfycbwe9e7utdqVIPjaVKm-fYJ0GUO8y-L1xBfD6YzkfLMRP2qrnJkEH7Sxk8UW2v85ejzNLQ/exec',  // Web App do Apps Script
  REQUEST_TIMEOUT_MS: 30000, // o Apps Script pode demorar alguns segundos na primeira chamada
  SYNC_MIN_INTERVAL_MS: 30000
};
