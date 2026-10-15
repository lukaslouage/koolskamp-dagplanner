// App controller: state, controls, rendering of cards/tables, theme, playback and export.
(function () {
  const { config, format: f } = KK;
  const $ = id => document.getElementById(id);

  let scenarios = null; // KK.Scenarios, created once the variants are loaded
  let compare = null; // KK.Compare, the comparison view

  // The settings on screen are those of the active variant (A, B or C); see js/variants.js.
  const variants = new KK.Variants({
    full: raw => normalizeSettings(cleanSettings(raw || {})),
    changesOf,
    cleanNameFor: variant => (scenarios ? scenarios.cleanNameFor(variant) : ''),
    scenarios: () => (scenarios ? scenarios.all() : []),
    onChange: () => { saveSettings(); syncInputs(); render(); },
  });

  const state = {
    get settings() { return variants.current.settings; },
    set settings(value) { variants.current.settings = value; },
    selectedTime: null, // null = follow the start of the women's race until someone picks a time
    shownTime: null,
    theme: loadTheme(),
    showQuarterGrid: false,
    playTimer: null,
  };

  const timeline = new KK.Timeline($('timeline-track'), { onSelectTime: t => { state.selectedTime = t; render(); } });
  const routeMap = new KK.RouteMap($('route-map'), KK.routeData);
  const profile = new KK.Profile({ women: $('profile-women'), men: $('profile-men') }, KK.routeData);

  const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** Keeps only known settings with a valid value, so a hand-edited link or old saved data cannot break the page. */
  function cleanSettings(raw) {
    const clean = {};
    Object.entries(config.defaults).forEach(([key, fallback]) => {
      if (!(key in raw)) return;
      const value = raw[key];
      if (typeof fallback === 'boolean') {
        if (value === true || value === 'true') clean[key] = true;
        else if (value === false || value === 'false') clean[key] = false;
      } else if (typeof fallback === 'number') {
        const n = Number(value);
        if (value !== '' && Number.isFinite(n)) clean[key] = n;
      } else if (value === '' || /^\d{1,2}:\d{2}$/.test(String(value))) {
        clean[key] = String(value);
      }
    });
    return clean;
  }

  /** Full settings from cleaned values: defaults filled in, and rules a hand-edited link or file could break put right. */
  function normalizeSettings(clean) {
    const settings = { ...config.defaults, ...clean };
    if (settings.marginWarn > settings.marginOk) settings.marginWarn = settings.marginOk;
    const [arrival, start, end] = ['vipArrival', 'vipMenuStart', 'vipMenuEnd'].map(k => f.parseTime(settings[k]));
    if (start < arrival) settings.vipMenuStart = settings.vipArrival;
    if (end < Math.max(start, arrival)) settings.vipMenuEnd = settings.vipMenuStart;
    ['women', 'men'].forEach(race => keepSpeedRange(settings, race));
    return settings;
  }

  /** The slow speed is never above the expected speed and the fast speed never below it. */
  function keepSpeedRange(settings, race, changed = '') {
    const key = `${race}Speed`, slow = `${race}SpeedSlow`, fast = `${race}SpeedFast`;
    if (changed === slow && settings[slow] > settings[key]) settings[key] = settings[slow];
    if (changed === fast && settings[fast] < settings[key]) settings[key] = settings[fast];
    if (settings[slow] > settings[key]) settings[slow] = settings[key];
    if (settings[fast] < settings[key]) settings[fast] = settings[key];
  }

  /** Only the values of a settings object that differ from the defaults (after cleaning). */
  function changesOf(raw) {
    const settings = normalizeSettings(cleanSettings(raw || {}));
    return Object.fromEntries(Object.entries(settings).filter(([key, value]) => String(value) !== String(config.defaults[key])));
  }

  /**
   * Only settings that differ from the defaults are saved and shared. That keeps links short and means
   * a later change to the defaults reaches everyone, except for the values they changed themselves.
   */
  function changedSettings() {
    return Object.entries(state.settings).filter(([key, value]) => String(value) !== String(config.defaults[key]));
  }

  /** Saves all variants in this browser and puts them in the address bar, so the link always shares them. */
  function saveSettings() {
    variants.persist();
  }

  /** Link with all variants (and the name of a saved scenario they show unchanged). */
  function shareUrl() {
    return variants.url();
  }

  async function shareScenario() {
    const url = new URL(shareUrl(), location.href).href;
    const button = $('share-button');
    try {
      await navigator.clipboard.writeText(url);
      button.querySelector('.btn__label').textContent = 'Link gekopieerd';
    } catch (e) {
      window.prompt('Kopieer deze link:', url);
      return;
    }
    clearTimeout(shareScenario.timer);
    shareScenario.timer = setTimeout(() => { button.querySelector('.btn__label').textContent = 'Deel scenario'; }, 2500);
  }

  function loadTheme() {
    let saved = null;
    try { saved = localStorage.getItem(config.themeStorageKey); } catch (e) { /* storage unavailable */ }
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function setTheme(theme, persist = true) {
    state.theme = theme;
    if (persist) try { localStorage.setItem(config.themeStorageKey, theme); } catch (e) { /* storage unavailable */ }
    render();
  }

  /** Minutes and seconds ("3:30") for a number of seconds, and back. Plain "3" means 3 minutes. Up to 15 minutes. */
  const formatMss = seconds => `${Math.floor(seconds / 60)}:${String(Math.round(seconds) % 60).padStart(2, '0')}`;
  function parseMss(text) {
    const m = String(text).trim().match(/^(\d{1,2})(?::([0-5]?\d))?$/);
    return m ? Math.min(900, Number(m[1]) * 60 + Number(m[2] || 0)) : null;
  }

  function syncInputs() {
    document.querySelectorAll('[data-setting]').forEach(input => {
      const value = state.settings[input.dataset.setting];
      if (input.type === 'checkbox') input.checked = value !== false;
      else if (document.activeElement !== input) input.value = input.dataset.format === 'mss' ? formatMss(value || 0) : (value ?? '');
    });
  }

  function render() {
    const s = state.settings;
    const schedule = KK.computeSchedule(s);
    const range = KK.computeRange(s);
    const { women, men, margin } = schedule;
    const comparing = variants.view === 'compare' && !document.documentElement.classList.contains('is-printing');
    document.querySelector('.page').classList.toggle('is-comparing', comparing);

    document.documentElement.dataset.theme = state.theme;
    document.documentElement.dataset.status = margin.status;
    document.querySelectorAll('[data-theme-choice]').forEach(b => b.classList.toggle('is-active', b.dataset.themeChoice === state.theme));

    const womenBroadcast = s.womenBroadcast !== false;
    $('women-broadcast-field').classList.toggle('is-off', !womenBroadcast);
    $('women-broadcast-field').querySelector('input[type="time"]').disabled = !womenBroadcast;
    document.querySelectorAll('[data-toggle-view]').forEach(button => {
      const shown = s[button.dataset.toggleView] !== false;
      button.setAttribute('aria-pressed', String(shown));
      button.closest('.settings__group').classList.toggle('is-hidden', !shown);
    });
    $('women-broadcast-reset').hidden = !s.womenBroadcastStart;

    $('women-finish').textContent = f.clock(women.finish);
    $('women-finish-detail').textContent = `${f.km(women.totalKm)} km aan ${f.km(women.speed)} km/u, podium tot ${f.clock(women.podiumEnd)}`;
    $('men-finish').textContent = f.clock(men.finish);
    $('men-finish-detail').textContent = `${f.km(men.totalKm)} km aan ${f.km(men.speed)} km/u, podium tot ${f.clock(men.podiumEnd)}`;
    $('men-first-passage').textContent = f.clock(men.firstRiderTime);
    $('men-first-passage-detail').textContent = men.breakaway > 0
      ? `Vroege vlucht, ${formatMss(Math.round(men.breakaway * 60))} voor het peloton (peloton om ${f.clock(men.firstPassageTime)})`
      : `Na ${f.km(men.firstPassageKm)} km. Kruiskalsijde (km ${f.km(men.kruiskalsijdeKm)}) om ${f.clock(men.kruiskalsijdeTime)}`;

    $('margin-value').textContent = `${margin.minutes} min`;
    $('margin-badge').textContent = margin.conflict ? 'Conflict' : { ok: 'Comfortabel', warn: 'Beperkt', bad: 'Onvoldoende' }[margin.status];
    $('margin-detail').textContent = margin.conflict ? 'Vrouwen nog niet klaar als de weg dicht moet voor de mannen' : `Weg vrij ${f.clock(margin.parts.womenClear)}, weer dicht ${f.clock(margin.parts.menRed)}`;
    renderMarginSum(margin, men.firstRiderTime);
    renderMarginRange(margin, range, s);
    variants.renderTabs(variants.list.map((v, i) => (i === variants.active ? margin : KK.computeSchedule(v.settings).margin)));
    const several = variants.list.length > 1;
    $('sidebar-variant').hidden = !several;
    $('sidebar-variant').textContent = several ? variants.letter(variants.active) : '';
    $('sidebar-variant').title = several ? `Je past variant ${variants.fullLabel(variants.active)} aan` : '';

    $('women-total').textContent = `${f.km(women.totalKm)} km`;
    $('men-total').textContent = `${f.km(men.totalKm)} km`;
    $('loop-legend').textContent = `Lus Ardooie, mannen ${men.loops} keer (16 km)`;

    const sporza = schedule.broadcasts.map(b => `${b.race === 'women' ? 'vrouwen' : 'mannen'} ${f.clock(b.start)}`);
    if (!womenBroadcast) sporza.unshift('vrouwen niet');
    const vip = schedule.vip;
    $('print-summary').innerHTML = [
      variants.list.length > 1 && `<b>Variant</b> ${escapeHtml(variants.fullLabel(variants.active))}`,
      scenarios && scenarios.label() && `<b>Scenario</b> ${escapeHtml(scenarios.label())}`,
      `<b>Vrouwen</b> start ${f.clock(women.start)}, ${f.km(women.speed)} km/u (${f.km(range.worst.women.speed)} tot ${f.km(range.best.women.speed)}), ${women.laps} rondes, ${f.km(women.totalKm)} km`,
      `<b>Mannen</b> start ${f.clock(men.start)}, ${f.km(men.speed)} km/u (${f.km(range.best.men.speed)} tot ${f.km(range.worst.men.speed)}), ${men.loops} lussen Ardooie, ${men.laps} rondes, ${f.km(men.totalKm)} km`,
      s.showVip !== false && `<b>VIP</b> aankomst ${f.clock(vip.arrival)}, 3-gangenmenu ${f.clock(vip.menuStart)} tot ${f.clock(vip.menuEnd)}`,
      s.showBroadcast !== false && `<b>Uitzending</b> ${sporza.join(', ')}`,
      `<b>Podium</b> ${Number(s.podiumDuration) || 0} min`,
      `<b>Wegafsluiting</b> vrouwen ${schedule.closures.women.red} min voor, ${schedule.closures.women.green} min na; mannen ${schedule.closures.men.red} min voor, ${schedule.closures.men.green} min na${men.breakaway > 0 ? `, vroege vlucht ${formatMss(Math.round(men.breakaway * 60))}` : ''}`,
    ].filter(Boolean).map(t => `<span>${t}</span>`).join('');
    $('print-link').textContent = new URL(shareUrl(), location.href).href;

    renderPassages($('women-passages'), women.passages);
    renderPassages($('men-passages'), men.passages);

    state.shownTime = state.selectedTime ?? women.start;
    const positions = KK.riderPositions(schedule, state.shownTime);
    if (scenarios) scenarios.update();
    timeline.render(schedule, { selectedTime: state.shownTime, positions, showQuarterGrid: state.showQuarterGrid,
      showBroadcast: s.showBroadcast !== false, showVip: s.showVip !== false,
      // Where the women can be clear and the men's red flag can come, between the best and the worst case.
      range: { womenClear: [range.best.margin.parts.womenClear, range.worst.margin.parts.womenClear],
        menRed: [range.worst.margin.parts.menRed, range.best.margin.parts.menRed] } });
    if (comparing && compare) compare.render();

    $('women-status').textContent = positions.women.label;
    $('women-status-detail').textContent = positions.women.detail;
    $('men-status').textContent = positions.men.label;
    $('men-status-detail').textContent = positions.men.detail;
    $('time-range').value = state.shownTime;
    $('time-value').textContent = f.clock(state.shownTime);
    routeMap.setTheme(state.theme);
    routeMap.setRiders(positions);
    const flags = KK.flagPositions(schedule, state.shownTime);
    routeMap.setFlags(flags);
    profile.render(schedule);
    profile.setRiders(positions);
    profile.setFlags(flags);
  }

  /**
   * The whole sum behind the margin, so nothing has to be guessed: when the women are clear (the later of the end
   * of the podium and the green flag car) and when the road has to be closed for the men (first passage minus the
   * early break-away minus the red flag car). The margin is the difference of the two.
   */
  function renderMarginSum(margin, firstRider) {
    const p = margin.parts, minus = text => String(text).replace('-', '\u2212');
    const row = (label, value, kind = '', title = '') => `<div class="sum__row${kind ? ' sum__row--' + kind : ''}"${title ? ` title="${title}"` : ''}><span>${label}</span><b>${value}</b></div>`;
    const women = [
      row('Aankomst', f.clock(p.womenFinish), 'muted'),
      row(`Groene vlag, +${p.womenGreenMinutes} min`, f.clock(p.womenGreenEnd), 'muted', `Aankomst ${f.clock(p.womenFinish)} + ${p.womenGreenMinutes} min`),
      row(`Podium, +${p.podiumMinutes} min`, f.clock(p.podiumEnd), 'muted', `Aankomst ${f.clock(p.womenFinish)} + podium ${p.podiumMinutes} min`),
      row('Weg vrij vanaf', f.clock(p.womenClear), 'total', 'Het latere van het einde van het podium en de groene vlag'),
    ];
    const men = [
      ...(p.menBreakawaySeconds > 0 ? [
        row('Peloton', f.clock(p.menPeloton), 'muted'),
        row('Vroege vlucht', minus('-' + formatMss(p.menBreakawaySeconds)), 'muted', 'De eerste renners zijn zoveel voor het peloton'),
        row('Eerste passage', f.clock(firstRider), 'sub', 'Peloton min vroege vlucht'),
      ] : [row('Eerste passage', f.clock(firstRider))]),
      row('Rode vlag', minus(`-${p.menRedMinutes} min`), '', 'De rode vlag rijdt zoveel voor de eerste renner'),
      row('Weg dicht vanaf', f.clock(p.menRed), 'total', 'Eerste passage min rode vlag'),
    ];
    $('margin-sum').innerHTML = `
      <div class="sum__group"><div class="sum__title">Vrouwen</div>${women.join('')}</div>
      <div class="sum__group"><div class="sum__title">Mannen</div>${men.join('')}</div>
      <div class="sum__result">${f.clock(p.menRed)} \u2212 ${f.clock(p.womenClear)} = <b>${minus(margin.minutes)} min</b></div>`;
  }

  /** The margin when the women ride slow and the men fast (worst) or the other way round (best), as a bar. */
  function renderMarginRange(margin, range, s) {
    const worst = range.worst.margin.minutes, best = range.best.margin.minutes;
    const ok = Number(s.marginOk), warn = Number(s.marginWarn), minus = KK.Compare.minus;
    const worstStatus = KK.Compare.statusOf(worst, ok, warn);
    const warning = worstStatus === 'bad' ? 'Slechtste geval onder de minimummarge' : '';
    $('margin-range').innerHTML = `${KK.Compare.rangeBar({ worst, expected: margin.minutes, best, ok, warn, compact: true })}
      <div class="mrange__text is-bad"${warning ? '' : ' hidden'}>${warning}</div>`;
    $('margin-range').title = `Vrouwen ${f.km(range.worst.women.speed)} km/u en mannen ${f.km(range.worst.men.speed)} km/u geeft ${minus(worst)} min; vrouwen ${f.km(range.best.women.speed)} en mannen ${f.km(range.best.men.speed)} km/u geeft ${minus(best)} min`;
  }

  function renderPassages(tbody, passages) {
    tbody.innerHTML = passages.map(p =>
      `<tr${p.key ? ' class="is-key"' : ''}><td>${p.label}</td><td>${f.km(p.km)}</td><td>${f.clock(p.time)}</td></tr>`).join('');
  }

  function togglePlayback() {
    const { start, end } = config.timelineAxis;
    const button = $('play-button');
    if (state.playTimer) {
      clearInterval(state.playTimer);
      state.playTimer = null;
      button.textContent = 'Afspelen';
      return;
    }
    state.selectedTime = state.shownTime >= end ? start : state.shownTime;
    button.textContent = 'Pauze';
    state.playTimer = setInterval(() => {
      if (state.selectedTime >= end) return togglePlayback();
      state.selectedTime += 1;
      render();
    }, 60);
  }

  // Printing: the 'is-printing' class gives the map its print size on screen too, so the snapshot fits the paper.
  function startPrintLayout() {
    document.documentElement.classList.add('is-printing');
    fitPrintWidth();
  }

  /**
   * Page 1 (everything above the map) should fill an A4 landscape page in both directions. Its height follows
   * from its width, so the width is adjusted a few times until the page has the A4 shape (279 x 192 mm).
   * The timeline is always horizontal on paper, so render() runs after every change of width.
   */
  function fitPrintWidth() {
    const root = document.documentElement, page = document.querySelector('.page'), detail = document.querySelector('.detail');
    const A4 = 279 / 192;
    let width = 1230;
    for (let i = 0; i < 4; i++) {
      root.style.setProperty('--print-w', width);
      render();
      const height = detail.getBoundingClientRect().top - page.getBoundingClientRect().top;
      const wanted = Math.max(1100, Math.min(1400, Math.round(height * A4)));
      if (Math.abs(wanted - width) < 8) break;
      width = wanted;
    }
    root.style.setProperty('--print-w', width);
    render();
  }

  function endPrintLayout() {
    document.documentElement.classList.remove('is-printing');
    document.documentElement.style.removeProperty('--print-w');
    routeMap.refreshSize();
    render();
  }

  /**
   * Builds the PDF in the browser and shows it in a new tab. The tab is opened first, straight in the click,
   * so the browser does not block it; if that fails the PDF is downloaded. An overlay hides the print layout
   * while the PDF is being made.
   */
  async function exportPdf() {
    if (state.exporting) return;
    const tab = KK.pdfExport.openWaitingTab();
    const previousTheme = state.theme;
    const button = $('export-button');
    state.exporting = true;
    button.disabled = true;
    $('export-overlay').hidden = false;
    try {
      setTheme('light', false);
      startPrintLayout();
      await routeMap.snapshotForPrint(true);
      const pdf = await KK.pdfExport.build(document.querySelector('.page'), document.querySelector('.detail'));
      KK.pdfExport.show(pdf, tab, 'koolskamp-dagplanner.pdf');
    } catch (e) {
      if (tab) tab.close();
      window.alert('De PDF kon niet gemaakt worden. Controleer je internetverbinding en probeer opnieuw.');
    } finally {
      endPrintLayout();
      setTheme(previousTheme, false);
      $('export-overlay').hidden = true;
      button.disabled = false;
      state.exporting = false;
    }
  }

  // Cmd+P / Ctrl+P without the export button.
  window.addEventListener('beforeprint', () => { if (!state.exporting) { startPrintLayout(); routeMap.snapshotForPrint(false); } });
  window.addEventListener('afterprint', () => { if (!state.exporting) endPrintLayout(); });

  // Wiring
  /** Reads an input into the settings. Empty or half-typed numbers are ignored until they are valid. */
  const VIP_TIMES = ['vipArrival', 'vipMenuStart', 'vipMenuEnd'];
  const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  /** Arrival, menu start and menu end stay in that order: the field that was just changed pushes the others along. */
  function keepVipTimesInOrder(changed) {
    const s = state.settings;
    let [arrival, start, end] = VIP_TIMES.map(k => f.parseTime(s[k]));
    if (changed === 'vipArrival') { start = Math.max(start, arrival); end = Math.max(end, start); }
    else if (changed === 'vipMenuStart') { arrival = Math.min(arrival, start); end = Math.max(end, start); }
    else { start = Math.min(start, end); arrival = Math.min(arrival, start); }
    [s.vipArrival, s.vipMenuStart, s.vipMenuEnd] = [hhmm(arrival), hhmm(start), hhmm(end)];
    syncInputs();
  }

  function readInput(input, final = false) {
    const key = input.dataset.setting;
    if (input.type === 'checkbox') state.settings[key] = input.checked;
    else if (input.dataset.format === 'mss') {
      const seconds = parseMss(input.value);
      if (seconds === null) { if (final) input.value = formatMss(state.settings[key] || 0); return; }
      state.settings[key] = seconds;
      if (final) input.value = formatMss(seconds);
    } else if (input.type === 'number') {
      const n = Number(input.value);
      if (input.value === '' || !Number.isFinite(n)) return;
      state.settings[key] = n;
    } else {
      // A time field that is being edited reports in-between values (typing "1" as the hour gives 01:00, an
      // emptied field gives ''). An empty time is ignored; only the automatic broadcast start may be empty.
      if (input.value === '' && key !== 'womenBroadcastStart') { if (final) input.value = state.settings[key]; return; }
      state.settings[key] = input.value;
    }
    // The target margin never drops below the minimum margin, and the VIP times stay in order. Only checked
    // once the value is final (field left or a stepper click), so typing "45" does not first push the other
    // field to 4, and typing the hour of 14:00 does not first push the other times to 01:00.
    if (final && VIP_TIMES.includes(key)) keepVipTimesInOrder(key);
    const speedRace = (key.match(/^(women|men)Speed/) || [])[1];
    if (final && speedRace) { keepSpeedRange(state.settings, speedRace, key); syncInputs(); }
    if (final && state.settings.marginWarn > state.settings.marginOk) {
      if (key === 'marginOk') state.settings.marginWarn = state.settings.marginOk;
      else if (key === 'marginWarn') state.settings.marginOk = state.settings.marginWarn;
      syncInputs();
    }
    saveSettings();
    render();
  }

  /** Keeps a number within its min and max and on its step, e.g. a speed of 40,3 becomes 40,5. */
  function clampToInput(input, value) {
    const min = Number(input.min), max = Number(input.max), step = Number(input.step) || 1;
    const rounded = Math.round((value - min) / step) * step + min;
    return Math.max(min, Math.min(max, Number(rounded.toFixed(2))));
  }

  document.querySelectorAll('[data-setting]').forEach(input => {
    input.addEventListener(input.type === 'checkbox' ? 'change' : 'input', () => readInput(input));
    if (input.type === 'time' || input.dataset.format === 'mss') input.addEventListener('blur', () => readInput(input, true)); // not 'change': that fires on every typed digit
    if (input.type === 'number') input.addEventListener('change', () => {
      const n = Number(input.value);
      input.value = clampToInput(input, Number.isFinite(n) && input.value !== '' ? n : state.settings[input.dataset.setting]);
      readInput(input, true);
    });
  });
  document.querySelectorAll('[data-step-for]').forEach(button => button.addEventListener('click', () => {
    const input = document.querySelector(`[data-setting="${button.dataset.stepFor}"]`);
    if (input.dataset.format === 'mss') {
      input.value = formatMss(Math.max(0, Math.min(900, Number(state.settings[input.dataset.setting] || 0) + Number(button.dataset.step))));
    } else input.value = clampToInput(input, Number(state.settings[input.dataset.setting]) + Number(button.dataset.step));
    readInput(input, true);
  }));
  document.querySelectorAll('[data-toggle-view]').forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.toggleView;
    state.settings[key] = state.settings[key] === false;
    saveSettings(); render();
  }));
  $('women-broadcast-reset').addEventListener('click', e => {
    e.preventDefault();
    state.settings.womenBroadcastStart = '';
    saveSettings(); syncInputs(); render();
  });
  const shell = document.querySelector('.shell'), sidebarToggle = $('sidebar-toggle');
  function setSidebarCollapsed(collapsed, save = true) {
    shell.classList.toggle('is-collapsed', collapsed);
    sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
    const label = collapsed ? 'Instellingen uitklappen' : 'Instellingen inklappen';
    sidebarToggle.title = label;
    sidebarToggle.setAttribute('aria-label', label);
    if (save) try { localStorage.setItem(config.sidebarStorageKey, collapsed ? '1' : '0'); } catch (e) { /* storage unavailable */ }
  }
  try { setSidebarCollapsed(localStorage.getItem(config.sidebarStorageKey) === '1', false); } catch (e) { /* storage unavailable */ }
  sidebarToggle.addEventListener('click', () => setSidebarCollapsed(!shell.classList.contains('is-collapsed')));
  $('reset-button').addEventListener('click', () => {
    state.settings = { ...config.defaults };
    state.selectedTime = null;
    saveSettings(); syncInputs(); render();
  });
  document.querySelectorAll('[data-theme-choice]').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.themeChoice)));
  $('time-range').addEventListener('input', e => { state.selectedTime = Number(e.target.value); render(); });
  $('play-button').addEventListener('click', togglePlayback);
  $('export-button').addEventListener('click', exportPdf);
  $('share-button').addEventListener('click', shareScenario);
  window.addEventListener('hashchange', () => {
    if (location.hash.slice(1) === variants.hash()) return; // our own update of the address bar
    variants.reloadFromHash();
    variants.resolveLinkScenarios(scenarios);
    saveSettings(); syncInputs(); render();
  });

  /** Puts a set of settings (changes only) on screen, as if they were typed in. */
  function applySettings(changes) {
    state.settings = normalizeSettings(cleanSettings(changes));
    saveSettings(); syncInputs(); render();
  }
  scenarios = new KK.Scenarios({
    current: () => Object.fromEntries(changedSettings()),
    changesOf,
    apply: applySettings,
    onChange: () => { saveSettings(); render(); },
    binding: () => variants.current,
  });
  variants.resolveLinkScenarios(scenarios);

  /** Sets one setting of a settings object; an expected speed takes its slow and fast speed along. */
  function withSetting(settings, key, value) {
    const next = { ...settings, [key]: value };
    const race = (key.match(/^(women|men)Speed$/) || [])[1];
    if (race) {
      const shift = Number(value) - Number(settings[key]);
      next[`${race}SpeedSlow`] = Number(settings[`${race}SpeedSlow`]) + shift;
      next[`${race}SpeedFast`] = Number(settings[`${race}SpeedFast`]) + shift;
    }
    return normalizeSettings(cleanSettings(next));
  }
  const changed = () => { saveSettings(); syncInputs(); render(); };
  compare = new KK.Compare($('compare-view'), {
    data: () => ({
      variants: variants.list.map((v, index) => {
        const range = KK.computeRange(v.settings);
        return { index, letter: variants.letter(index), label: variants.label(index), settings: v.settings,
          schedule: KK.computeSchedule(v.settings), worst: range.worst, best: range.best };
      }),
      active: variants.active, reference: variants.reference, max: variants.max,
    }),
    activate: index => { variants.active = index; changed(); },
    setReference: index => { variants.reference = index; changed(); },
    apply: (key, value) => { state.settings = withSetting(state.settings, key, value); changed(); },
    addWith: (key, value) => { if (variants.add(changesOf(withSetting(state.settings, key, value)))) changed(); },
    addCopy: () => { if (variants.add(changesOf(state.settings))) changed(); },
  });
  $('compare-button').addEventListener('click', () => { variants.view = 'compare'; changed(); window.scrollTo({ top: 0 }); });

  syncInputs();
  saveSettings();
  render();
})();
