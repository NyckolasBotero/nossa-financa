/**
 * notify.js — notificações laterais de progresso: "Lançando despesa…" → "Despesa lançada".
 * Independente do resto do app (só DOM). Cada operação devolve um handle com done()/fail().
 */
let box = null, lastDone = 0;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = {
  ok: '<svg viewBox="0 0 24 24" class="nt-svg"><path d="M5 12.5l4.500 4.500L19 7.500" fill="none" stroke="currentColor" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/></svg>',
  err: '<svg viewBox="0 0 24 24" class="nt-svg"><path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="2.600" stroke-linecap="round" pathLength="1"/></svg>',
  warn: '<svg viewBox="0 0 24 24" class="nt-svg"><path d="M12 6v8M12 18v.1" fill="none" stroke="currentColor" stroke-width="2.800" stroke-linecap="round"/></svg>',
  info: '<svg viewBox="0 0 24 24" class="nt-svg"><path d="M12 11v6M12 7v.1" fill="none" stroke="currentColor" stroke-width="2.800" stroke-linecap="round"/></svg>'
};
function root() {
  if (!box || !document.body.contains(box)) { box = document.createElement('div'); box.id = 'notify'; box.setAttribute('aria-live', 'polite'); document.body.append(box); }
  return box;
}
function card(kind, title, text) {
  const el = document.createElement('div');
  el.className = `nt nt-${kind}`; el.setAttribute('role', 'status');
  el.innerHTML = `<span class="nt-ic">${kind === 'loading' ? '<i class="nt-spin"></i>' : ICON[kind] || ICON.info}</span><span class="nt-tx"><b>${esc(title)}</b>${text ? `<small>${esc(text)}</small>` : ''}</span><i class="nt-bar"></i>`;
  root().append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  return el;
}
function dismiss(el, ms) {
  setTimeout(() => { el.classList.remove('in'); el.classList.add('out'); setTimeout(() => el.remove(), 380); }, ms);
}
function set(el, kind, title, text) {
  el.className = `nt nt-${kind} in`;
  el.innerHTML = `<span class="nt-ic">${ICON[kind]}</span><span class="nt-tx"><b>${esc(title)}</b>${text ? `<small>${esc(text)}</small>` : ''}</span><i class="nt-bar"></i>`;
}

/** Mensagem avulsa (sucesso, erro, aviso, info). */
export function say(kind, title, text, ms = 3800) { const el = card(kind, title, text); dismiss(el, ms); return el; }
/** Operação em andamento. */
export function start(title, text = '') {
  const el = card('loading', title, text);
  return {
    update(t, x) { el.querySelector('.nt-tx').innerHTML = `<b>${esc(t)}</b>${x ? `<small>${esc(x)}</small>` : ''}`; },
    done(t, x) { lastDone = Date.now(); set(el, 'ok', t, x); dismiss(el, 3200); },
    fail(t, x) { set(el, 'err', t, x); dismiss(el, 6000); },
    close() { el.remove(); }
  };
}
/** Houve um "concluído" nesta janela? Evita mostrar o mesmo sucesso duas vezes. */
export const recentlyDone = (ms = 1800) => Date.now() - lastDone < ms;
