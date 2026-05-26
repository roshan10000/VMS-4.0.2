/* =============================================================================
 *  VMS  ·  UI helpers
 *  Tiny, dependency-free DOM utilities.
 * ============================================================================= */

const UI = (() => {

  /* ---------- DOM shortcuts ---------------------------------------------- */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'class')      node.className = v;
      else if (k === 'html')  node.innerHTML = v;
      else if (k === 'text')  node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      }
      else if (k === 'attrs') Object.entries(v).forEach(([a,b]) => node.setAttribute(a,b));
      else node[k] = v;
    });
    children.flat().forEach(c => {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  };

  /* ---------- toast notifications ---------------------------------------- */
  let toastHost;
  const ensureHost = () => {
    if (toastHost) return toastHost;
    toastHost = el('div', { class: 'toasts' });
    document.body.appendChild(toastHost);
    return toastHost;
  };

  const toast = (title, body = '', kind = 'info', ms = 4000) => {
    const host = ensureHost();
    const node = el('div', { class: `toast ${kind}` },
      el('div', { class: 't-title', text: title }),
      body ? el('div', { class: 't-body', text: body }) : null
    );
    host.appendChild(node);
    setTimeout(() => {
      node.style.opacity = '0';
      node.style.transition = 'opacity .25s';
      setTimeout(() => node.remove(), 250);
    }, ms);
  };

  /* ---------- formatting ------------------------------------------------- */
  const pad = n => String(n).padStart(2, '0');

  const fmtDate = (d = new Date()) =>
    `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  const fmtTime = (d = new Date()) => {
    let h = d.getHours();
    const m = pad(d.getMinutes());
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${pad(h)}:${m} ${ampm}`;
  };

  const fmtTimeWithSec = (d = new Date()) => {
    let h = d.getHours();
    const m = pad(d.getMinutes());
    const s = pad(d.getSeconds());
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${pad(h)}:${m}:${s} ${ampm}`;
  };

  const fmtDuration = sec => {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${pad(m)}:${pad(s)}`;
  };

  const fmtFileName = (orderType, marketplace, orderId) => {
    const d = new Date();
    const tag = (marketplace || 'UNKNOWN').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const id  = (orderId || 'NA').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const timeStr = `${pad(d.getHours())}-${pad(d.getMinutes())}${d.getHours() >= 12 ? 'PM' : 'AM'}`;
    return `${tag}_${id}_${dateStr}_${timeStr}.webm`;
  };

  const fmtBytes = b => {
    if (b == null) return '—';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
    return (b / 1073741824).toFixed(2) + ' GB';
  };

  /* ---------- modal helpers ---------------------------------------------- */
  const confirm = ({ title = 'Confirm', body = '', okLabel = 'Confirm',
                     cancelLabel = 'Cancel', danger = false } = {}) => {
    return new Promise(resolve => {
      const back = el('div', { class: 'modal-back open' });
      const modal = el('div', { class: 'modal' },
        el('div', { class: 'modal-head' }, el('h2', { text: title })),
        el('div', { class: 'modal-body' }, el('p', { class: 'dim', text: body })),
        el('div', { class: 'modal-foot' },
          el('button', { class: 'btn ghost', text: cancelLabel,
            onClick: () => { back.remove(); resolve(false); } }),
          el('button', { class: `btn ${danger ? 'danger' : 'primary'}`, text: okLabel,
            onClick: () => { back.remove(); resolve(true); } })
        )
      );
      back.appendChild(modal);
      document.body.appendChild(back);
    });
  };

  /* ---------- form helpers ----------------------------------------------- */
  const readForm = form => {
    const data = {};
    $$('[name]', form).forEach(input => {
      data[input.name] = input.value.trim();
    });
    return data;
  };

  const fillSelect = (sel, options, placeholder = '— select —') => {
    sel.innerHTML = '';
    sel.appendChild(el('option', { value: '', text: placeholder, attrs: { disabled: '', selected: '' } }));
    options.forEach(opt => sel.appendChild(el('option', { value: opt, text: opt })));
  };

  /* ---------- spinner ---------------------------------------------------- */
  const spin = (text = 'Loading') =>
    el('div', { class: 'row gap-sm dim mono', style: 'padding:14px;' },
      el('span', { class: 'spinner' }),
      el('span', { text })
    );

  return {
    $, $$, el, toast,
    fmtDate, fmtTime, fmtTimeWithSec, fmtDuration, fmtFileName, fmtBytes,
    confirm, readForm, fillSelect, spin,
    pad
  };
})();
