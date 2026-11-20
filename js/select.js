/**
 * select.js — troca todo <select> do site por uma lista (combobox) com cantos arredondados.
 * O <select> original continua no DOM, escondido: o valor, os eventos "change" e o código que já existia seguem funcionando.
 * Basta carregar este módulo; selects criados depois (modais, telas) são tratados sozinhos.
 */
const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
const descIdx = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
let openState = null, uid = 0;

const closePop = (focusBtn = false) => {
  if (!openState) return;
  const { pop, btn, off } = openState; openState = null;
  off(); pop.remove(); btn.setAttribute('aria-expanded', 'false'); if (focusBtn) btn.focus();
};

function enhance(sel) {
  if (sel.multiple || sel.size > 1 || sel.dataset.native !== undefined || sel._cs) return;
  const wrap = document.createElement('span'), btn = document.createElement('button');
  wrap.className = 'cs-wrap'; btn.type = 'button';
  btn.className = `cs-btn ${sel.className || ''}`.trim();
  btn.setAttribute('role', 'combobox'); btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<span class="cs-v"></span><svg class="cs-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  sel.parentNode.insertBefore(wrap, sel); wrap.append(btn, sel);
  sel.classList.add('cs-native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true'); sel._cs = btn;
  const label = () => {
    const o = sel.options[sel.selectedIndex];
    const v = btn.firstChild; v.textContent = o ? o.textContent.trim() : ''; v.classList.toggle('ph', !o || (o.value === '' && !!o.textContent.trim() && o.disabled));
    btn.disabled = sel.disabled;
    const l = sel.id && document.querySelector(`label[for="${sel.id}"]`); if (l) { l.id ||= `cs-l${++uid}`; btn.setAttribute('aria-labelledby', l.id); } else if (sel.getAttribute('aria-label')) btn.setAttribute('aria-label', sel.getAttribute('aria-label'));
  };
  // quando o código define select.value = ... a legenda acompanha
  Object.defineProperty(sel, 'value', { configurable: true, get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); label(); } });
  Object.defineProperty(sel, 'selectedIndex', { configurable: true, get() { return descIdx.get.call(this); }, set(v) { descIdx.set.call(this, v); label(); } });
  new MutationObserver(label).observe(sel, { childList: true, subtree: true, attributes: true, characterData: true });
  sel.addEventListener('change', label);
  sel.addEventListener('focus', () => btn.focus());
  sel.form?.addEventListener('reset', () => setTimeout(label));
  label();

  const choose = (opt) => { if (opt.disabled) return; closePop(true); if (sel.selectedIndex === opt.index) return; sel.selectedIndex = opt.index; sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); };
  const open = () => {
    if (btn.disabled) return; if (openState?.btn === btn) return closePop(true); closePop();
    const pop = document.createElement('div'); pop.className = 'cs-pop'; pop.setAttribute('role', 'listbox');
    const items = [];
    const add = (o, parent) => {
      const el = document.createElement('div'); el.className = 'cs-opt'; el.setAttribute('role', 'option'); el.textContent = o.textContent.trim() || ' ';
      if (o.disabled) el.classList.add('dis'); if (o.index === sel.selectedIndex) { el.classList.add('sel'); el.setAttribute('aria-selected', 'true'); }
      el.addEventListener('pointerdown', (e) => e.preventDefault());
      el.addEventListener('click', () => choose(o)); el.addEventListener('mousemove', () => mark(items.indexOf(el)));
      items.push(el); (parent || pop).append(el); el._o = o;
    };
    for (const n of sel.children) {
      if (n.tagName === 'OPTGROUP') { const g = document.createElement('div'); g.className = 'cs-grp'; g.textContent = n.label; pop.append(g); [...n.children].forEach((o) => add(o)); } else if (n.tagName === 'OPTION') add(n);
    }
    document.body.append(pop);
    let act = Math.max(0, items.findIndex((e) => e.classList.contains('sel')));
    const mark = (i) => { items[act]?.classList.remove('act'); act = i; items[act]?.classList.add('act'); items[act]?.scrollIntoView({ block: 'nearest' }); };
    const place = () => {
      const r = btn.getBoundingClientRect(), vh = innerHeight, w = Math.max(r.width, 180);
      pop.style.minWidth = `${w}px`; pop.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
      const h = Math.min(pop.scrollHeight, 300), below = vh - r.bottom - 10, above = r.top - 10;
      const down = below >= h || below >= above; pop.style.maxHeight = `${Math.max(120, Math.min(300, down ? below : above))}px`;
      pop.style.top = down ? `${r.bottom + 6}px` : ''; pop.style.bottom = down ? '' : `${vh - r.top + 6}px`;
    };
    place(); mark(act); btn.setAttribute('aria-expanded', 'true');
    let typed = '', typedT = 0;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return closePop(true); }
      if (e.key === 'Tab') return closePop();
      const move = (d) => { let i = act; do { i = Math.max(0, Math.min(items.length - 1, i + d)); } while (items[i]?.classList.contains('dis') && i > 0 && i < items.length - 1); mark(i); };
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); move(-1); }
      else if (e.key === 'Home') { e.preventDefault(); mark(0); } else if (e.key === 'End') { e.preventDefault(); mark(items.length - 1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (items[act]) choose(items[act]._o); }
      else if (e.key.length === 1) { clearTimeout(typedT); typed += e.key.toLowerCase(); typedT = setTimeout(() => { typed = ''; }, 600); const i = items.findIndex((x) => x.textContent.trim().toLowerCase().startsWith(typed)); if (i >= 0) mark(i); }
    };
    const onDown = (e) => { if (!pop.contains(e.target) && !btn.contains(e.target)) closePop(); };
    const onScroll = (e) => { if (!pop.contains(e.target)) place(); };
    document.addEventListener('keydown', onKey, true); document.addEventListener('pointerdown', onDown, true);
    addEventListener('resize', place); addEventListener('scroll', onScroll, true);
    openState = { pop, btn, off: () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onDown, true); removeEventListener('resize', place); removeEventListener('scroll', onScroll, true); } };
  };
  btn.addEventListener('click', open);
  btn.addEventListener('keydown', (e) => { if (!openState && ['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); open(); } });
}

const scan = (root) => { if (root.nodeType !== 1) return; if (root.tagName === 'SELECT') enhance(root); root.querySelectorAll?.('select').forEach(enhance); };
scan(document.body);
new MutationObserver((ms) => { for (const m of ms) m.addedNodes.forEach(scan); }).observe(document.body, { childList: true, subtree: true });
