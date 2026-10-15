// App controller: state, controls, rendering of cards/tables, theme, playback and export.
(function () {
  const { config, format: f } = KK;
  const $ = id => document.getElementById(id);

  const state = {
    settings: loadSettings(),
    selectedTime: null, // null = follow the start of the women's race until someone picks a time
    shownTime: null,
    theme: loadTheme(),
    showQuarterGrid: false,
    playTimer: null,
  };

  const timeline = new KK.Timeline($('timeline-track'), { onSelectTime: t => { state.selectedTime = t; render(); } });
  const routeMap = new KK.RouteMap($('route-map'), KK.routeData);
  const profile = new KK.Profile({ women: $('profile-women'), men: $('profile-men') }, KK.routeData);

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

  /** Settings in the link (#womenSpeed=38&...) win over saved settings, so a shared scenario opens exactly as sent. */
  function loadSettings() {
    const fromLink = cleanSettings(Object.fromEntries(new URLSearchParams(location.hash.slice(1))));
    let saved = {};
    try { saved = cleanSettings(JSON.parse(localStorage.getItem(config.storageKey) || '{}')); } catch (e) { /* storage unavailable */ }
    const settings = { ...config.defaults, ...(Object.keys(fromLink).length ? fromLink : saved) };
    if (settings.marginWarn > settings.marginOk) settings.marginWarn = settings.marginOk; // hand-edited link
    const [arrival, start, end] = ['vipArrival', 'vipMenuStart', 'vipMenuEnd'].map(k => f.parseTime(settings[k]));
    if (start < arrival) settings.vipMenuStart = settings.vipArrival;
    if (end < Math.max(start, arrival)) settings.vipMenuEnd = settings.vipMenuStart;
    return settings;
  }

  /**
   * Only settings that differ from the defaults are saved and shared. That keeps links short and means
   * a later change to the defaults reaches everyone, except for the values they changed themselves.
   */
  function changedSettings() {
    return Object.entries(state.settings).filter(([key, value]) => String(value) !== String(config.defaults[key]));
  }

  function saveSettings() {
    try { localStorage.setItem(config.storageKey, JSON.stringify(Object.fromEntries(changedSettings()))); } catch (e) { /* storage unavailable */ }
    history.replaceState(null, '', shareUrl());
  }

  /** Link to the current scenario. */
  function shareUrl() {
    const hash = new URLSearchParams(changedSettings()).toString();
    return location.pathname + location.search + (hash ? '#' + hash : '');
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
    const { women, men, margin } = schedule;

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
    $('women-broadcast-auto').hidden = !!s.womenBroadcastStart;
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
    renderMarginSum(margin);

    $('women-total').textContent = `${f.km(women.totalKm)} km`;
    $('men-total').textContent = `${f.km(men.totalKm)} km`;
    $('loop-legend').textContent = `Lus Ardooie, mannen ${men.loops} keer (16 km)`;

    const sporza = schedule.broadcasts.map(b => `${b.race === 'women' ? 'vrouwen' : 'mannen'} ${f.clock(b.start)}`);
    if (!womenBroadcast) sporza.unshift('vrouwen niet');
    const vip = schedule.vip;
    $('print-summary').innerHTML = [
      `<b>Vrouwen</b> start ${f.clock(women.start)}, ${f.km(women.speed)} km/u, ${women.laps} rondes, ${f.km(women.totalKm)} km`,
      `<b>Mannen</b> start ${f.clock(men.start)}, ${f.km(men.speed)} km/u, ${men.loops} lussen Ardooie, ${men.laps} rondes, ${f.km(men.totalKm)} km`,
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
    timeline.render(schedule, { selectedTime: state.shownTime, positions, showQuarterGrid: state.showQuarterGrid,
      showBroadcast: s.showBroadcast !== false, showVip: s.showVip !== false });

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
  function renderMarginSum(margin) {
    const p = margin.parts, minus = text => String(text).replace('-', '\u2212');
    const row = (label, value, kind = '', title = '') => `<div class="sum__row${kind ? ' sum__row--' + kind : ''}"${title ? ` title="${title}"` : ''}><span>${label}</span><b>${value}</b></div>`;
    const women = [
      row('Aankomst', f.clock(p.womenFinish), 'muted'),
      row(`Groene vlag, +${p.womenGreenMinutes} min`, f.clock(p.womenGreenEnd), 'muted', `Aankomst ${f.clock(p.womenFinish)} + ${p.womenGreenMinutes} min`),
      row(`Podium, +${p.podiumMinutes} min`, f.clock(p.podiumEnd), 'muted', `Aankomst ${f.clock(p.womenFinish)} + podium ${p.podiumMinutes} min`),
      row('Weg vrij vanaf', f.clock(p.womenClear), 'total', 'Het latere van het einde van het podium en de groene vlag'),
    ];
    const men = [
      row('Eerste passage', f.clock(p.menPeloton), p.menBreakawaySeconds > 0 ? 'muted' : ''),
      ...(p.menBreakawaySeconds > 0 ? [row('Vroege vlucht', minus('-' + formatMss(p.menBreakawaySeconds)), '', 'De eerste renners zijn zoveel voor het peloton')] : []),
      row('Rode vlag', minus(`-${p.menRedMinutes} min`), '', 'De rode vlag rijdt zoveel voor de eerste renner'),
      row('Weg dicht vanaf', f.clock(p.menRed), 'total', 'Eerste passage min vroege vlucht min rode vlag'),
    ];
    $('margin-sum').innerHTML = `
      <div class="sum__group"><div class="sum__title">Vrouwen</div>${women.join('')}</div>
      <div class="sum__group"><div class="sum__title">Mannen</div>${men.join('')}</div>
      <div class="sum__result">${f.clock(p.menRed)} \u2212 ${f.clock(p.womenClear)} = <b>${minus(margin.minutes)} min</b></div>`;
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
  window.addEventListener('hashchange', () => { state.settings = loadSettings(); saveSettings(); syncInputs(); render(); });

  syncInputs();
  saveSettings();
  render();
})();
