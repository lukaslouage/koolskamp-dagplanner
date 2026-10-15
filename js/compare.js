// Comparison of up to three scenarios side by side: key figures, the settings that differ and a small day overview.
window.KK = window.KK || {};

KK.Compare = class {
  static COLUMNS = 3;

  // Settings shown in "Instellingen die verschillen", in sidebar order. View-only settings (the eyes) are left out.
  static SETTINGS = [
    ['womenStart', 'Start vrouwen', 'time'], ['womenIntroDuration', 'Ploegvoorstelling vrouwen', 'min'],
    ['womenSpeed', 'Snelheid vrouwen', 'speed'], ['womenLaps', 'Lokale rondes vrouwen', 'count'],
    ['menStart', 'Start mannen', 'time'], ['menIntroDuration', 'Ploegvoorstelling mannen', 'min'],
    ['menSpeed', 'Snelheid mannen', 'speed'], ['menLoops', 'Lussen Ardooie', 'count'], ['menLaps', 'Lokale rondes mannen', 'count'],
    ['menBreakaway', 'Vroege vlucht', 'mss'],
    ['womenRedFlag', 'Rode vlag vrouwen', 'min'], ['womenGreenFlag', 'Groene vlag vrouwen', 'min'],
    ['menRedFlag', 'Rode vlag mannen', 'min'], ['menGreenFlag', 'Groene vlag mannen', 'min'],
    ['podiumDuration', 'Podiumduur', 'min'], ['marginOk', 'Streefmarge', 'min'], ['marginWarn', 'Minimummarge', 'min'],
    ['womenBroadcast', 'Uitzending vrouwen', 'onoff'], ['womenBroadcastStart', 'Uitzending vrouwen vanaf', 'autotime'],
    ['menBroadcastStart', 'Uitzending mannen vanaf', 'time'],
    ['vipArrival', 'Aankomst VIP-gasten', 'time'], ['vipMenuStart', 'Menu start', 'time'], ['vipMenuEnd', 'Menu klaar', 'time'],
  ];

  /**
   * hooks: current() = { name, settings } of what is on screen, scenarios() = saved scenarios [{ id, name, settings }],
   * full(changes) = complete settings object, activeId() = id of the open scenario, open(id) = open a saved scenario.
   */
  constructor(dialog, hooks) {
    this.dialog = dialog;
    this.body = dialog.querySelector('.compare__body');
    this.hooks = hooks;
    this.choice = null;
    dialog.querySelector('.compare__close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); }); // click on the backdrop
    this.body.addEventListener('change', e => {
      const select = e.target.closest('[data-column]');
      if (!select) return;
      this.choice[Number(select.dataset.column)] = select.value;
      this.render();
    });
    this.body.addEventListener('click', e => {
      const button = e.target.closest('[data-open]');
      if (!button) return;
      dialog.close();
      this.hooks.open(button.dataset.open);
    });
  }

  show() {
    const saved = this.hooks.scenarios(), active = this.hooks.activeId();
    const known = id => id === 'current' || id === 'default' || saved.some(s => s.id === id);
    if (!this.choice || !this.choice.every(id => !id || known(id))) {
      const others = saved.filter(s => s.id !== active).map(s => s.id);
      this.choice = ['current', others[0] || 'default', others[1] || ''];
    }
    this.render();
    if (typeof this.dialog.showModal === 'function') this.dialog.showModal(); else this.dialog.setAttribute('open', '');
  }

  /** The scenario behind a column choice, with its schedule. */
  source(id) {
    if (!id) return null;
    let name, changes, savedId = null;
    if (id === 'current') ({ name, settings: changes } = this.hooks.current());
    else if (id === 'default') { name = 'Standaardwaarden'; changes = {}; }
    else {
      const s = this.hooks.scenarios().find(x => x.id === id);
      if (!s) return null;
      name = s.name; changes = s.settings; savedId = s.id;
    }
    const settings = this.hooks.full(changes);
    return { id, name, savedId, settings, schedule: KK.computeSchedule(settings) };
  }

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

  /** Key figures, top to bottom. Each row: label and a function that returns the text for one schedule. */
  static figures() {
    const f = KK.format;
    const broadcast = race => s => {
      const b = s.schedule.broadcasts.find(x => x.race === race);
      return b ? `${f.clock(b.start)}-${f.clock(b.end)}` : 'geen';
    };
    return [
      { label: 'Marge', html: s => {
        const m = s.schedule.margin;
        const status = m.conflict ? 'Conflict' : { ok: 'Comfortabel', warn: 'Beperkt', bad: 'Onvoldoende' }[m.status];
        return { text: `${m.minutes} min`, html: `<span class="compare__margin" data-status="${m.status}"><b>${m.minutes} min</b><span class="badge">${status}</span></span>` };
      }, main: true },
      { label: 'Weg vrij na vrouwen', get: s => f.clock(s.schedule.margin.parts.womenClear) },
      { label: 'Weg dicht voor mannen', get: s => f.clock(s.schedule.margin.parts.menRed) },
      { group: 'Vrouwen' },
      { label: 'Start', get: s => f.clock(s.schedule.women.start) },
      { label: 'Aankomst', get: s => f.clock(s.schedule.women.finish) },
      { label: 'Afstand', get: s => `${f.km(s.schedule.women.totalKm)} km` },
      { label: 'Uitzending', get: broadcast('women') },
      { group: 'Mannen' },
      { label: 'Start', get: s => f.clock(s.schedule.men.start) },
      { label: 'Eerste passage', get: s => f.clock(s.schedule.men.firstRiderTime) },
      { label: 'Aankomst', get: s => f.clock(s.schedule.men.finish) },
      { label: 'Afstand', get: s => `${f.km(s.schedule.men.totalKm)} km` },
      { label: 'Uitzending', get: broadcast('men') },
    ];
  }

  render() {
    const saved = this.hooks.scenarios(), current = this.hooks.current();
    const esc = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const sources = this.choice.map(id => this.source(id));
    const shown = sources.filter(Boolean);

    const selectFor = (column, value) => {
      const options = [
        ['current', `Op het scherm${current.name ? `: ${current.name}` : ''}`],
        ['default', 'Standaardwaarden'],
        ...saved.map(s => [s.id, s.name]),
        ...(column > 0 ? [['', 'Geen']] : []),
      ];
      return `<select class="compare__select" data-column="${column}" aria-label="Scenario kolom ${column + 1}">${options
        .map(([v, t]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    };
    const head = this.choice.map((id, i) => {
      const s = sources[i];
      const open = s && s.savedId && s.savedId !== this.hooks.activeId()
        ? `<button type="button" class="link-button" data-open="${esc(s.savedId)}">Openen</button>` : '';
      return `<th scope="col">${selectFor(i, id)}${open}</th>`;
    }).join('');

    // A cell is marked when it differs from the first column that shows a scenario.
    const row = (label, values, extra = '') => {
      const base = values.find(v => v !== null);
      const cells = values.map(v => v === null ? '<td class="is-empty"></td>'
        : `<td class="${shown.length > 1 && v.text !== base.text ? 'is-diff' : ''}">${v.html || esc(v.text)}</td>`).join('');
      return `<tr${extra}><th scope="row">${label}</th>${cells}</tr>`;
    };
    const figureRows = KK.Compare.figures().map(fig => {
      if (fig.group) return `<tr class="compare__group"><th scope="rowgroup" colspan="${KK.Compare.COLUMNS + 1}">${fig.group}</th></tr>`;
      const values = sources.map(s => !s ? null : fig.html ? fig.html(s) : { text: fig.get(s) });
      return row(fig.label, values, fig.main ? ' class="compare__main"' : '');
    }).join('');

    const settingRows = KK.Compare.SETTINGS.filter(([key]) => new Set(shown.map(s => String(s.settings[key]))).size > 1)
      .map(([key, label, kind]) => row(label, sources.map(s => s ? { text: KK.Compare.formatSetting(kind, s.settings[key]) } : null))).join('');
    const settingsBlock = shown.length < 2 ? ''
      : `<tr class="compare__group"><th scope="rowgroup" colspan="${KK.Compare.COLUMNS + 1}">Instellingen die verschillen</th></tr>${settingRows
        || `<tr><td class="compare__none" colspan="${KK.Compare.COLUMNS + 1}">Geen: de instellingen zijn gelijk.</td></tr>`}`;

    this.body.innerHTML = `
      <div class="compare__scroll">
        <table class="compare__table">
          <thead><tr><th scope="col"><span class="visually-hidden">Gegevens</span></th>${head}</tr></thead>
          <tbody>${figureRows}${settingsBlock}</tbody>
        </table>
      </div>
      ${this.dayHtml(shown, esc)}
      <p class="compare__note">Een gemarkeerde waarde verschilt van de eerste kolom. Opgeslagen scenario's staan enkel in deze browser; gebruik "Exporteren" om ze door te geven.</p>`;
  }

  /** A small day overview per scenario on one time axis: both races and the margin between them. */
  dayHtml(shown, esc) {
    if (!shown.length) return '';
    const { start: axisStart, end: axisEnd } = KK.config.timelineAxis;
    const pct = t => ((Math.max(axisStart, Math.min(axisEnd, t)) - axisStart) / (axisEnd - axisStart)) * 100;
    const bar = (cls, a, z, title) => z > a ? `<span class="day__bar ${cls}" style="left:${pct(a)}%;width:${pct(z) - pct(a)}%" title="${esc(title)}"></span>` : '';
    const f = KK.format;
    const ticks = [];
    for (let h = Math.ceil(axisStart / 60); h * 60 <= axisEnd; h++) ticks.push(`<span class="day__tick" style="left:${pct(h * 60)}%">${h}u</span>`);
    const rows = shown.map(s => {
      const { women, men, margin } = s.schedule, set = s.settings;
      const p = margin.parts;
      const marginBar = margin.conflict
        ? bar('day__bar--conflict', p.menRed, p.womenClear, `Conflict ${-margin.minutes} min`)
        : bar('day__bar--margin', p.womenClear, p.menRed, `Marge ${margin.minutes} min`);
      return `<div class="day__row">
        <div class="day__name">${esc(s.name)}</div>
        <div class="day__track" data-status="${margin.status}">
          <div class="day__lane">${bar('day__bar--women-intro', women.start - Number(set.womenIntroDuration || 0), women.start, 'Ploegvoorstelling vrouwen')}${bar('day__bar--women', women.start, women.finish, `Vrouwen ${f.clock(women.start)}-${f.clock(women.finish)}`)}${bar('day__bar--women-podium', women.finish, women.podiumEnd, 'Podium vrouwen')}${marginBar}</div>
          <div class="day__lane">${bar('day__bar--men-intro', men.start - Number(set.menIntroDuration || 0), men.start, 'Ploegvoorstelling mannen')}${bar('day__bar--men', men.start, men.finish, `Mannen ${f.clock(men.start)}-${f.clock(men.finish)}`)}${bar('day__bar--men-podium', men.finish, men.podiumEnd, 'Podium mannen')}<span class="day__mark" style="left:${pct(men.firstRiderTime)}%" title="Eerste passage mannen ${f.clock(men.firstRiderTime)}"></span></div>
        </div>
      </div>`;
    }).join('');
    return `<div class="day">
      <div class="day__title">Dagverloop</div>
      <div class="day__row day__row--axis"><div class="day__name"></div><div class="day__axis">${ticks.join('')}</div></div>
      ${rows}
    </div>`;
  }
};
