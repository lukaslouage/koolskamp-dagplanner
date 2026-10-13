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

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(config.storageKey) || '{}');
      return { ...config.defaults, ...saved };
    } catch (e) {
      return { ...config.defaults };
    }
  }

  function saveSettings() {
    try { localStorage.setItem(config.storageKey, JSON.stringify(state.settings)); } catch (e) { /* storage unavailable */ }
  }

  function loadTheme() {
    const saved = localStorage.getItem(config.themeStorageKey);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function setTheme(theme, persist = true) {
    state.theme = theme;
    if (persist) localStorage.setItem(config.themeStorageKey, theme);
    render();
  }

  function syncInputs() {
    document.querySelectorAll('[data-setting]').forEach(input => {
      const value = state.settings[input.dataset.setting];
      if (document.activeElement !== input) input.value = value ?? '';
    });
  }

  function render() {
    const s = state.settings;
    const schedule = KK.computeSchedule(s);
    const { women, men, margin } = schedule;

    document.documentElement.dataset.theme = state.theme;
    document.documentElement.dataset.status = margin.status;
    document.querySelectorAll('[data-theme-choice]').forEach(b => b.classList.toggle('is-active', b.dataset.themeChoice === state.theme));

    $('women-speed-value').textContent = f.km(Number(s.womenSpeed));
    $('men-speed-value').textContent = f.km(Number(s.menSpeed));
    $('women-broadcast-auto').hidden = !!s.womenBroadcastStart;
    $('women-broadcast-reset').hidden = !s.womenBroadcastStart;

    $('women-finish').textContent = f.clock(women.finish);
    $('women-finish-detail').textContent = `${f.km(women.totalKm)} km aan ${f.km(women.speed)} km/u, podium tot ${f.clock(women.podiumEnd)}`;
    $('men-finish').textContent = f.clock(men.finish);
    $('men-finish-detail').textContent = `${f.km(men.totalKm)} km aan ${f.km(men.speed)} km/u, podium tot ${f.clock(men.podiumEnd)}`;
    $('men-first-passage').textContent = f.clock(men.firstPassageTime);
    $('men-first-passage-detail').textContent = `Km ${f.km(men.firstPassageKm)}, Kruiskalsijde (km ${f.km(men.kruiskalsijdeKm)}) om ${f.clock(men.kruiskalsijdeTime)}`;

    const range = `van ${f.clock(margin.from)} tot ${f.clock(margin.to)}`;
    $('margin-value').textContent = `${margin.minutes} min`;
    $('margin-detail').textContent = margin.conflict ? 'Conflict: omloop niet vrij'
      : margin.status === 'ok' ? `Ruim, ${range}` : margin.status === 'warn' ? `Krap, ${range}` : `Te krap, ${range}`;

    $('women-total').textContent = `${f.km(women.totalKm)} km`;
    $('men-total').textContent = `${f.km(men.totalKm)} km`;
    $('loop-legend').textContent = `Lus Ardooie, mannen ${men.loops} keer (16 km)`;

    $('print-summary').innerHTML = [
      `Vrouwen: start ${f.clock(women.start)}, ${f.km(women.speed)} km/u, ${women.laps} rondes, ${f.km(women.totalKm)} km`,
      `Mannen: start ${f.clock(men.start)}, ${f.km(men.speed)} km/u, ${men.loops} lussen Ardooie, ${men.laps} rondes, ${f.km(men.totalKm)} km`,
      `Podium ${Number(s.podiumDuration) || 0} min`,
    ].map(t => `<span>${t}</span>`).join('');

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
    $('print-map-time').textContent = `om ${f.clock(state.selectedTime)}`;
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

  function exportPdf() {
    const previousTheme = state.theme;
    setTheme('light', false);
    const restore = () => { window.removeEventListener('afterprint', restore); setTheme(previousTheme, false); };
    window.addEventListener('afterprint', restore);
    setTimeout(() => { routeMap.refreshSize(); window.print(); }, 400);
  }

  // Wiring
  document.querySelectorAll('[data-setting]').forEach(input => {
    input.addEventListener('input', () => {
      const key = input.dataset.setting;
      state.settings[key] = input.type === 'range' ? Number(input.value) : input.value;
      saveSettings();
      render();
    });
  });
  $('women-broadcast-reset').addEventListener('click', e => {
    e.preventDefault();
    state.settings.womenBroadcastStart = '';
    saveSettings(); syncInputs(); render();
  });
  $('settings-toggle').addEventListener('click', () => {
    const panel = $('settings-panel');
    panel.hidden = !panel.hidden;
    $('settings-icon').textContent = panel.hidden ? '+' : '−';
    $('settings-toggle').setAttribute('aria-expanded', String(!panel.hidden));
  });
  $('reset-button').addEventListener('click', () => {
    state.settings = { ...config.defaults };
    saveSettings(); syncInputs(); render();
  });
  document.querySelectorAll('[data-theme-choice]').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.themeChoice)));
  $('time-range').addEventListener('input', e => { state.selectedTime = Number(e.target.value); render(); });
  $('play-button').addEventListener('click', togglePlayback);
  $('export-button').addEventListener('click', exportPdf);

  syncInputs();
  render();
})();
