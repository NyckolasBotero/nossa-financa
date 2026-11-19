/**
 * ui.js — componentes reutilizáveis: ícones, modais, formulários, toasts, upload de anexos.
 * Todas as telas montam seus formulários com formModal() para manter o mesmo comportamento.
 */
import { esc, parseMoney, moneyInput } from './format.js';
export * from './format.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

// ------------------------------------------------------------------ ícones (traço, 24x24)
const ICONS = {
  dashboard: '<rect x="3" y="3" width="8" height="8" rx="2.5"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2.5"/><rect x="3" y="13" width="8" height="8" rx="2.5"/>',
  extract: '<path d="M5 3.5h14v17l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M8.5 8.5h7M8.5 12.5h7"/>',
  bell: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  bank: '<path d="M3 9.5 12 4l9 5.5"/><path d="M5 11v7M9.5 11v7M14.5 11v7M19 11v7M3 20.5h18"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="3.5"/><path d="M2.5 10h19M6 15h4"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevL: '<path d="m15 5-7 7 7 7"/>', chevR: '<path d="m9 5 7 7-7 7"/>', chevD: '<path d="m6 9 6 6 6-6"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14-4M4 5v4h4"/><path d="M4 13a8 8 0 0 0 14 4M20 19v-4h-4"/>',
  filter: '<path d="M4 5h16l-6 8v6l-4-2v-4z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  undo: '<path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12"/>',
  wallet: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3"/><rect x="3" y="7" width="18" height="13" rx="3"/><circle cx="16.5" cy="13.5" r="1.2"/>',
  paste: '<rect x="6" y="5" width="12" height="16" rx="2.5"/><path d="M9 5V3.5h6V5M9 11h6M9 15h4"/>'
};
export const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : '#8395a7');
/** Ícone "gota": emoji da categoria dentro de uma bolha em formato de gota. */
export const drop = (emoji, color, cls = '') => `<span class="drop ${cls}" style="--c:${safeColor(color)}"><span>${esc(emoji || '🧾')}</span></span>`;
export const pill = (text, tone = 'neutral') => `<span class="pill pill-${tone}">${esc(text)}</span>`;
export const emptyState = (ic, title, text = '', action = '') =>
  `<div class="empty"><div class="empty-ic">${icon(ic)}</div><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
export const segmented = (name, options, value) =>
  `<div class="seg" role="radiogroup">${options.map((o) => `<label class="seg-i"><input type="radio" name="${esc(name)}" value="${esc(o.value)}" ${o.value === value ? 'checked' : ''}><span>${esc(o.label)}</span></label>`).join('')}</div>`;
export const amountClass = (t) => (t.type === 'income' ? 'pos' : t.type === 'expense' ? 'neg' : 'neu');

// ------------------------------------------------------------------ feedback
export function toast(msg, { kind = 'info', ms = 3600 } = {}) {
  let box = $('#toasts');
  if (!box) { box = h('<div id="toasts" aria-live="polite"></div>'); document.body.append(box); }
  const t = h(`<div class="toast toast-${kind}" role="status">${esc(msg)}</div>`);
  box.append(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, ms);
}
export function setBusy(on) { $('#busy')?.classList.toggle('on', on); }

// ------------------------------------------------------------------ modal
const modals = [];
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modals.length) modals[modals.length - 1].close(); });

export function openModal({ title, body = '', wide = false, onClose }) {
  const prev = document.activeElement;
  const root = h(`<div class="modal-backdrop"><div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header class="modal-h"><h2>${esc(title)}</h2><button type="button" class="btn-icon" data-x aria-label="Fechar">${icon('close')}</button></header>
    <div class="modal-b"></div></div></div>`);
  const bodyEl = $('.modal-b', root);
  if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.append(body);
  document.body.append(root);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => root.classList.add('in'));
  let closed = false;
  const api = {
    root, body: bodyEl,
    close() {
      if (closed) return; closed = true;
      modals.splice(modals.indexOf(api), 1);
      root.classList.remove('in');
      if (!modals.length) document.body.classList.remove('modal-open');
      setTimeout(() => root.remove(), 220);
      onClose?.(); prev?.focus?.();
    }
  };
  modals.push(api);
  $('[data-x]', root).addEventListener('click', api.close);
  let downOnBackdrop = false;
  root.addEventListener('mousedown', (e) => { downOnBackdrop = e.target === root; });
  root.addEventListener('click', (e) => { if (e.target === root && downOnBackdrop) api.close(); });
  setTimeout(() => ($('input:not([type=hidden]):not([type=radio]), select, textarea, button.btn-primary', bodyEl) || $('[data-x]', root)).focus?.({ preventScroll: true }), 60);
  return api;
}

export function confirmDialog({ title = 'Confirmar', text = '', okLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal({ title, body: `<p class="confirm-text">${esc(text)}</p><div class="modal-f"><button class="btn btn-ghost" data-no>Cancelar</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(okLabel)}</button></div>`, onClose: () => { if (!answered) resolve(false); } });
    $('[data-no]', m.root).addEventListener('click', () => m.close());
    $('[data-ok]', m.root).addEventListener('click', () => { answered = true; resolve(true); m.close(); });
  });
}

// ------------------------------------------------------------------ formulário em modal
const fieldHtml = (f, v) => {
  const id = `f-${f.name}`, req = f.required ? ' required' : '';
  const hint = f.hint ? `<small class="hint">${esc(f.hint)}</small>` : '';
  let ctl;
  switch (f.type) {
    case 'segmented': ctl = segmented(f.name, f.options, v); break;
    case 'select': {
      const groups = new Map();
      for (const o of f.options || []) { const g = o.group || ''; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(o); }
      const opt = (o) => `<option value="${esc(o.value)}" ${String(o.value) === String(v ?? '') ? 'selected' : ''}>${esc(o.label)}</option>`;
      ctl = `<select id="${id}" name="${esc(f.name)}"${req}>${f.placeholder !== undefined ? `<option value="">${esc(f.placeholder)}</option>` : ''}${[...groups].map(([g, os]) => (g ? `<optgroup label="${esc(g)}">${os.map(opt).join('')}</optgroup>` : os.map(opt).join(''))).join('')}</select>`;
      break;
    }
    case 'textarea': ctl = `<textarea id="${id}" name="${esc(f.name)}" rows="3" maxlength="${f.max || 500}" placeholder="${esc(f.placeholder || '')}">${esc(v ?? '')}</textarea>`; break;
    case 'check': ctl = `<label class="check"><input type="checkbox" id="${id}" name="${esc(f.name)}" ${v ? 'checked' : ''}><span>${esc(f.checkLabel || f.label)}</span></label>`; break;
    case 'emoji':
      ctl = `<input type="hidden" name="${esc(f.name)}" value="${esc(v || f.options[0])}"><div class="pick-grid">${f.options.map((e) => `<button type="button" class="pick ${e === (v || f.options[0]) ? 'on' : ''}" data-pick="${esc(e)}" aria-label="${esc(e)}">${esc(e)}</button>`).join('')}</div>`; break;
    case 'color':
      ctl = `<input type="hidden" name="${esc(f.name)}" value="${esc(v || f.options[0])}"><div class="pick-grid">${f.options.map((c) => `<button type="button" class="pick pick-color ${c === (v || f.options[0]) ? 'on' : ''}" data-pick="${esc(c)}" style="--c:${safeColor(c)}" aria-label="${esc(c)}"></button>`).join('')}</div>`; break;
    case 'files':
      ctl = `<div class="files"><input type="file" id="${id}" name="${esc(f.name)}" accept="${esc(f.accept || 'image/*,application/pdf')}" multiple hidden><button type="button" class="btn btn-soft" data-files="${esc(f.name)}">${icon('camera')} ${esc(f.buttonLabel || 'Anexar foto ou PDF')}</button><ul class="file-list" data-list="${esc(f.name)}"></ul></div>`; break;
    case 'money': ctl = `<input id="${id}" name="${esc(f.name)}" inputmode="decimal" autocomplete="off" placeholder="${esc(f.placeholder || '0,00')}" value="${esc(moneyInput(v))}"${req}>`; break;
    default: ctl = `<input id="${id}" name="${esc(f.name)}" type="${f.type || 'text'}" ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''} ${f.step ? `step="${f.step}"` : ''} maxlength="${f.maxlength || 120}" autocomplete="off" placeholder="${esc(f.placeholder || '')}" value="${esc(v ?? '')}"${req}>`;
  }
  const label = f.type === 'check' ? '' : `<label for="${id}">${esc(f.label)}${f.required ? '' : ' <i>(opcional)</i>'}</label>`;
  return `<div class="field ${f.full ? 'full' : ''}" data-field="${esc(f.name)}">${label}${ctl}${hint}<small class="err" role="alert"></small></div>`;
};

/**
 * Abre um formulário em modal.
 * fields: [{ name, label, type, options, required, full, showIf(values), hint, ... }]
 * onSubmit(values, ctl): async; se lançar erro, a mensagem aparece no topo do formulário.
 * onChange(name, ctl): chamado a cada alteração (para campos dependentes).
 */
export function formModal({ title, fields, values = {}, submitLabel = 'Salvar', onSubmit, onChange, extra = [], wide = false, onOpen, belowTitle = '' }) {
  const form = h(`<form class="form" novalidate>${belowTitle}<div class="form-error" role="alert" hidden></div><div class="form-grid">${fields.map((f) => fieldHtml(f, values[f.name])).join('')}</div><div class="modal-f"></div></form>`);
  const footer = $('.modal-f', form);
  for (const x of extra) footer.append(h(`<button type="button" class="btn ${x.kind || 'btn-ghost'}" data-extra="${esc(x.id)}">${esc(x.label)}</button>`));
  footer.append(h('<span class="grow"></span>'), h('<button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>'), h(`<button type="submit" class="btn btn-primary">${esc(submitLabel)}</button>`));
  const modal = openModal({ title, body: form, wide });
  const picked = {};          // arquivos escolhidos
  const byName = (n) => form.elements[n];
  const wrap = (n) => $(`[data-field="${n}"]`, form);
  const fmap = Object.fromEntries(fields.map((f) => [f.name, f]));

  const ctl = {
    modal, form,
    values() {
      const out = {};
      for (const f of fields) {
        if (f.showIf && !f.showIf(rawValues())) continue;
        out[f.name] = readField(f);
      }
      return out;
    },
    set(name, val) {
      const el = byName(name), f = fmap[name];
      if (!el) return;
      if (f.type === 'segmented') [...form.querySelectorAll(`input[name="${name}"]`)].forEach((r) => { r.checked = r.value === val; });
      else if (f.type === 'check') el.checked = !!val;
      else if (f.type === 'money') el.value = moneyInput(val);
      else if (f.type === 'emoji' || f.type === 'color') { el.value = val; $$('.pick', wrap(name)).forEach((b) => b.classList.toggle('on', b.dataset.pick === val)); }
      else el.value = val ?? '';
      refresh();
    },
    setOptions(name, options, placeholder) {
      const f = fmap[name], el = byName(name), cur = el.value;
      f.options = options; if (placeholder !== undefined) f.placeholder = placeholder;
      const tmp = h(fieldHtml(f, cur));
      el.replaceWith($('select', tmp));
    },
    error(msg) { const b = $('.form-error', form); b.textContent = msg || ''; b.hidden = !msg; if (msg) b.scrollIntoView({ block: 'nearest' }); },
    files: (name) => picked[name] || [],
    close: () => modal.close()
  };

  function readField(f) {
    const el = byName(f.name);
    switch (f.type) {
      case 'segmented': return form.querySelector(`input[name="${f.name}"]:checked`)?.value ?? '';
      case 'check': return el.checked;
      case 'money': return parseMoney(el.value);
      case 'number': return el.value === '' ? null : Number(el.value);
      case 'files': return picked[f.name] || [];
      default: return typeof el.value === 'string' ? el.value.trim() : el.value;
    }
  }
  const rawValues = () => Object.fromEntries(fields.map((f) => [f.name, readField(f)]));
  function refresh() {
    const v = rawValues();
    for (const f of fields) if (f.showIf) wrap(f.name).hidden = !f.showIf(v);
  }
  refresh();

  form.addEventListener('input', (e) => { refresh(); const n = e.target.name; if (n) { wrap(n)?.classList.remove('bad'); onChange?.(n, ctl); } });
  form.addEventListener('change', (e) => { refresh(); const n = e.target.name; if (n) onChange?.(n, ctl); });
  form.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-pick]');
    if (pick) { const w = pick.closest('[data-field]'); ctl.set(w.dataset.field, pick.dataset.pick); onChange?.(w.dataset.field, ctl); }
    const fb = e.target.closest('[data-files]');
    if (fb) $(`input[type=file][name="${fb.dataset.files}"]`, form).click();
    const ex = e.target.closest('[data-extra]');
    if (ex) extra.find((x) => x.id === ex.dataset.extra).onClick(ctl);
    if (e.target.closest('[data-cancel]')) modal.close();
    const rm = e.target.closest('[data-rmfile]');
    if (rm) { const [n, i] = rm.dataset.rmfile.split(':'); picked[n].splice(Number(i), 1); renderFiles(n); }
  });
  form.addEventListener('change', (e) => {
    if (e.target.type === 'file') { const n = e.target.name; picked[n] = [...(picked[n] || []), ...e.target.files]; e.target.value = ''; renderFiles(n); }
  });
  const renderFiles = (n) => { $(`[data-list="${n}"]`, form).innerHTML = (picked[n] || []).map((f, i) => `<li>${icon(f.type === 'application/pdf' ? 'doc' : 'camera')}<span>${esc(f.name)}</span><button type="button" class="btn-icon sm" data-rmfile="${n}:${i}" aria-label="Remover">${icon('close')}</button></li>`).join(''); };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    ctl.error('');
    const v = rawValues(); let bad = false;
    for (const f of fields) {
      if (f.showIf && !f.showIf(v)) continue;
      const empty = v[f.name] === '' || v[f.name] === null || v[f.name] === undefined;
      const w = wrap(f.name); w.classList.remove('bad'); $('.err', w).textContent = '';
      if (f.required && empty) { w.classList.add('bad'); $('.err', w).textContent = 'Preencha este campo.'; bad = true; }
      else if (f.type === 'money' && !empty && !(v[f.name] > 0) && f.positive !== false) { w.classList.add('bad'); $('.err', w).textContent = 'Informe um valor maior que zero.'; bad = true; }
      else if (f.validate && !empty) { const msg = f.validate(v[f.name], v); if (msg) { w.classList.add('bad'); $('.err', w).textContent = msg; bad = true; } }
    }
    if (bad) { $('.bad input, .bad select, .bad textarea', form)?.focus(); return; }
    const btn = $('button[type=submit]', form); btn.disabled = true; btn.classList.add('loading');
    try { await onSubmit(ctl.values(), ctl); }
    catch (err) { ctl.error(err.message || 'Não foi possível salvar.'); }
    finally { btn.disabled = false; btn.classList.remove('loading'); }
  });
  onOpen?.(ctl);
  return ctl;
}

// ------------------------------------------------------------------ expansão (acordeão)
export const expander = (id, title, body, open = false) =>
  `<section class="expander ${open ? 'open' : ''}" data-expander="${esc(id)}"><button type="button" class="expander-h" aria-expanded="${open}">${title}<span class="chev">${icon('chevD')}</span></button><div class="expander-b"><div>${body}</div></div></section>`;
document.addEventListener('click', (e) => {
  const b = e.target.closest('.expander-h');
  if (!b) return;
  const s = b.closest('.expander'); s.classList.toggle('open'); b.setAttribute('aria-expanded', s.classList.contains('open'));
});

// ------------------------------------------------------------------ anexos
const toB64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(new Error('Não consegui ler o arquivo.')); r.readAsDataURL(blob); });

/** Reduz fotos (máx. 1600 px, JPEG) para o upload ser leve; PDFs seguem como estão (até 7 MB). */
export async function prepareUpload(file) {
  if (file.type === 'application/pdf') {
    if (file.size > 7 * 1024 * 1024) throw new Error(`${file.name}: PDF maior que 7 MB.`);
    return { name: file.name, mime: file.type, data: await toB64(file) };
  }
  if (!file.type.startsWith('image/')) throw new Error(`${file.name}: envie uma imagem ou PDF.`);
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error(`${file.name}: formato de imagem não suportado. Tente JPG ou PNG.`); }
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
  return { name: file.name.replace(/\.\w+$/, '') + '.jpg', mime: 'image/jpeg', data: await toB64(blob) };
}
