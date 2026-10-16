// Controller of the Parcourskaart module: load GPX files, style the routes and points, lay out the image
// (title, legend, elevation profile) and export it as a PNG. Everything is kept in this browser (localStorage).
(function () {
  const { config, format: f } = KK;
  const $ = id => document.getElementById(id);
  const esc = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const STORAGE = 'kk-parcours-v1';

  // Image formats: shape (width / height) and the size in pixels for print (300 dpi on paper) and for screens.
  const FORMATS = {
    'a4-l': { file: 'a4-liggend', label: 'A4 liggend', ratio: 297 / 210, print: [3508, 2480], web: [1754, 1240], paper: true },
    'a4-p': { file: 'a4-staand', label: 'A4 staand', ratio: 210 / 297, print: [2480, 3508], web: [1240, 1754], paper: true },
    'a3-l': { file: 'a3-liggend', label: 'A3 liggend', ratio: 420 / 297, print: [4961, 3508], web: [2480, 1754], paper: true },
    'a3-p': { file: 'a3-staand', label: 'A3 staand', ratio: 297 / 420, print: [3508, 4961], web: [1754, 2480], paper: true },
    wide: { file: 'breed', label: 'Breed 16:9 (site, scherm)', ratio: 16 / 9, print: [3840, 2160], web: [1920, 1080] },
    square: { file: 'vierkant', label: 'Vierkant 1:1 (sociale media)', ratio: 1, print: [2160, 2160], web: [1080, 1080] },
    portrait: { file: 'staand-4x5', label: 'Staand 4:5 (Instagram)', ratio: 4 / 5, print: [2160, 2700], web: [1080, 1350] },
  };
  const TYPES = [['start', 'Start'], ['finish', 'Finish'], ['punt', 'Punt'], ['klim', 'Klim'], ['sprint', 'Sprint'], ['voeding', 'Voeding']];
  const SIDES = [['right', 'Rechts'], ['left', 'Links'], ['top', 'Boven'], ['bottom', 'Onder']];
  const COLORS = ['#FFD201', '#18181B', '#7A7A7A', '#E4572E', '#2E86DE', '#2F9E5B'];
  const MAX_AREA = 16.7e6; // Safari cannot make a larger canvas

  const DEFAULTS = {
    title: 'Koolskamp Koers', subtitle: '', format: 'a4-l', quality: 'print', theme: 'licht', width: 'normaal',
    places: true, streets: false, arrows: true, kmTrack: '', kmStep: 5, showTitle: true, showLegend: true, showProfile: true,
    profileSource: '', tracks: [], points: [], view: null,
  };

  const state = load();
  let addMode = false, exporting = false;

  // ---------- Storage ----------

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE) || 'null');
      if (raw && typeof raw === 'object') {
        return { ...DEFAULTS, ...raw,
          tracks: Array.isArray(raw.tracks) ? raw.tracks.filter(t => t && t.id && Array.isArray(t.points) && t.points.length > 1) : [],
          points: Array.isArray(raw.points) ? raw.points.filter(p => p && p.id && Number.isFinite(p.lat) && Number.isFinite(p.lon)) : [] };
      }
    } catch (e) { /* storage unavailable or broken: start fresh */ }
    return { ...DEFAULTS, tracks: [], points: [] };
  }

  function save() {
    try { localStorage.setItem(STORAGE, JSON.stringify(state)); }
    catch (e) { message('De kaart kon niet bewaard worden in deze browser (te groot of een privévenster). Ze blijft staan tot je de pagina sluit.', 'warn'); }
  }

  const newId = prefix => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function message(text, kind = '') {
    const el = $('pm-message');
    el.textContent = text;
    el.dataset.kind = kind;
    el.hidden = !text;
    clearTimeout(message.timer);
    if (text && kind !== 'warn') message.timer = setTimeout(() => { el.hidden = true; }, 6000);
  }

  // ---------- Map ----------

  const pmap = new KK.ParcoursMap($('pm-map'), {
    onMove: view => { state.view = view; save(); },
    onPointMoved: (id, lat, lon) => {
      const p = state.points.find(x => x.id === id);
      if (p) { Object.assign(p, snap(lat, lon)); save(); pmap.setPoints(state.points); }
    },
    onMapClick: (lat, lon) => {
      if (!addMode) return;
      const point = { id: newId('p'), type: 'punt', name: 'Nieuw punt', side: 'right', ...snap(lat, lon) };
      state.points.push(point);
      setAddMode(false);
      changed('points');
      const input = document.querySelector(`[data-point="${point.id}"] [data-field="name"]`);
      if (input) { input.focus(); input.select(); }
    },
    onReady: () => {
      syncMap();
      if (!state.view) fit();
    },
  });

  /** Puts a clicked or dragged point on the nearest route when it is within a few pixels of it. */
  function snap(lat, lon) {
    const map = pmap.map, click = map.project([lon, lat]);
    let best = null, bestD = 24;
    state.tracks.filter(t => t.visible !== false).forEach(t => t.points.forEach(p => {
      const s = map.project([p[1], p[0]]), d = Math.hypot(s.x - click.x, s.y - click.y);
      if (d < bestD) { bestD = d; best = p; }
    }));
    return best ? { lat: best[0], lon: best[1] } : { lat, lon };
  }

  function syncMap(what = 'all') {
    if (what === 'all' || what === 'tracks') pmap.setTracks(state.tracks);
    if (what === 'all' || what === 'points') pmap.setPoints(state.points);
    if (what === 'all' || what === 'tracks' || what === 'km') {
      const track = state.tracks.find(t => t.id === state.kmTrack && t.visible !== false);
      pmap.setKm(track ? { points: track.points, step: Number(state.kmStep) } : null);
    }
  }

  /** Fits the routes in the map, leaving room for the title and the legend. */
  function fit() {
    const wrap = document.querySelector('.pm-mapwrap').getBoundingClientRect();
    const u = parseFloat(getComputedStyle($('pm-artboard')).getPropertyValue('--u')) || 8;
    const title = $('pm-title'), legend = $('pm-legend');
    const top = !title.hidden ? title.getBoundingClientRect().bottom - wrap.top + 2 * u : 3 * u;
    const bottom = !legend.hidden ? wrap.bottom - legend.getBoundingClientRect().top + 2 * u : 3 * u;
    const padding = { top, bottom, left: 4 * u, right: 7 * u };
    if (wrap.height - top - bottom < 80) { padding.top = 3 * u; padding.bottom = 3 * u; }
    pmap.fit(padding);
  }

  // ---------- Routes ----------

  function addTracks(tracks, waypoints = []) {
    const firstLoad = !state.tracks.length;
    tracks.forEach(t => {
      state.tracks.push({ id: newId('t'), name: t.name, color: COLORS[state.tracks.length % COLORS.length], style: 'solid', visible: true, points: t.points });
    });
    waypoints.forEach(w => state.points.push({ id: newId('p'), type: 'punt', name: w.name, side: 'right', lat: w.lat, lon: w.lon }));
    // A first route gets a start and a finish (one point when it ends where it started).
    if (firstLoad && !state.points.length && tracks.length) {
      const pts = tracks[0].points, a = pts[0], z = pts[pts.length - 1];
      if (KK.gpx.haversineKm(a, z) < 0.3) state.points.push({ id: newId('p'), type: 'finish', name: 'Start en finish', side: 'right', lat: a[0], lon: a[1] });
      else {
        state.points.push({ id: newId('p'), type: 'start', name: 'Start', side: 'right', lat: a[0], lon: a[1] });
        state.points.push({ id: newId('p'), type: 'finish', name: 'Finish', side: 'right', lat: z[0], lon: z[1] });
      }
    }
    if (!state.kmTrack && state.tracks.length) state.kmTrack = state.tracks[0].id;
    if (!state.profileSource && state.tracks.length) state.profileSource = state.tracks[0].id;
    changed('all');
    requestAnimationFrame(fit);
  }

  async function loadFiles(files) {
    const gpxFiles = [...files].filter(file => /\.gpx$/i.test(file.name) || file.type.includes('gpx'));
    if (!gpxFiles.length) { message('Kies een GPX-bestand (.gpx).', 'warn'); return; }
    const tracks = [], waypoints = [], errors = [];
    for (const file of gpxFiles) {
      try {
        const result = KK.gpx.parse(await file.text(), file.name);
        tracks.push(...result.tracks);
        waypoints.push(...result.waypoints);
      } catch (e) { errors.push(e.message); }
    }
    if (tracks.length) addTracks(tracks, waypoints);
    const loaded = tracks.length ? `${tracks.length === 1 ? '1 parcours' : `${tracks.length} parcours`} geladen${waypoints.length ? `, ${waypoints.length} punten` : ''}.` : '';
    message([loaded, ...errors].filter(Boolean).join(' '), errors.length ? 'warn' : 'ok');
  }

  /** The three Koolskamp Koers routes with their official lengths, and the start, Kruiskalsijde and finish. */
  function loadPreset() {
    const r = KK.routeData, strip = pts => pts.map(p => [p[0], p[1], p[2] || 0]);
    state.tracks = state.tracks.filter(t => !t.id.startsWith('kk-'));
    state.points = state.points.filter(p => !String(p.id).startsWith('kk-'));
    state.tracks.unshift(
      { id: 'kk-lap', name: 'Lokale ronde', color: '#FFD201', style: 'solid', visible: true, km: config.distances.localLap, points: strip(r.localLap) },
      { id: 'kk-approach', name: 'Aanloop naar de finish', color: '#7A7A7A', style: 'solid', visible: true, km: config.distances.approachToFinish, points: strip(r.approach) },
      { id: 'kk-loop', name: 'Lus Ardooie', color: '#18181B', style: 'dashed', visible: true, km: config.distances.ardooieLoop, points: strip(r.ardooieLoop) },
    );
    state.points.push(
      { id: 'kk-start', type: 'start', name: 'Start Ardooie', side: 'left', lat: r.ardooieLoop[0][0], lon: r.ardooieLoop[0][1] },
      { id: 'kk-kruis', type: 'punt', name: 'Kruiskalsijde', side: 'right', lat: r.kruiskalsijde[0], lon: r.kruiskalsijde[1] },
      { id: 'kk-finish', type: 'finish', name: 'Finish Koolskamp', side: 'top', lat: r.localLap[0][0], lon: r.localLap[0][1] },
    );
    if (!state.title || state.title === DEFAULTS.title) state.title = 'Koolskamp Koers';
    if (!state.subtitle) state.subtitle = 'Kampioenschap van Vlaanderen';
    state.kmTrack = 'kk-lap';
    state.kmStep = 5;
    state.profileSource = 'kk-men';
    changed('all');
    requestAnimationFrame(fit);
    message('De parcours van Koolskamp Koers zijn geladen.', 'ok');
  }

  const trackKm = t => t.km || KK.gpx.lengthKm(t.points);

  // ---------- Elevation profile ----------

  /** Profile sources: every route, and for the Koolskamp routes the full women's and men's race. */
  function profileOptions() {
    const options = state.tracks.map(t => [t.id, t.name]);
    const has = id => state.tracks.some(t => t.id === id);
    if (has('kk-lap') && has('kk-approach')) {
      const d = config.defaults, lap = config.distances.localLap, approach = config.distances.approachToFinish, loop = config.distances.ardooieLoop;
      if (has('kk-loop')) options.unshift(['kk-men', `Volledige koers mannen (${f.km(d.menLoops * loop + approach + d.menLaps * lap)} km)`]);
      options.unshift(['kk-women', `Volledige koers vrouwen (${f.km(approach + d.womenLaps * lap)} km)`]);
    }
    return options;
  }

  /** The parts of the chosen profile: [{ points, km }] and the colour of the profile. */
  function profileParts() {
    const byId = id => state.tracks.find(t => t.id === id);
    const d = config.defaults;
    const repeat = (track, n) => Array.from({ length: n }, () => ({ points: track.points, km: track.km }));
    if (state.profileSource === 'kk-men' || state.profileSource === 'kk-women') {
      const lap = byId('kk-lap'), approach = byId('kk-approach'), loop = byId('kk-loop');
      if (!lap || !approach) return null;
      const men = state.profileSource === 'kk-men';
      if (men && !loop) return null;
      return { parts: [...(men ? repeat(loop, d.menLoops) : []), { points: approach.points, km: approach.km }, ...repeat(lap, men ? d.menLaps : d.womenLaps)], color: lap.color,
        name: men ? 'Mannen' : 'Vrouwen' };
    }
    const track = byId(state.profileSource) || state.tracks[0];
    return track ? { parts: [{ points: track.points, km: track.km }], color: track.color, name: track.name } : null;
  }

  function renderProfile() {
    const el = $('pm-profile');
    el.hidden = !state.showProfile || !state.tracks.length;
    if (el.hidden) return;
    const source = profileParts();
    const W = el.clientWidth, H = el.clientHeight;
    if (!source || W < 50) { el.innerHTML = ''; return; }
    const p = KK.gpx.profile(source.parts);
    if (!p.hasElevation) { el.innerHTML = '<div class="pm-profile__empty">Dit GPX-bestand heeft geen hoogtegegevens.</div>'; return; }
    const u = parseFloat(getComputedStyle($('pm-artboard')).getPropertyValue('--u')) || 8;
    const L = 6.2 * u, R = 2.4 * u, T = 4.6 * u, B = 3.2 * u;
    const top = Math.max(...p.ele), yMax = Math.max(100, Math.ceil((top + 10) / 50) * 50);
    const x = km => L + (km / p.totalKm) * (W - L - R), y = e => T + (1 - Math.max(0, e) / yMax) * (H - T - B);
    const line = p.km.map((k, i) => `${i ? 'L' : 'M'}${x(k).toFixed(1)},${y(p.ele[i]).toFixed(1)}`).join('');
    const area = `${line}L${x(p.totalKm).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`;
    const yStep = yMax > 300 ? 100 : 50, grid = [];
    for (let e = 0; e <= yMax; e += yStep) {
      grid.push(`<line class="pm-profile__grid" x1="${L}" x2="${W - R}" y1="${y(e)}" y2="${y(e)}"/><text class="pm-profile__axis" x="${L - 0.8 * u}" y="${y(e) + 0.45 * u}" text-anchor="end">${e} m</text>`);
    }
    const steps = [1, 2, 5, 10, 20, 25, 50, 100], xStep = steps.find(s => p.totalKm / s <= 12) || 100, ticks = [];
    for (let k = 0; k <= p.totalKm + 1e-6; k += xStep) ticks.push(`<text class="pm-profile__axis" x="${x(k)}" y="${H - 0.9 * u}" text-anchor="middle">${f.km(k)}</text>`);
    const border = KK.ParcoursMap.borderFor(source.color, pmap.theme);
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="--fs:${(1.55 * u).toFixed(1)}px">
      <text class="pm-profile__title" x="${L}" y="${2.6 * u}"><tspan class="pm-profile__name">Hoogteprofiel ${esc(source.name)}</tspan><tspan dx="${1.2 * u}">${f.km(Math.round(p.totalKm * 10) / 10)} km, klim ongeveer ${Math.round(p.climb / 10) * 10} m</tspan></text>
      ${grid.join('')}
      <path d="${area}" fill="${source.color}" fill-opacity="0.85"/>
      <path d="${line}" fill="none" stroke="${border}" stroke-width="${Math.max(1, 0.18 * u).toFixed(2)}" stroke-linejoin="round"/>
      <line class="pm-profile__base" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>
      ${ticks.join('')}
      <text class="pm-profile__axis" x="${W - R}" y="${H - 0.9 * u}" text-anchor="end" dy="0">km</text>
    </svg>`;
  }

  // ---------- Layout of the image ----------

  /** The image keeps the shape of the chosen format and fills the space next to the sidebar. */
  function layout() {
    const format = FORMATS[state.format] || FORMATS['a4-l'];
    const stage = $('pm-stage'), art = $('pm-artboard');
    const availW = stage.clientWidth, availH = Math.max(380, window.innerHeight - 60 - 64);
    let w = availW, h = w / format.ratio;
    if (h > availH) { h = availH; w = h * format.ratio; }
    w = Math.max(560, Math.floor(w));
    h = Math.floor(w / format.ratio);
    art.style.width = `${w}px`;
    art.style.height = `${h}px`;
    art.style.setProperty('--u', `${(Math.min(w, h) / 100).toFixed(3)}px`);
  }

  function renderArtboard() {
    const art = $('pm-artboard'), theme = KK.ParcoursMap.THEMES[state.theme] || KK.ParcoursMap.THEMES.licht;
    art.dataset.dark = theme.dark ? 'true' : 'false';
    $('pm-title').hidden = !state.showTitle || !(state.title || state.subtitle);
    $('pm-title-main').textContent = state.title;
    $('pm-title-sub').textContent = state.subtitle;
    $('pm-title-sub').hidden = !state.subtitle;
    const visible = state.tracks.filter(t => t.visible !== false);
    $('pm-legend').hidden = !state.showLegend || !visible.length;
    $('pm-legend').innerHTML = visible.map(t => {
      const border = KK.ParcoursMap.borderFor(t.color, theme.original ? KK.ParcoursMap.THEMES.licht : theme);
      return `<div class="pm-legend__item"><svg class="pm-legend__line" viewBox="0 0 40 10" aria-hidden="true"><line x1="3" y1="5" x2="37" y2="5" stroke="${border}" stroke-width="7.5" stroke-linecap="round"/><line x1="3" y1="5" x2="37" y2="5" stroke="${t.color}" stroke-width="4.5" stroke-linecap="${t.style === 'dashed' ? 'butt' : 'round'}"${t.style === 'dashed' ? ' stroke-dasharray="7 4"' : ''}/></svg><span>${esc(t.name)}</span><span class="pm-legend__km">${f.km(Math.round(trackKm(t) * 10) / 10)} km</span></div>`;
    }).join('');
    renderProfile();
    const [w, h] = targetSize();
    const format = FORMATS[state.format];
    $('pm-size').textContent = `${w} × ${h} px${format.paper ? (state.quality === 'print' ? ', 300 dpi op papier' : ', 150 dpi op papier') : ''}`;
  }

  /** Size of the exported image in pixels, at most MAX_AREA pixels. */
  function targetSize() {
    const format = FORMATS[state.format] || FORMATS['a4-l'];
    let [w, h] = format[state.quality === 'web' ? 'web' : 'print'];
    if (w * h > MAX_AREA) { const k = Math.sqrt(MAX_AREA / (w * h)); w = Math.floor(w * k); h = Math.floor(h * k); }
    return [w, h];
  }

  // ---------- Sidebar ----------

  const eyeIcon = on => on
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.4 10.4 0 0 1 12 19c-6.4 0-10-7-10-7a18 18 0 0 1 4.1-5.1M9.9 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a18 18 0 0 1-2.2 3.2"/><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2"/><path d="M2 2l20 20"/></svg>';
  const options = (list, value) => list.map(([v, label]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(label)}</option>`).join('');

  function renderLists() {
    $('pm-tracks').innerHTML = state.tracks.length ? state.tracks.map((t, i) => `
      <div class="pm-track${t.visible === false ? ' is-hidden' : ''}" data-track="${esc(t.id)}">
        <div class="pm-track__top">
        <input type="color" class="pm-color" data-field="color" value="${esc(t.color)}" aria-label="Kleur van ${esc(t.name)}">
        <input type="text" class="pm-text pm-track__name" data-field="name" value="${esc(t.name)}" maxlength="60" aria-label="Naam van het parcours">
        </div>
        <div class="pm-track__meta"><select class="pm-mini" data-field="style" aria-label="Stijl van de lijn">${options([['solid', 'Doorlopend'], ['dashed', 'Gestreept']], t.style)}</select><span class="pm-track__km">${f.km(Math.round(trackKm(t) * 10) / 10)} km</span>
        <button type="button" class="pm-icon" data-action="toggle" aria-pressed="${t.visible !== false}" title="Tonen of verbergen">${eyeIcon(t.visible !== false)}</button>
        <button type="button" class="pm-icon" data-action="up" title="Naar boven (bovenop)"${i === 0 ? ' disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg></button>
        <button type="button" class="pm-icon" data-action="delete" title="Verwijderen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        </div>
      </div>`).join('') : '<p class="settings__note">Nog geen parcours. Laad een GPX of de parcours van Koolskamp Koers.</p>';

    $('pm-points').innerHTML = state.points.map(p => `
      <div class="pm-point-row" data-point="${esc(p.id)}">
        <select class="pm-mini" data-field="type" aria-label="Soort punt">${options(TYPES, p.type)}</select>
        <input type="text" class="pm-text" data-field="name" value="${esc(p.name)}" maxlength="60" aria-label="Naam van het punt">
        <select class="pm-mini" data-field="side" aria-label="Plaats van het label">${options(SIDES, p.side || 'right')}</select>
        <button type="button" class="pm-icon" data-action="delete-point" title="Verwijderen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>`).join('');

    $('pm-km-track').innerHTML = options([['', 'Geen'], ...state.tracks.map(t => [t.id, t.name])], state.kmTrack);
    $('pm-profile-source').innerHTML = options(profileOptions(), state.profileSource);
    $('pm-km-step').value = String(state.kmStep);
  }

  function syncControls() {
    $('pm-theme').value = state.theme;
    $('pm-width').value = state.width;
    $('pm-places').checked = state.places;
    $('pm-streets').checked = state.streets;
    $('pm-arrows').checked = state.arrows;
    $('pm-format').value = state.format;
    $('pm-quality').value = state.quality;
    $('pm-show-title').checked = state.showTitle;
    $('pm-show-legend').checked = state.showLegend;
    $('pm-show-profile').checked = state.showProfile;
    if (document.activeElement !== $('pm-title-input')) $('pm-title-input').value = state.title;
    if (document.activeElement !== $('pm-subtitle-input')) $('pm-subtitle-input').value = state.subtitle;
  }

  /** After a change: save, update the sidebar where needed, the image and the map. */
  function changed(what = 'all', { lists = true } = {}) {
    save();
    if (lists) renderLists();
    renderArtboard();
    if (what !== 'none') syncMap(what);
  }

  function setAddMode(on) {
    addMode = on;
    $('pm-add-point').setAttribute('aria-pressed', String(on));
    $('pm-add-point').textContent = on ? 'Klik op de kaart' : 'Punt toevoegen';
    $('pm-add-hint').hidden = !on;
    $('pm-artboard').classList.toggle('is-adding', on);
  }

  // ---------- Export ----------

  async function exportPng() {
    if (exporting) return;
    if (!state.tracks.length) { message('Laad eerst een parcours.', 'warn'); return; }
    exporting = true;
    const art = $('pm-artboard'), img = $('pm-snapshot');
    $('export-overlay').hidden = false;
    setAddMode(false);
    try {
      const [w] = targetSize();
      const shot = await pmap.render(w / art.clientWidth);
      pmap.map.getCanvas().after(img); // inside the map, under the points and kilometre markers
      img.src = shot.url;
      await img.decode();
      art.classList.add('is-exporting');
      const theme = KK.ParcoursMap.THEMES[state.theme] || KK.ParcoursMap.THEMES.licht;
      const canvas = await KK.pdfExport.capture(art, { pixelRatio: shot.ratio, backgroundColor: theme.dark ? '#141518' : '#FFFFFF' });
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const slug = (state.title || 'parcours').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'parcours';
      const name = `${slug}-${FORMATS[state.format].file}.png`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 10000);
      message(`Opgeslagen als ${name} (${canvas.width} × ${canvas.height} px).`, 'ok');
    } catch (e) {
      message('De afbeelding kon niet gemaakt worden. Controleer je internetverbinding en probeer opnieuw.', 'warn');
    } finally {
      art.classList.remove('is-exporting');
      img.removeAttribute('src');
      pmap.restore();
      $('export-overlay').hidden = true;
      exporting = false;
    }
  }

  // ---------- Wiring ----------

  $('pm-theme').innerHTML = options(Object.entries(KK.ParcoursMap.THEMES).map(([k, t]) => [k, t.label]), state.theme);
  $('pm-format').innerHTML = options(Object.entries(FORMATS).map(([k, v]) => [k, v.label]), state.format);

  $('pm-file').addEventListener('change', e => { loadFiles(e.target.files); e.target.value = ''; });
  $('pm-preset').addEventListener('click', loadPreset);
  $('pm-reset').addEventListener('click', () => {
    if (!window.confirm('Alle parcours, punten en instellingen van de kaart wissen?')) return;
    Object.assign(state, { ...DEFAULTS, tracks: [], points: [] });
    syncControls();
    pmap.setOptions({ theme: state.theme, places: state.places, streets: state.streets, arrows: state.arrows, width: state.width });
    layout();
    changed('all');
  });

  $('pm-tracks').addEventListener('input', e => {
    const row = e.target.closest('[data-track]'), field = e.target.dataset.field;
    const track = row && state.tracks.find(t => t.id === row.dataset.track);
    if (!track || !field) return;
    track[field] = e.target.value;
    // Typing a name only changes the legend; the list is not redrawn, so the field keeps its focus.
    changed(field === 'name' ? 'none' : 'tracks', { lists: field !== 'name' && field !== 'color' });
  });
  $('pm-tracks').addEventListener('click', e => {
    const button = e.target.closest('[data-action]'), row = e.target.closest('[data-track]');
    if (!button || !row) return;
    const i = state.tracks.findIndex(t => t.id === row.dataset.track);
    if (i < 0) return;
    const action = button.dataset.action;
    if (action === 'toggle') state.tracks[i].visible = state.tracks[i].visible === false;
    else if (action === 'up' && i > 0) state.tracks.splice(i - 1, 0, state.tracks.splice(i, 1)[0]);
    else if (action === 'delete') {
      if (!window.confirm(`"${state.tracks[i].name}" verwijderen?`)) return;
      const [removed] = state.tracks.splice(i, 1);
      if (state.kmTrack === removed.id) state.kmTrack = '';
      if (state.profileSource === removed.id) state.profileSource = state.tracks[0] ? state.tracks[0].id : '';
    }
    changed('tracks');
  });

  $('pm-points').addEventListener('input', e => {
    const row = e.target.closest('[data-point]'), field = e.target.dataset.field;
    const point = row && state.points.find(p => p.id === row.dataset.point);
    if (!point || !field) return;
    point[field] = e.target.value;
    changed('points', { lists: false });
  });
  $('pm-points').addEventListener('click', e => {
    const button = e.target.closest('[data-action="delete-point"]'), row = e.target.closest('[data-point]');
    if (!button || !row) return;
    state.points = state.points.filter(p => p.id !== row.dataset.point);
    changed('points');
  });
  $('pm-add-point').addEventListener('click', () => setAddMode(!addMode));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && addMode) setAddMode(false); });

  const mapOption = (id, key, prop = 'checked') => $(id).addEventListener('change', e => {
    state[key] = e.target[prop];
    pmap.setOptions({ [key]: state[key] });
    changed('none', { lists: false });
  });
  mapOption('pm-theme', 'theme', 'value');
  mapOption('pm-width', 'width', 'value');
  mapOption('pm-places', 'places');
  mapOption('pm-streets', 'streets');
  mapOption('pm-arrows', 'arrows');
  $('pm-km-track').addEventListener('change', e => { state.kmTrack = e.target.value; changed('km', { lists: false }); });
  $('pm-km-step').addEventListener('change', e => { state.kmStep = Number(e.target.value); changed('km', { lists: false }); });
  $('pm-fit').addEventListener('click', fit);

  $('pm-format').addEventListener('change', e => {
    state.format = e.target.value;
    layout();
    changed('none', { lists: false });
    setTimeout(fit, 60); // after the map has its new size
  });
  $('pm-quality').addEventListener('change', e => { state.quality = e.target.value; changed('none', { lists: false }); });
  $('pm-title-input').addEventListener('input', e => { state.title = e.target.value; changed('none', { lists: false }); });
  $('pm-subtitle-input').addEventListener('input', e => { state.subtitle = e.target.value; changed('none', { lists: false }); });
  [['pm-show-title', 'showTitle'], ['pm-show-legend', 'showLegend'], ['pm-show-profile', 'showProfile']].forEach(([id, key]) =>
    $(id).addEventListener('change', e => { state[key] = e.target.checked; changed('none', { lists: false }); }));
  $('pm-profile-source').addEventListener('change', e => { state.profileSource = e.target.value; changed('none', { lists: false }); });
  $('pm-export').addEventListener('click', exportPng);
  $('pm-export-top').addEventListener('click', exportPng);

  // GPX files dropped on the image.
  const stage = $('pm-stage');
  stage.addEventListener('dragover', e => { e.preventDefault(); stage.classList.add('is-dropping'); });
  stage.addEventListener('dragleave', e => { if (!stage.contains(e.relatedTarget)) stage.classList.remove('is-dropping'); });
  stage.addEventListener('drop', e => { e.preventDefault(); stage.classList.remove('is-dropping'); loadFiles(e.dataTransfer.files); });

  // The page theme (light or dark), shared with Raceday.
  function setPageTheme(theme, persist) {
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll('[data-theme-choice]').forEach(b => b.classList.toggle('is-active', b.dataset.themeChoice === theme));
    if (persist) try { localStorage.setItem(config.themeStorageKey, theme); } catch (e) { /* storage unavailable */ }
  }
  let pageTheme = null;
  try { pageTheme = localStorage.getItem(config.themeStorageKey); } catch (e) { /* storage unavailable */ }
  setPageTheme(pageTheme === 'light' || pageTheme === 'dark' ? pageTheme : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'), false);
  document.querySelectorAll('[data-theme-choice]').forEach(b => b.addEventListener('click', () => setPageTheme(b.dataset.themeChoice, true)));

  const released = new Date(`${config.released}T12:00:00`).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' });
  $('credits-version').textContent = `v${config.version}`;
  $('credits-version').parentElement.insertAdjacentHTML('afterend', `<span class="credits__sep" aria-hidden="true">·</span><span>bijgewerkt op ${released}</span>`);

  let resizeTimer = null;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { layout(); renderArtboard(); }, 120); });

  syncControls();
  renderLists();
  layout();
  renderArtboard();
  pmap.setOptions({ theme: state.theme, places: state.places, streets: state.streets, arrows: state.arrows, width: state.width });
  if (window.maplibregl) {
    try { pmap.init(state.view); } catch (e) { $('pm-map').classList.add('route__map--unavailable'); }
  }
})();
