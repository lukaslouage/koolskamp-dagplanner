// Small "i" buttons with an explanation: <button class="info" data-info="...">. The text shows in one floating
// tooltip on hover or keyboard focus, and on a tap on touch screens. It floats above everything (position: fixed),
// so a scrolling sidebar or a card never cuts it off. Works for buttons added later too (event delegation).
window.KK = window.KK || {};

KK.info = (function () {
  const tip = document.createElement('div');
  tip.className = 'info-tip';
  tip.id = 'info-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.appendChild(tip);
  let current = null, pinned = false;

  function show(button, pin = false) {
    current = button;
    pinned = pin;
    tip.textContent = button.dataset.info;
    tip.hidden = false;
    button.setAttribute('aria-describedby', 'info-tip');
    button.setAttribute('aria-expanded', 'true');
    const r = button.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight, gap = 8;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const below = r.bottom + gap + h <= window.innerHeight - 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${below ? r.bottom + gap : Math.max(8, r.top - gap - h)}px`;
  }

  function hide() {
    if (current) { current.removeAttribute('aria-describedby'); current.setAttribute('aria-expanded', 'false'); }
    current = null;
    pinned = false;
    tip.hidden = true;
  }

  const infoOf = target => (target && target.closest ? target.closest('.info') : null);
  document.addEventListener('mouseover', e => { const b = infoOf(e.target); if (b && !pinned) show(b); });
  document.addEventListener('mouseout', e => { const b = infoOf(e.target); if (b && b === current && !pinned) hide(); });
  document.addEventListener('focusin', e => { const b = infoOf(e.target); if (b) show(b); });
  document.addEventListener('focusout', e => { if (infoOf(e.target) === current) hide(); });
  document.addEventListener('click', e => {
    const b = infoOf(e.target);
    if (b) {
      // The button can sit inside a label: do not let the click reach the field.
      e.preventDefault();
      e.stopPropagation();
      if (current === b && pinned) hide(); else show(b, true);
      return;
    }
    if (current) hide();
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && current) hide(); });
  window.addEventListener('scroll', () => { if (current) hide(); }, true);
  window.addEventListener('resize', () => { if (current) hide(); });

  /** Markup for an "i" button; the text is escaped. */
  function button(text, label = 'Uitleg') {
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    return `<button type="button" class="info no-print" data-info="${esc(text)}" aria-label="${esc(label)}" aria-expanded="false">i</button>`;
  }

  return { button, hide };
})();
