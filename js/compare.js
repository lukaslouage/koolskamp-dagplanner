// Comparison view: the variants (A, B, C) side by side. A card per variant with the margin and its range when the
// races ride slow or fast, the day of each variant on one time axis, a table of what changes against the
// reference variant, and "Zoek de grens": one setting run over a range, to find up to where the margin holds.
window.KK = window.KK || {};

KK.Compare = class {
  // Settings that can differ between variants, in sidebar order, with their label and how to show the value.
  // View-only settings (the eyes) are left out.
  static SETTINGS = [
    ['womenStart', 'Start vrouwen', 'time'], ['womenIntroDuration', 'Ploegvoorstelling vrouwen', 'min'],
    ['womenSpeed', 'Snelheid vrouwen', 'speed'], ['womenSpeedSlow', 'Traag vrouwen', 'speed'], ['womenSpeedFast', 'Snel vrouwen', 'speed'],
    ['womenLaps', 'Rondes vrouwen', 'count'],
    ['menStart', 'Start mannen', 'time'], ['menIntroDuration', 'Ploegvoorstelling mannen', 'min'],
    ['menSpeed', 'Snelheid mannen', 'speed'], ['menSpeedSlow', 'Traag mannen', 'speed'], ['menSpeedFast', 'Snel mannen', 'speed'],
    ['menLoops', 'Lussen Ardooie', 'count'], ['menLaps', 'Rondes mannen', 'count'], ['menBreakaway', 'Vroege vlucht', 'mss'],
    ['womenRedFlag', 'Rode vlag vrouwen', 'min'], ['womenGreenFlag', 'Groene vlag vrouwen', 'min'],
    ['menRedFlag', 'Rode vlag mannen', 'min'], ['menGreenFlag', 'Groene vlag mannen', 'min'],
    ['podiumDuration', 'Podium', 'min'], ['marginOk', 'Streefmarge', 'min'], ['marginWarn', 'Minimummarge', 'min'],
    ['womenBroadcast', 'Uitzending vrouwen', 'onoff'], ['womenBroadcastStart', 'Uitzending vrouwen vanaf', 'autotime'],
    ['menBroadcastStart', 'Uitzending mannen vanaf', 'time'],
    ['vipArrival', 'Aankomst VIP', 'time'], ['vipMenuStart', 'Menu start', 'time'], ['vipMenuEnd', 'Menu klaar', 'time'],
  ];

  // Settings that "Zoek de grens" can run over: the step and the default range (around the current value or fixed).
  static SWEEPS = {
    womenStart: { label: 'Start vrouwen', kind: 'time', step: 5, around: 90 },
    menStart: { label: 'Start mannen', kind: 'time', step: 5, around: 90 },
    womenSpeed: { label: 'Snelheid vrouwen', kind: 'speed', step: 0.5, around: 4 },
    menSpeed: { label: 'Snelheid mannen', kind: 'speed', step: 0.5, around: 4 },
    womenLaps: { label: 'Rondes vrouwen', kind: 'count', step: 1, from: 3, to: 10 },
    menLaps: { label: 'Rondes mannen', kind: 'count', step: 1, from: 5, to: 12 },
    menLoops: { label: 'Lussen Ardooie', kind: 'count', step: 1, from: 0, to: 5 },
    podiumDuration: { label: 'Podium', kind: 'min', step: 5, from: 0, to: 60 },
    menBreakaway: { label: 'Vroege vlucht', kind: 'mss', step: 30, from: 0, to: 600 },
  };

  static esc(text) {
    return String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  /** A real minus sign in front of negative numbers. */
  static minus(text) { return String(text).replace('-', '−'); }

  /** "+5" or "−5" (with a real minus sign). */
  static signed(n) { return KK.Compare.minus(n > 0 ? `+${n}` : `${n}`); }

  static formatSetting(kind, value) {
    const f = KK.format;
    if (kind === 'time') return f.clock(f.parseTime(value));
    if (kind === 'autotime') return value ? f.clock(f.parseTime(value)) : 'automatisch';
    if (kind === 'min') return `${f.km(Number(value))} min`;
    if (kind === 'speed') return `${f.km(Number(value))} km/u`;
    if (kind === 'mss') { const s = Math.round(Number(value) || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
    if (kind === 'onoff') return value === false ? 'uit' : 'aan';
    return String(value);
  }

  /** Settings that differ between two complete settings objects: [{ key, label, from, to }]. */
  static differences(a, b) {
    return KK.Compare.SETTINGS.filter(([key]) => String(a[key]) !== String(b[key]))
      .map(([key, label, kind]) => ({ key, label, from: KK.Compare.formatSetting(kind, a[key]), to: KK.Compare.formatSetting(kind, b[key]) }));
  }

  static statusText(margin) {
    return margin.conflict ? 'Conflict' : { ok: 'Comfortabel', warn: 'Beperkt', bad: 'Onvoldoende' }[margin.status];
  }

  static statusOf(minutes, ok, warn) {
    return minutes < 0 ? 'bad' : minutes >= ok ? 'ok' : minutes >= warn ? 'warn' : 'bad';
  }

  /**
   * A bar from the worst to the best margin, with a dot at the expected margin, on the red, orange and green
   * zones of the minimum and the target margin. Used in the margin card and in the comparison cards.
   */
  static rangeBar({ worst, expected, best, ok, warn }) {
    const lo = Math.floor((Math.min(worst, 0) - 5) / 5) * 5, hi = Math.ceil((Math.max(best, ok + 10) + 5) / 5) * 5;
    const pct = v => ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * 100;
    const zone = (cls, a, z) => (z > a ? `<span class="rbar__zone rbar__zone--${cls}" style="left:${pct(a)}%;width:${pct(z) - pct(a)}%"></span>` : '');
    return `<div class="rbar" role="img" aria-label="Marge tussen ${worst} en ${best} min, verwacht ${expected} min">
      ${zone('bad', lo, Math.max(lo, warn))}${zone('warn', Math.max(lo, warn), ok)}${zone('ok', ok, hi)}
      <span class="rbar__span" style="left:${pct(worst)}%;width:${Math.max(0.6, pct(best) - pct(worst))}%"></span>
      <span class="rbar__dot" style="left:${pct(expected)}%"></span>
    </div>`;
  }

  /**
   * hooks: data() = { variants: [{ index, letter, label, settings, schedule, worst, best }], active, reference, max },
   * activate(i), setReference(i), apply(key, value) = change the active variant, addWith(key, value) = new variant
   * from the active one with one setting changed, addCopy() = new variant as a copy of the active one.
   */
  constructor(el, hooks) {
    this.el = el;
    this.hooks = hooks;
    this.sweep = { key: 'womenStart', from: null, to: null, selected: null, variant: null };
    this.wire();
  }

  wire() {
    this.el.addEventListener('click', e => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const { action } = target.dataset, index = Number(target.dataset.index);
      if (action === 'activate') this.hooks.activate(index);
      else if (action === 'reference') this.hooks.setReference(index);
      else if (action === 'copy') this.hooks.addCopy();
      else if (action === 'pick') { this.sweep.selected = Number(target.dataset.x); this.render(); }
      else if (action === 'apply' || action === 'add-with') {
        const value = this.sweepValue(this.sweep.selected);
        this.sweep.selected = null;
        if (action === 'apply') this.hooks.apply(this.sweep.key, value);
        else this.hooks.addWith(this.sweep.key, value);
      }
    });
    this.el.addEventListener('change', e => {
      const field = e.target.closest('[data-sweep]');
      if (!field) return;
      if (field.dataset.sweep === 'key') this.sweep = { ...this.sweep, key: field.value, from: null, to: null, selected: null };
      else {
        const def = KK.Compare.SWEEPS[this.sweep.key];
        const value = def.kind === 'time' ? KK.format.parseTime(field.value) : Number(String(field.value).replace(',', '.'));
        if (field.value !== '' && Number.isFinite(value)) this.sweep[field.dataset.sweep] = def.kind === 'mss' ? value * 60 : value;
        this.sweep.selected = null;
      }
      this.render();
    });
  }

  render() {
    const data = this.hooks.data(), esc = KK.Compare.esc;
    const { variants } = data, several = variants.length > 1;
    // A new active variant starts "Zoek de grens" around its own value.
    if (this.sweep.variant !== data.active) this.sweep = { ...this.sweep, from: null, to: null, selected: null, variant: data.active };
    const intro = 'Elke variant is een versie van de instellingen. Klik op een kaartje of een tabblad om die variant in de zijbalk aan te passen. '
      + 'Verschillen staan tegenover de referentie (kies een andere met "Gebruik als referentie"). Traag of snel rijden: de marge als de vrouwen traag en de mannen snel rijden, tot omgekeerd.';
    this.el.innerHTML = `
      <div class="cmp-head"><h2 class="cmp-head__title">Vergelijken ${KK.info.button(intro)}</h2></div>
      ${several ? `${this.cardsHtml(data)}${this.daysHtml(data)}${this.tableHtml(data)}`
        : `<div class="card cmp-empty"><p>Er is nog maar één variant. Maak een kopie en verander er iets aan, bijvoorbeeld de starttijd van de vrouwen.</p>
           <button type="button" class="btn btn--primary btn--small" data-action="copy">Kopie van ${esc(variants[0].letter)} toevoegen</button></div>`}
      ${this.sweepHtml(data)}`;
  }

  // ---------- Cards ----------

  cardsHtml({ variants, active, reference }) {
    const esc = KK.Compare.esc, minus = KK.Compare.minus, ref = variants[reference];
    const cards = variants.map(v => {
      const m = v.schedule.margin, s = v.settings, isRef = v.index === reference;
      const worst = v.worst.margin.minutes, best = v.best.margin.minutes;
      const delta = m.minutes - ref.schedule.margin.minutes;
      const deltaText = isRef ? '<span class="cmp-card__ref">Referentie</span>'
        : delta === 0 ? `Zelfde marge als ${ref.letter}`
        : `<span class="${delta > 0 ? 'is-better' : 'is-worse'}">${KK.Compare.signed(delta)} min</span> tegenover ${ref.letter}`;
      const diffs = isRef ? [] : KK.Compare.differences(ref.settings, s);
      const worstStatus = KK.Compare.statusOf(worst, Number(s.marginOk), Number(s.marginWarn));
      const diffList = isRef ? '<li class="is-muted">De andere varianten worden hiermee vergeleken.</li>'
        : diffs.length ? diffs.slice(0, 5).map(d => `<li><span>${esc(d.label)}</span><b>${esc(d.to)}</b><span class="is-muted">${ref.letter}: ${esc(d.from)}</span></li>`).join('')
          + (diffs.length > 5 ? `<li class="is-muted">en nog ${diffs.length - 5} andere</li>` : '')
        : `<li class="is-muted">Zelfde instellingen als ${ref.letter}</li>`;
      return `<article class="cmp-card${v.index === active ? ' is-active' : ''}" data-status="${m.status}">
        <button type="button" class="cmp-card__head" data-action="activate" data-index="${v.index}" aria-pressed="${v.index === active}">
          <span class="vtab__letter">${v.letter}</span><span class="cmp-card__name">${esc(v.label || 'Basis')}</span>
          ${v.index === active ? '<span class="cmp-card__editing">in zijbalk</span>' : ''}
        </button>
        <div class="cmp-card__margin"><b>${minus(m.minutes)} min</b><span class="badge">${KK.Compare.statusText(m)}</span></div>
        <div class="cmp-card__delta">${deltaText}</div>
        ${KK.Compare.rangeBar({ worst, expected: m.minutes, best, ok: Number(s.marginOk), warn: Number(s.marginWarn) })}
        <div class="cmp-card__range${worstStatus !== 'ok' ? ' is-' + worstStatus : ''}">Traag of snel rijden: ${minus(worst)} tot ${minus(best)} min</div>
        <ul class="cmp-card__diffs">${diffList}</ul>
        ${isRef ? '' : `<button type="button" class="link-button" data-action="reference" data-index="${v.index}">Gebruik als referentie</button>`}
      </article>`;
    }).join('');
    return `<div class="cmp-cards" style="--cols:${variants.length}">${cards}</div>`;
  }

  // ---------- The days on one time axis ----------

  daysHtml({ variants, reference }) {
    const { start: axisStart, end: axisEnd } = KK.config.timelineAxis, f = KK.format, esc = KK.Compare.esc;
    const pct = t => ((Math.max(axisStart, Math.min(axisEnd, t)) - axisStart) / (axisEnd - axisStart)) * 100;
    const span = (cls, a, z, title) => (z > a ? `<span class="${cls}" style="left:${pct(a)}%;width:${pct(z) - pct(a)}%" title="${esc(title)}"></span>` : '');
    const ticks = [];
    for (let h = Math.ceil(axisStart / 60); h * 60 <= axisEnd; h++) ticks.push(`<span class="mtl__tick" style="left:${pct(h * 60)}%">${h}u</span>`);
    const refParts = variants[reference].schedule.margin.parts, refLetter = variants[reference].letter;
    const rows = variants.map(v => {
      const lane = key => v.schedule.blocks.filter(b => b.lane === key).map(b =>
        span(`mtl__b mtl__b--${b.type}`, b.start, b.end, `${b.name} ${f.clock(b.start)}-${f.clock(b.end)}`)).join('');
      const w = v.worst.margin.parts, b = v.best.margin.parts, m = v.schedule.margin;
      return `<div class="mtl__row">
        <button type="button" class="mtl__name" data-action="activate" data-index="${v.index}"><span class="vtab__letter">${v.letter}</span><span class="mtl__label">${esc(v.label || 'Basis')}</span></button>
        <div class="mtl__track">
          <div class="mtl__lane">${lane('women')}${span('mtl__unsure mtl__unsure--women', b.womenClear, w.womenClear, `Weg vrij tussen ${f.clock(b.womenClear)} en ${f.clock(w.womenClear)}, naargelang de snelheid`)}</div>
          <div class="mtl__lane">${lane('men')}${span('mtl__unsure mtl__unsure--men', w.menRed, b.menRed, `Weg dicht tussen ${f.clock(w.menRed)} en ${f.clock(b.menRed)}, naargelang de snelheid`)}</div>
          <span class="mtl__line" style="left:${pct(refParts.womenClear)}%" title="Weg vrij bij ${refLetter}"></span>
          <span class="mtl__line" style="left:${pct(refParts.menRed)}%" title="Weg dicht bij ${refLetter}"></span>
        </div>
        <span class="mtl__margin" data-status="${m.status}">${KK.Compare.minus(m.minutes)} min</span>
      </div>`;
    }).join('');
    return `<section class="card cmp-section">
      <div class="card__head"><h3 class="card__title">Dagverloop ${KK.info.button(`Per variant: bovenste rij vrouwen, onderste rij mannen. Gearceerd: waar de weg vrij en dicht kan vallen bij traag of snel rijden. Stippellijnen: weg vrij en dicht bij ${refLetter}, de referentie.`)}</h3></div>
      <div class="card__body mtl">
        <div class="mtl__row mtl__row--axis"><span></span><div class="mtl__axis">${ticks.join('')}</div><span></span></div>
        ${rows}
      </div>
    </section>`;
  }

  // ---------- What changes ----------

  tableHtml({ variants, reference }) {
    const f = KK.format, esc = KK.Compare.esc, minus = KK.Compare.minus, ref = variants[reference];
    const broadcast = (race, end) => v => {
      const b = v.schedule.broadcasts.find(x => x.race === race);
      return b ? (end ? b.end : b.start) : null;
    };
    // kind: margin (more is better, coloured), time (difference in minutes), km.
    const rows = [
      { label: 'Marge, verwacht', kind: 'margin', value: v => v.schedule.margin.minutes, always: true },
      { label: 'Marge, slechtste geval', kind: 'margin', value: v => v.worst.margin.minutes, always: true },
      { label: 'Weg vrij na vrouwen', kind: 'time', value: v => v.schedule.margin.parts.womenClear, always: true },
      { label: 'Weg dicht voor mannen', kind: 'time', value: v => v.schedule.margin.parts.menRed, always: true },
      { label: 'Start vrouwen', kind: 'time', value: v => v.schedule.women.start },
      { label: 'Aankomst vrouwen', kind: 'time', value: v => v.schedule.women.finish },
      { label: 'Start mannen', kind: 'time', value: v => v.schedule.men.start },
      { label: 'Eerste passage mannen', kind: 'time', value: v => v.schedule.men.firstRiderTime },
      { label: 'Aankomst mannen', kind: 'time', value: v => v.schedule.men.finish },
      { label: 'Uitzending vrouwen vanaf', kind: 'time', value: broadcast('women') },
      { label: 'Uitzending mannen tot', kind: 'time', value: broadcast('men', true) },
      { label: 'Afstand vrouwen', kind: 'km', value: v => v.schedule.women.totalKm },
      { label: 'Afstand mannen', kind: 'km', value: v => v.schedule.men.totalKm },
    ];
    const show = { margin: x => `${minus(x)} min`, time: x => f.clock(x), km: x => `${f.km(x)} km` };
    const rounded = (kind, x) => (x == null ? 'geen' : kind === 'km' ? Math.round(x * 10) / 10 : Math.round(x));
    const body = rows.map(row => {
      const values = variants.map(v => row.value(v));
      if (!row.always && new Set(values.map(x => String(rounded(row.kind, x)))).size < 2) return '';
      const refValue = values[reference];
      const cells = variants.map((v, i) => {
        const x = values[i];
        if (x == null) return `<td class="is-muted${i === reference ? ' is-ref' : ''}">geen</td>`;
        let delta = '';
        if (i !== reference && refValue != null) {
          const d = rounded(row.kind, x) - rounded(row.kind, refValue);
          if (row.kind === 'margin' && d) delta = `<span class="cmp-delta ${d > 0 ? 'is-better' : 'is-worse'}">${KK.Compare.signed(d)}</span>`;
          else if (row.kind === 'time' && d) delta = `<span class="cmp-delta">${KK.Compare.signed(d)} min</span>`;
          else if (row.kind === 'km' && Math.abs(d) > 0.05) delta = `<span class="cmp-delta">${minus(d > 0 ? `+${f.km(d)}` : f.km(d))} km</span>`;
        }
        return `<td class="${i === reference ? 'is-ref' : ''}">${show[row.kind](x)}${delta}</td>`;
      }).join('');
      return `<tr><th scope="row">${row.label}</th>${cells}</tr>`;
    }).join('');
    const head = variants.map(v => `<th scope="col"><span class="vtab__letter">${v.letter}</span> ${esc(v.label || 'Basis')}</th>`).join('');
    return `<section class="card cmp-section">
      <div class="card__head"><h3 class="card__title">Wat verandert er</h3><span class="card__hint">Verschil tegenover ${esc(ref.letter)}, de referentie</span></div>
      <div class="card__body cmp-table-wrap"><table class="cmp-table"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>
    </section>`;
  }

  // ---------- Zoek de grens ----------

  /** The value of the setting at sweep position x, as the settings store it. */
  sweepValue(x) {
    const def = KK.Compare.SWEEPS[this.sweep.key];
    if (def.kind === 'time') return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(Math.round(x % 60)).padStart(2, '0')}`;
    return x;
  }

  sweepLabel(x) {
    const def = KK.Compare.SWEEPS[this.sweep.key], f = KK.format;
    if (def.kind === 'time') return f.clock(x);
    if (def.kind === 'speed') return `${f.km(x)} km/u`;
    if (def.kind === 'min') return `${x} min`;
    if (def.kind === 'mss') return KK.Compare.formatSetting('mss', x);
    if (this.sweep.key === 'menLoops') return x === 1 ? '1 lus' : `${x} lussen`;
    return x === 1 ? '1 ronde' : `${x} rondes`;
  }

  /** Runs the setting over its range for the active variant: the expected, worst and best margin per value. */
  computeSweep(settings) {
    const def = KK.Compare.SWEEPS[this.sweep.key], key = this.sweep.key, f = KK.format;
    const current = def.kind === 'time' ? f.parseTime(settings[key]) : Number(settings[key]);
    const snap = x => Math.round(x / def.step) * def.step;
    if (this.sweep.from == null) this.sweep.from = def.from != null ? def.from : snap(current - def.around);
    if (this.sweep.to == null) this.sweep.to = def.to != null ? def.to : snap(current + def.around);
    let from = Math.min(this.sweep.from, this.sweep.to), to = Math.max(this.sweep.from, this.sweep.to);
    if (def.kind === 'time') { from = Math.max(6 * 60, from); to = Math.min(20 * 60, to); }
    if (def.kind === 'speed') { from = Math.max(30, from); to = Math.min(55, to); }
    const count = Math.max(1, Math.min(240, Math.floor((to - from) / def.step + 1e-9) + 1));
    const points = [];
    for (let i = 0; i < count; i++) {
      const x = Math.round((from + i * def.step) * 100) / 100;
      const s = { ...settings, [key]: this.sweepValue(x) };
      // The slow and the fast speed move along with the expected speed, so the range keeps its width.
      if (def.kind === 'speed') {
        const race = key.replace('Speed', '');
        s[`${race}SpeedSlow`] = Number(settings[`${race}SpeedSlow`]) + (x - current);
        s[`${race}SpeedFast`] = Number(settings[`${race}SpeedFast`]) + (x - current);
      }
      const range = KK.computeRange(s);
      points.push({ x, expected: KK.computeSchedule(s).margin.minutes, worst: range.worst.margin.minutes, best: range.best.margin.minutes });
    }
    return { points, current, from, to };
  }

  /** "tot en met 10u05", "vanaf 9u30", "van 9u30 tot 10u05", "over het hele bereik" or "nergens in dit bereik". */
  intervalText(points, test) {
    const runs = [];
    points.forEach((p, i) => {
      if (!test(p)) return;
      if (runs.length && runs[runs.length - 1].end === i - 1) runs[runs.length - 1].end = i;
      else runs.push({ start: i, end: i });
    });
    if (!runs.length) return '<span class="is-worse">nergens in dit bereik</span>';
    const last = points.length - 1, label = i => this.sweepLabel(points[i].x);
    return runs.map(r => {
      if (r.start === 0 && r.end === last) return 'over het hele bereik';
      if (r.start === r.end) return `enkel bij ${label(r.start)}`;
      if (r.start === 0) return `tot en met <b>${label(r.end)}</b>`;
      if (r.end === last) return `vanaf <b>${label(r.start)}</b>`;
      return `van <b>${label(r.start)}</b> tot <b>${label(r.end)}</b>`;
    }).join(' en ');
  }

  sweepHtml({ variants, active, max }) {
    const esc = KK.Compare.esc, minus = KK.Compare.minus, v = variants[active], s = v.settings;
    const def = KK.Compare.SWEEPS[this.sweep.key];
    const { points, current, from, to } = this.computeSweep(s);
    const ok = Number(s.marginOk), warn = Number(s.marginWarn);
    const input = (name, value) => {
      const aria = name === 'from' ? 'Van' : 'Tot';
      if (def.kind === 'time') return `<input type="time" data-sweep="${name}" value="${this.sweepValue(value)}" aria-label="${aria}">`;
      const shown = def.kind === 'mss' ? Math.round(value / 60) : value;
      return `<input type="number" inputmode="decimal" step="${def.kind === 'mss' ? 1 : def.step}" data-sweep="${name}" value="${shown}" aria-label="${aria}">${def.kind === 'mss' ? '<span class="is-muted">min</span>' : ''}`;
    };
    const options = Object.entries(KK.Compare.SWEEPS).map(([key, d]) => `<option value="${key}"${key === this.sweep.key ? ' selected' : ''}>${d.label}</option>`).join('');
    const answer = test => `<td>${this.intervalText(points, p => test(p.expected))}</td><td>${this.intervalText(points, p => test(p.worst))}</td>`;
    const selected = points.find(p => p.x === this.sweep.selected);
    const pick = selected ? `<div class="sweep__pick">
        <p><b>${esc(def.label)} ${esc(this.sweepLabel(selected.x))}</b>: marge verwacht ${minus(selected.expected)} min, naargelang de snelheid ${minus(selected.worst)} tot ${minus(selected.best)} min.</p>
        <div class="sweep__actions">
          <button type="button" class="btn btn--primary btn--small" data-action="apply">Zet in variant ${esc(v.letter)}</button>
          <button type="button" class="btn btn--secondary btn--small" data-action="add-with"${variants.length >= max ? ' disabled title="Maximum aantal varianten bereikt"' : ''}>Als nieuwe variant</button>
        </div>
      </div>` : '<p class="sweep__hint">Klik in de grafiek om een waarde te kiezen en over te nemen in een variant.</p>';
    return `<section class="card cmp-section sweep">
      <div class="card__head"><h3 class="card__title">Zoek de grens ${KK.info.button('Kies een instelling en een bereik. De grafiek toont de marge voor elke waarde, op basis van de actieve variant: de lijn bij de verwachte snelheden, de grijze band van het slechtste tot het beste geval. De tabel zegt tot waar de marge comfortabel blijft of boven de minimummarge.')}</h3><span class="card__hint">Variant ${esc(v.letter)}${v.label ? `: ${esc(v.label)}` : ''}, met één instelling over een bereik</span></div>
      <div class="card__body">
        <div class="sweep__controls">
          <label class="sweep__field">Instelling <select class="field__select" data-sweep="key">${options}</select></label>
          <label class="sweep__field">Van ${input('from', from)}</label>
          <label class="sweep__field">Tot ${input('to', to)}</label>
        </div>
        <table class="cmp-table sweep__answer">
          <thead><tr><th></th><th scope="col">Bij de verwachte snelheden</th><th scope="col">Ook als de vrouwen traag en de mannen snel rijden</th></tr></thead>
          <tbody>
            <tr><th scope="row"><span class="sweep__dotkey" data-status="ok"></span>Comfortabel, minstens ${ok} min</th>${answer(m => m >= ok)}</tr>
            <tr><th scope="row"><span class="sweep__dotkey" data-status="warn"></span>Minstens de minimummarge, ${warn} min</th>${answer(m => m >= warn)}</tr>
          </tbody>
        </table>
        ${this.chartSvg(points, current, ok, warn)}
        <div class="sweep__legend"><span><i class="sweep__key sweep__key--expected"></i>Verwachte snelheden</span><span><i class="sweep__key sweep__key--band"></i>Traag of snel rijden</span><span><i class="sweep__key sweep__key--current"></i>Nu in variant ${esc(v.letter)}</span></div>
        ${pick}
      </div>
    </section>`;
  }

  chartSvg(points, current, ok, warn) {
    // Drawn at the real width, so the text keeps its size on any screen.
    const W = Math.max(320, Math.min(1400, Math.round((this.el.clientWidth || 800) - 38))), H = 240, L = 44, R = 14, T = 16, B = 30;
    if (points.length < 2) return '<p class="sweep__hint">Kies een groter bereik.</p>';
    const esc = KK.Compare.esc, minus = KK.Compare.minus;
    const x0 = points[0].x, x1 = points[points.length - 1].x;
    // The axis shows the part that matters: from a little below zero to a little above the target margin.
    const lo = Math.max(-30, Math.floor((Math.min(0, warn - 10, ...points.map(p => p.worst)) - 5) / 10) * 10);
    const hi = Math.min(Math.ceil((ok + 45) / 10) * 10, Math.ceil((Math.max(ok + 10, ...points.map(p => p.best)) + 5) / 10) * 10);
    const px = x => L + ((x - x0) / (x1 - x0)) * (W - L - R), py = y => T + (1 - (y - lo) / (hi - lo)) * (H - T - B);
    const zone = (cls, a, z) => {
      const top = py(Math.min(hi, z)), bottom = py(Math.max(lo, a));
      return bottom > top ? `<rect class="sweep__zone sweep__zone--${cls}" x="${L}" width="${W - L - R}" y="${top}" height="${bottom - top}"/>` : '';
    };
    const grid = [];
    const stepY = hi - lo > 100 ? 20 : 10;
    for (let y = Math.ceil(lo / stepY) * stepY; y <= hi; y += stepY) grid.push(`<line class="sweep__grid" x1="${L}" x2="${W - R}" y1="${py(y)}" y2="${py(y)}"/><text class="sweep__axis" x="${L - 6}" y="${py(y) + 4}" text-anchor="end">${minus(y)}</text>`);
    const every = Math.max(1, Math.ceil(points.length / Math.max(3, Math.floor((W - L - R) / 80))));
    const xTicks = points.filter((_, i) => i % every === 0)
      .map(p => {
        const x = px(p.x), anchor = x < L + 24 ? 'start' : x > W - R - 24 ? 'end' : 'middle';
        return `<text class="sweep__axis" x="${x}" y="${H - 10}" text-anchor="${anchor}">${esc(this.sweepLabel(p.x))}</text>`;
      }).join('');
    const line = key => points.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(1)},${py(p[key]).toFixed(1)}`).join('');
    const band = `${line('best')}${[...points].reverse().map(p => `L${px(p.x).toFixed(1)},${py(p.worst).toFixed(1)}`).join('')}Z`;
    const half = (W - L - R) / (points.length - 1) / 2;
    const hits = points.map(p => `<rect class="sweep__hit" x="${px(p.x) - half}" y="${T}" width="${half * 2}" height="${H - T - B}" data-action="pick" data-x="${p.x}"><title>${esc(this.sweepLabel(p.x))}: verwacht ${minus(p.expected)} min, ${minus(p.worst)} tot ${minus(p.best)} min</title></rect>`).join('');
    const marker = (x, cls) => (x >= x0 && x <= x1 ? `<line class="${cls}" x1="${px(x)}" x2="${px(x)}" y1="${T}" y2="${H - B}"/>` : '');
    const sel = points.find(p => p.x === this.sweep.selected);
    return `<svg class="sweep__chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Marge per waarde van de gekozen instelling">
      ${zone('bad', lo, warn)}${zone('warn', warn, ok)}${zone('ok', ok, hi)}
      ${grid.join('')}
      <clipPath id="sweep-clip"><rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}"/></clipPath>
      <g clip-path="url(#sweep-clip)">
        <path class="sweep__band" d="${band}"/>
        <path class="sweep__worst" d="${line('worst')}"/>
        <path class="sweep__expected" d="${line('expected')}"/>
      </g>
      ${marker(current, 'sweep__current')}
      ${sel ? `${marker(sel.x, 'sweep__selected')}<circle class="sweep__dot" cx="${px(sel.x)}" cy="${py(Math.max(lo, Math.min(hi, sel.expected)))}" r="4.5"/>` : ''}
      ${xTicks}
      <text class="sweep__axis" x="${L}" y="${T - 3}">marge (min)</text>
      ${hits}
    </svg>`;
  }
};
