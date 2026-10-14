// App controller: state, controls, rendering of cards/tables, theme, playback and export.
(function () {
  const { config, format: f } = KK;
  const $ = id => document.getElementById(id);

  const state = {
    settings: loadSettings(),
    selectedTime: config.defaultSelectedTime,
    theme: loadTheme(),
    showQuarterGrid: false,
    playTimer: null,
  };

  const timeline = new KK.Timeline($('timeline-track'), { onSelectTime: t => { state.selectedTime = t; render(); } });
  const routeMap = new KK.RouteMap($('route-map'), KK.routeData);

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

  function syncInputs() {
    document.querySelectorAll('[data-setting]').forEach(input => {
      const value = state.settings[input.dataset.setting];
      if (input.type === 'checkbox') input.checked = value !== false;
      else if (document.activeElement !== input) input.value = value ?? '';
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
    $('women-broadcast-legend').hidden = !womenBroadcast;
    $('women-broadcast-auto').hidden = !!s.womenBroadcastStart;
    $('women-broadcast-reset').hidden = !s.womenBroadcastStart;

    $('women-finish').textContent = f.clock(women.finish);
    $('women-finish-detail').textContent = `${f.km(women.totalKm)} km aan ${f.km(women.speed)} km/u, podium tot ${f.clock(women.podiumEnd)}`;
    $('men-finish').textContent = f.clock(men.finish);
    $('men-finish-detail').textContent = `${f.km(men.totalKm)} km aan ${f.km(men.speed)} km/u, podium tot ${f.clock(men.podiumEnd)}`;
    $('men-first-passage').textContent = f.clock(men.firstPassageTime);
    $('men-first-passage-detail').textContent = `Na ${f.km(men.firstPassageKm)} km. Kruiskalsijde (km ${f.km(men.kruiskalsijdeKm)}) om ${f.clock(men.kruiskalsijdeTime)}`;

    $('margin-value').textContent = `${margin.minutes} min`;
    $('margin-badge').textContent = margin.conflict ? 'Conflict' : { ok: 'Comfortabel', warn: 'Beperkt', bad: 'Onvoldoende' }[margin.status];
    $('margin-detail').textContent = margin.conflict ? 'Omloop niet vrij voor de mannen'
      : `Omloop vrij van ${f.clock(margin.from)} tot ${f.clock(margin.to)}`;

    $('women-total').textContent = `${f.km(women.totalKm)} km`;
    $('men-total').textContent = `${f.km(men.totalKm)} km`;
    $('loop-legend').textContent = `Lus Ardooie, mannen ${men.loops} keer (16 km)`;

    const sporza = schedule.broadcasts.map(b => `${b.race === 'women' ? 'vrouwen' : 'mannen'} ${f.clock(b.start)}`);
    if (!womenBroadcast) sporza.unshift('vrouwen niet');
    const vip = schedule.vip;
    $('print-summary').innerHTML = [
      `<b>Vrouwen</b> start ${f.clock(women.start)}, ${f.km(women.speed)} km/u, ${women.laps} rondes, ${f.km(women.totalKm)} km`,
      `<b>Mannen</b> start ${f.clock(men.start)}, ${f.km(men.speed)} km/u, ${men.loops} lussen Ardooie, ${men.laps} rondes, ${f.km(men.totalKm)} km`,
      `<b>VIP</b> aankomst ${f.clock(vip.arrival)}, 3-gangenmenu ${f.clock(vip.menuStart)} tot ${f.clock(vip.menuEnd)}`,
      `<b>Uitzending</b> ${sporza.join(', ')}`,
      `<b>Podium</b> ${Number(s.podiumDuration) || 0} min`,
    ].map(t => `<span>${t}</span>`).join('');
    $('print-link').textContent = new URL(shareUrl(), location.href).href;

    renderPassages($('women-passages'), women.passages);
    renderPassages($('men-passages'), men.passages);

    timeline.render(schedule, { selectedTime: state.selectedTime, showQuarterGrid: state.showQuarterGrid });

    const positions = KK.riderPositions(schedule, state.selectedTime);
    $('women-status').textContent = positions.women.label;
    $('women-status-detail').textContent = positions.women.detail;
    $('men-status').textContent = positions.men.label;
    $('men-status-detail').textContent = positions.men.detail;
    $('time-range').value = state.selectedTime;
    $('time-value').textContent = f.clock(state.selectedTime);
    routeMap.setTheme(state.theme);
    routeMap.setRiders(positions);
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
    if (state.selectedTime >= end) state.selectedTime = start;
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
    render(); // the timeline is always horizontal on paper
  }

  function endPrintLayout() {
    document.documentElement.classList.remove('is-printing');
    routeMap.refreshSize();
    render();
  }

  /** Builds the PDF in the browser and downloads it. An overlay hides the print layout while it is being made. */
  async function exportPdf() {
    if (state.exporting) return;
    const previousTheme = state.theme;
    const button = $('export-button');
    state.exporting = true;
    button.disabled = true;
    $('export-overlay').hidden = false;
    try {
      setTheme('light', false);
      startPrintLayout();
      await routeMap.snapshotForPrint(true);
      await KK.pdfExport.save(document.querySelector('.page'), document.querySelector('.detail'), 'koolskamp-dagplanner.pdf');
    } catch (e) {
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
    else if (input.type === 'number') {
      const n = Number(input.value);
      if (input.value === '' || !Number.isFinite(n)) return;
      state.settings[key] = n;
    } else state.settings[key] = input.value;
    // The target margin never drops below the minimum margin. Only checked once the value is final
    // (field left, Enter or a stepper click), so typing "45" does not first push the other field to 4.
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
    if (input.type === 'time') input.addEventListener('change', () => readInput(input, true));
    if (input.type === 'number') input.addEventListener('change', () => {
      const n = Number(input.value);
      input.value = clampToInput(input, Number.isFinite(n) && input.value !== '' ? n : state.settings[input.dataset.setting]);
      readInput(input, true);
    });
  });
  document.querySelectorAll('[data-step-for]').forEach(button => button.addEventListener('click', () => {
    const input = document.querySelector(`[data-setting="${button.dataset.stepFor}"]`);
    input.value = clampToInput(input, Number(state.settings[input.dataset.setting]) + Number(button.dataset.step));
    readInput(input, true);
  }));
  $('women-broadcast-reset').addEventListener('click', e => {
    e.preventDefault();
    state.settings.womenBroadcastStart = '';
    saveSettings(); syncInputs(); render();
  });
  $('reset-button').addEventListener('click', () => {
    state.settings = { ...config.defaults };
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
